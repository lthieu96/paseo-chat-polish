import assert from "node:assert/strict";
import { test } from "node:test";
import { followAgent, onStaleSteps, placeStep, runOf, stepKey, subscribeRun } from "../client/steps.ts";

const tool = (id, output = "ok") => ({ type: "tool_call", callId: id, name: "Bash", status: "completed", error: null, detail: { type: "shell", command: "echo ok", output } });
const tick = () => new Promise(setImmediate);

async function follow(items, id) {
  let handler;
  const subscription = Object.assign(() => {}, { ready: Promise.resolve() });
  const stop = followAgent({ agents: { ref: () => ({ timeline: {
    refetch: async () => ({ entries: items.map((item, i) => ({ item, timestamp: new Date(i).toISOString() })), endCursor: { seq: items.length } }),
    subscribe: (h) => (handler = h, subscription),
  } }) } }, id);
  await tick();
  return { stop, send: (item) => handler({ event: { type: "timeline", item } }) };
}

test("streaming a tool notifies only its changed run", async (t) => {
  const items = [];
  const heads = [];
  for (let i = 0; i < 333; i++) {
    const item = tool(`history-${i}`);
    heads.push(stepKey(item));
    items.push({ type: "user_message", text: "go" }, item, { type: "assistant_message", text: "done" });
  }
  items.push(tool("active"));
  const live = await follow(items, "notifications");
  t.after(live.stop);
  let old = 0;
  let active = 0;
  const unsubscribes = heads.map((head) => subscribeRun(head, () => old++));
  unsubscribes.push(subscribeRun("t:active", () => active++));
  t.after(() => unsubscribes.forEach((u) => u()));
  live.send(tool("active", "changed"));
  await tick();
  assert.equal(old, 0);
  assert.equal(active, 1);
});

test("live history evicts old turns, restores their rows, and preserves the active turn", async (t) => {
  const first = tool("evicted-first");
  const second = tool("evicted-second");
  const live = await follow([{ type: "user_message", text: "go" }, first, second, { type: "assistant_message", text: "done" }], "history-bound");
  t.after(live.stop);
  assert.equal(placeStep(second, "complete").as, "none");
  assert.equal(placeStep(first, "complete").as, "head");
  let stale = 0;
  onStaleSteps(() => stale++);
  t.after(() => onStaleSteps(() => {}));
  for (let i = 0; i < 500; i++) {
    live.send({ type: "user_message", text: "go" });
    live.send(tool(`turn-${i}`));
    live.send({ type: "assistant_message", text: "done" });
  }
  assert.deepEqual(runOf(stepKey(first)).steps, []);
  assert.ok(stale > 0, "evicted hidden rows must be transformed again");
  assert.equal(placeStep(second, "complete").as, "head");
  placeStep(tool("turn-499"), "complete");
  stale = 0;
  live.send({ type: "user_message", text: "long active turn" });
  for (let i = 0; i < 1100; i++) live.send(tool(`long-${i}`));
  assert.equal(runOf("t:long-0").steps.length, 1100, "do not cut a live run in half");
  assert.ok(stale > 0, "evicted singleton rows must be transformed again too");
  placeStep(tool("long-0"), "complete");
  live.stop();
  assert.deepEqual(runOf("t:long-0").steps, []);
});

test("each run starts its own clock after a restored timestamp in an earlier run", async () => {
  const { stepRuns } = await import("../client/steps.ts");
  const list = [
    { item: { type: "user_message", text: "old turn" }, at: 1000 },
    { item: tool("restored"), at: 2 * 86400000 },
    { item: { type: "assistant_message", text: "reply" }, at: 2000 },
    { item: tool("next-a"), at: 3000 },
    { item: tool("next-b"), at: 44801 },
    { item: { type: "assistant_message", text: "done" }, at: 45000 },
  ];
  const runs = stepRuns(list, () => false);
  assert.equal(runs[1].ms, 42801);
});

test("history excludes import timestamps beyond the next prompt or the idle agent's last update", async () => {
  const { historyEntries, stepRuns } = await import("../client/steps.ts");
  const entries = [
    [{ type: "user_message", text: "first" }, "2026-10-15T10:00:00Z"],
    [tool("replayed-time"), "2026-10-17T13:43:04Z"],
    [{ type: "assistant_message", text: "reply" }, "2026-10-15T10:00:10Z"],
    [{ type: "user_message", text: "next" }, "2026-10-15T10:01:00Z"],
    [tool("valid-a"), "2026-10-15T10:01:05Z"],
    [tool("valid-b"), "2026-10-15T10:01:43Z"],
    [{ type: "assistant_message", text: "reply" }, "2026-10-15T10:01:44Z"],
    [{ type: "user_message", text: "last" }, "2026-10-15T10:02:00Z"],
    [tool("last-replayed-time"), "2026-10-17T13:43:04Z"],
    [{ type: "assistant_message", text: "done" }, "2026-10-17T13:43:04Z"],
  ].map(([item, timestamp]) => ({ item, timestamp }));
  const runs = stepRuns(historyEntries(entries, "2026-10-15T10:02:10Z"), () => false);
  assert.equal(runs[0].ms, undefined, "do not guess a duration for restored timestamps");
  assert.equal(runs[1].ms, 43000);
  assert.equal(runs[2].ms, undefined);
  assert.equal(stepRuns(historyEntries(entries), () => false)[0].ms, undefined, "the next prompt also bounds history while an agent runs");
  const missing = historyEntries([{ item: tool("missing-time"), timestamp: "invalid" }]);
  assert.equal(stepRuns(missing, () => false)[0].ms, undefined);
  // Back-to-back replies (two screenshots) are one message in the app, so they are one entry here, keyed by the joined text.
  // Like Paseo, a reply with its own message id starts a new message.
  const reply = (text, messageId) => ({ type: "assistant_message", text, ...(messageId ? { messageId } : {}) });
  const shots = historyEntries([[tool("a"), "x"], [reply("![a](a.png)"), "x"], [reply("![b](b.png)"), "x"], [reply("Done.", "m1"), "x"], [reply(" More.", "m1"), "x"]].map(([item, timestamp]) => ({ item, timestamp })));
  assert.deepEqual(shots.map((e) => e.item.type === "assistant_message" ? e.item.text : e.item.type), ["tool_call", "![a](a.png)![b](b.png)", "Done. More."]);
});

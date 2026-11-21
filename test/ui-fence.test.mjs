import assert from "node:assert/strict";
import { test } from "node:test";
import { hasUiFence } from "../shared/ui-fence.ts";

const tool = (detail, extra = {}) => ({ type: "tool_call", callId: "1", name: "Bash", status: "completed", error: null, detail, ...extra });
const reply = (text) => ({ type: "assistant_message", text });
const uiReply = reply('Here is the status.\n\n```ui\nCard("Live", [Metric("Entities", "68")])\n```');

test("hasUiFence: opens on ui/app, ignores lookalikes and quoted fences", () => {
  assert.equal(hasUiFence(uiReply.text), true);
  assert.equal(hasUiFence('```app\n<b>hi</b>\n```'), true);
  assert.equal(hasUiFence('~~~UI\nCard("Hi", [])\n~~~'), true);
  assert.equal(hasUiFence("Just **markdown**"), false);
  assert.equal(hasUiFence("```ts\nconst one = 1;\n```"), false);
  assert.equal(hasUiFence("```ui.json\n{}\n```"), false);
  assert.equal(hasUiFence("```uish\nnot the ui language\n```"), false);
  assert.equal(hasUiFence("Text with ```ui mid-line is none"), false);
  // A ui fence quoted inside another language's block is code, not a handover.
  assert.equal(hasUiFence("```markdown\n```ui\nCard()\n```\n```"), false);
  // While streaming, the opening line still being typed waits for its newline.
  assert.equal(hasUiFence('Intro\n\n```ui', "streaming"), false);
  assert.equal(hasUiFence('Intro\n\n```ui\nCard("Hi", [])', "streaming"), true);
});

test("steps: a ui reply never folds into a run and ends it; the steps after it still merge", async () => {
  const { stepRuns, stepKey } = await import("../client/steps.ts");
  const list = [
    { type: "user_message", text: "go" },
    tool({ type: "shell", command: "ls" }, { callId: "a" }),
    uiReply,
    tool({ type: "shell", command: "pwd" }, { callId: "b" }),
    reply("Done."),
  ].map((item, i) => ({ item, at: i * 1000 }));
  // With Collapse turns the ui reply stays out of both runs; the run after it keeps its head.
  assert.deepEqual(stepRuns(list, () => false, true).map((r) => r.steps.map(stepKey)), [["t:a"], ["t:b"]]);
  assert.deepEqual(stepRuns(list, () => false, false).map((r) => r.steps.map(stepKey)), [["t:a"], ["t:b"]]);
});

test("steps: placeStep leaves a ui reply to the live-UI renderer even when a run holds its key", async () => {
  const { followAgent, placeStep, resetMade, setReplyFolding, stepKey } = await import("../client/steps.ts");
  const a = tool({ type: "shell", command: "ls" }, { callId: "a" });
  const entries = [
    { type: "user_message", text: "go" },
    a,
    reply("Working on it."),
    tool({ type: "shell", command: "pwd" }, { callId: "b" }),
    uiReply,
    reply("All done."),
  ].map((item, i) => ({ item, timestamp: new Date(i * 1000).toISOString() }));
  let ready;
  const subscription = Object.assign(() => {}, { ready: new Promise((r) => (ready = r)) });
  const paseo = { agents: { ref: () => ({ timeline: { refetch: async () => ({ entries, endCursor: { seq: 0 } }), subscribe: () => subscription } }) } };
  setReplyFolding(true);
  const stop = followAgent(paseo, "ui-fence-agent");
  ready();
  await new Promise((r) => setTimeout(r, 0));
  resetMade();
  // The plain reply before the turn's last folds into the run...
  assert.equal(placeStep(reply("Working on it."), "complete")?.as, "none");
  // ...but the ui reply is never claimed, complete or streaming, so genui renders it.
  assert.equal(placeStep(uiReply, "complete"), undefined);
  assert.equal(placeStep(uiReply, "streaming"), undefined);
  assert.equal(stepKey(uiReply).startsWith("m:"), true);
  stop();
  setReplyFolding(false);
});

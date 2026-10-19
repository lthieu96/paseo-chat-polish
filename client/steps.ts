import type { PluginClientContext } from "@getpaseo/plugin/client";
import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";

// Merged steps: each run of consecutive thoughts and tool calls between replies folds into one row.
// A transformer sees one item at a time, so the runs come from each open agent's own timeline (fetched
// and followed live); the transformer looks its item up here: the run's first step becomes the merged
// row, the others are removed from the list (never hidden in place: that crashed Paseo's virtual list).

type Item = AgentTimelineItem;
export type Phase = "streaming" | "complete";
/** A timeline item and when it last changed (ms). */
export interface Entry {
  item: Item;
  /** Unknown when restored history supplies an import time instead of the event time. */
  at?: number;
}
export interface Run {
  steps: Item[];
  /** From the end of what came before the run to the last step's latest update. */
  ms?: number;
  /** Nothing has come after the run yet: while the agent works, its next step may still join. */
  open: boolean;
}

const toolName = (item: Extract<Item, { type: "tool_call" }>) => item.name.trim().replace(/[.\s-]+/g, "_").toLowerCase();
// What the app does before any plugin sees a call: these become its todo list (so they end a run like other items)...
const TODO_TOOLS = new Set(["todowrite", "todo_write", "update_plan"]);
// ...and Claude's task tools are dropped outright. The daemon timeline still has them, so a run must pass over them, or a run
// headed by one would never render (its head is never transformed while the rest are removed).
const DROPPED_TOOLS = new Set(["taskcreate", "taskupdate", "tasklist"]);
export const droppedByApp = (item: Item) => item.type === "tool_call" && DROPPED_TOOLS.has(toolName(item));
/** A todo-list update: the daemon's own todo items, or the calls the app turns into one. */
export const isTodo = (item: Item) => item.type === "todo" || (item.type === "tool_call" && TODO_TOOLS.has(toolName(item)));

type Task = Extract<Item, { type: "todo" }>["items"][number];
const taskStatus = (t: Task) => t.status ?? (t.completed ? "completed" : "pending");

/** What a todo update changed, the way Paseo words its own task rows: the first list is "created", then tasks are added, started or completed. */
export type TaskChange = { type: "created"; count: number } | { type: "added" | "started" | "completed"; text: string };
export function taskChanges(before: readonly Task[], after: readonly Task[]): TaskChange[] {
  if (!before.length) return after.length ? [{ type: "created", count: after.length }] : [];
  const key = (t: Task, i: number) => t.id ?? `${i}:${t.text}`;
  const prior = new Map(before.map((t, i) => [key(t, i), t]));
  return after.flatMap((t, i): TaskChange[] => {
    const was = prior.get(key(t, i));
    if (!was) return [{ type: "added", text: t.text }];
    const now = taskStatus(t);
    if (now === taskStatus(was)) return [];
    return now === "completed" ? [{ type: "completed", text: t.text }] : now === "in_progress" ? [{ type: "started", text: t.text }] : [];
  });
}

/** The id a step has both in the app and in the daemon's timeline: tool calls by callId, thoughts (which carry none) by their opening words,
 * todo updates (which carry none either) by their list. Plans, todo-list calls and agent messages aren't steps: they stand on their own. */
export function stepKey(item: Item): string | undefined {
  if (item.type === "todo") return `d:${item.items.map((t) => `${taskStatus(t)} ${t.text}`).join("\n")}`;
  if (item.type === "tool_call") {
    const name = toolName(item);
    if (item.detail.type === "plan" || TODO_TOOLS.has(name) || name === "agent_message" || DROPPED_TOOLS.has(name)) return undefined;
    return `t:${item.callId}`;
  }
  if (item.type !== "reasoning") return undefined;
  const words = item.text.replace(/\s+/g, " ").trim().slice(0, 80);
  return words ? `r:${words}` : undefined;
}

/** Folds a live timeline event into an agent's list the way the daemon's projection does: tool updates replace their call, thought chunks
 * extend the thought before. Returns false when the runs can't have changed (a reply chunk after a reply), so streaming text costs nothing. */
export function applyItem(list: Entry[], item: Item, at: number): boolean {
  const last = list.at(-1);
  if (item.type === "tool_call") {
    const i = list.findLastIndex((e) => e.item.type === "tool_call" && e.item.callId === item.callId);
    if (i < 0) return (list.push({ item, at }), true);
    const old = list[i]!.item as typeof item;
    list[i] = { item: { ...old, ...item, detail: item.detail.type === "unknown" ? old.detail : item.detail }, at };
  } else if (item.type === "reasoning" && last?.item.type === "reasoning") {
    list[list.length - 1] = { item: { type: "reasoning", text: last.item.text + item.text }, at };
  } else if (item.type === "assistant_message" && last?.item.type === "assistant_message") {
    // Reply chunks only matter as the end of a run, so one per reply is kept (with the time of the latest).
    last.at = at;
    return false;
  } else list.push({ item, at });
  return true;
}

const timestampMs = (timestamp: string | undefined) => {
  const at = Date.parse(timestamp ?? "");
  return Number.isFinite(at) ? at : undefined;
};

/** Restored events cannot belong after their next prompt or the idle agent's last update.
 * Keep their content, but leave timing unknown rather than measuring the gap to the import date. */
export function historyEntries(entries: readonly { item: Item; timestamp: string }[], endedAt?: string): Entry[] {
  let ceiling = timestampMs(endedAt);
  const list: Entry[] = entries.map(({ item, timestamp }) => ({ item, at: timestampMs(timestamp) }));
  for (let i = list.length - 1; i >= 0; i--) {
    const entry = list[i]!;
    if (entry.at === undefined) continue;
    if (ceiling !== undefined && entry.at > ceiling) entry.at = undefined;
    if (entry.item.type === "user_message" && entry.at !== undefined) ceiling = entry.at;
  }
  return list;
}

/** Runs of consecutive steps; anything else ends a run, and items `skip` names (hidden by prefs) are passed over. Todo updates join a run but
 * never make one: a run of only todo updates isn't a run, so those stand on their own. */
export function stepRuns(list: readonly Entry[], skip: (item: Item) => boolean): Run[] {
  const runs: Run[] = [];
  let run: Item[] = [];
  let start: number | undefined;
  let end: number | undefined;
  let timed = true;
  const close = (open = false) => {
    if (run.some((s) => s.type !== "todo")) runs.push({ steps: run, ms: timed && start !== undefined && end !== undefined ? end - start : undefined, open });
    run = [];
    start = end = undefined;
    timed = true;
  };
  let lastTodo: string | undefined;
  for (const [i, { item, at }] of list.entries()) {
    if (droppedByApp(item) || skip(item)) continue;
    // An agent can send the same list again; it changes nothing (Paseo rewrites its row in place), so it isn't a step.
    if (item.type === "todo") {
      const key = stepKey(item);
      if (key === lastTodo) continue;
      lastTodo = key;
    }
    if (!stepKey(item)) {
      close();
      continue;
    }
    if (!run.length) {
      start = i ? list[i - 1]!.at : at;
      timed = start !== undefined;
    }
    run.push(item);
    if (at === undefined || (start !== undefined && at < start)) timed = false;
    if (at !== undefined) end = Math.max(end ?? at, at);
  }
  close(true);
  return runs;
}

const PASEO_TOOL = /^(mcp__paseo(_[a-z0-9_]*)?__.|paseo(_[a-z0-9_]*)?\.|paseo_)/;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many).replace("#", String(n));

/** "Thought 2 times, edited 1 file and ran 3 commands": what a run did, in the words and order of Paseo's own groups. */
export function stepSummary(items: readonly Item[], changesOf: (item: Item) => readonly TaskChange[] = (item) => todoChanges.get(stepKey(item)!) ?? []): string {
  const edited = new Set<string>();
  const read = new Set<string>();
  let thoughts = 0;
  let commands = 0;
  let searches = 0;
  let other = 0;
  let paseo = 0;
  let completed = 0;
  for (const item of items) {
    if (item.type === "reasoning") thoughts++;
    if (item.type === "todo") completed += changesOf(item).filter((c) => c.type === "completed").length;
    if (item.type !== "tool_call") continue;
    const d = item.detail;
    if (PASEO_TOOL.test(item.name.trim().toLowerCase())) paseo++;
    else if (d.type === "edit" || d.type === "write") edited.add(d.filePath);
    else if (d.type === "shell") commands++;
    else if (d.type === "read") read.add(d.filePath);
    else if (d.type === "search") searches++;
    else other++;
  }
  const parts = [
    thoughts && plural(thoughts, "thought # time", "thought # times"),
    edited.size && plural(edited.size, "edited # file", "edited # files"),
    commands && plural(commands, "ran # command", "ran # commands"),
    read.size && plural(read.size, "read # file", "read # files"),
    searches && plural(searches, "searched # time", "searched # times"),
    other && plural(other, "used # other tool", "used # other tools"),
    completed && plural(completed, "completed # task", "completed # tasks"),
    paseo && plural(paseo, "called Paseo # time", "called Paseo # times"),
  ].filter((p): p is string => !!p);
  const text = parts.length > 2 ? `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}` : parts.join(" and ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// The live state: every open agent's list, and where each step sits.
const lists = new Map<string, Entry[]>();
const keysByAgent = new Map<string, string[]>();
const runs = new Map<string, Run>();
const places = new Map<string, { head: string; index: number }>();
/** The app's own copy of each step (with its phase), newer than the daemon's while it streams. */
const seen = new Map<string, { item: Item; phase: Phase }>();
/** What the transformer last made of each step, to tell when Paseo must transform again. */
const made = new Map<string, "head" | "none">();
/** What each todo update changed, against the update before it in its agent's timeline. */
const todoChanges = new Map<string, TaskChange[]>();
// ponytail: seen keeps the latest few thousand steps across agents; key it per agent if long sessions show stale rows.
const SEEN_MAX = 4000;
const HISTORY_MAX = 1000;
const HISTORY_KEEP = 750;

const headListeners = new Map<string, Set<() => void>>();
const versions = new Map<string, number>();
const dirty = new Set<string>();
let flushQueued = false;
let onStale: () => void = () => {};
let onUnplaced: () => void = () => {};
let skip: (item: Item) => boolean = () => false;

/** Steps the transformer hides (prefs) are left out of runs; re-splits every agent when that changes. */
export function setStepSkip(fn: (item: Item) => boolean) {
  skip = fn;
  for (const agentId of lists.keys()) rebuild(agentId);
}

function touch(head: string) {
  dirty.add(head);
  if (flushQueued) return;
  flushQueued = true;
  // Transformers run during Paseo's render; listeners are told afterwards so no component updates mid-render.
  queueMicrotask(() => {
    flushQueued = false;
    for (const h of dirty) {
      if (!headListeners.has(h)) continue;
      versions.set(h, (versions.get(h) ?? 0) + 1);
      headListeners.get(h)?.forEach((l) => l());
    }
    dirty.clear();
  });
}

function unplace(agentId: string) {
  for (const key of keysByAgent.get(agentId) ?? []) {
    places.delete(key);
    runs.delete(key);
    todoChanges.delete(key);
  }
}

function forget(key: string) {
  seen.delete(key);
  made.delete(key);
  if (!headListeners.has(key)) versions.delete(key);
}

/** Keep recent complete turns, without splitting the active turn even when it exceeds the history budget. */
function trimHistory(list: Entry[]) {
  if (list.length <= HISTORY_MAX) return;
  let cut = 0;
  for (let i = 1; i < list.length; i++) {
    if (list[i]!.item.type !== "user_message") continue;
    cut = i;
    if (list.length - i <= HISTORY_KEEP) break;
  }
  if (cut) list.splice(0, cut);
}

/** Re-splits one agent's runs, notifying only changed runs and restoring rows that left the retained history. */
function rebuild(agentId: string) {
  const oldKeys = keysByAgent.get(agentId) ?? [];
  const oldRuns = new Map(oldKeys.flatMap((key) => runs.has(key) ? [[key, runs.get(key)!] as const] : []));
  unplace(agentId);
  const keys: string[] = [];
  const list = lists.get(agentId) ?? [];
  // Every todo update, placed or not, so one that leaves a run is made again on its own; the same list twice keeps its first changes.
  let before: readonly Task[] = [];
  for (const { item } of list) {
    if (item.type !== "todo") continue;
    const key = stepKey(item)!;
    if (!todoChanges.has(key)) todoChanges.set(key, taskChanges(before, item.items));
    before = item.items;
    keys.push(key);
  }
  for (const run of stepRuns(list, skip)) {
    // The merged row stands where the run's first thought or tool call is; todo updates are only ever folded in.
    const head = stepKey(run.steps.find((s) => s.type !== "todo")!)!;
    const before = oldRuns.get(head);
    runs.set(head, run);
    if (!before || before.ms !== run.ms || before.open !== run.open || before.steps.length !== run.steps.length || before.steps.some((x, i) => x !== run.steps[i])) touch(head);
    run.steps.forEach((item, index) => {
      const key = stepKey(item)!;
      places.set(key, { head, index: key === head ? 0 : index + 1 });
      keys.push(key);
    });
  }
  keysByAgent.set(agentId, keys);
  const retained = new Set(keys);
  let evictedRows = false;
  for (const key of oldKeys) {
    if (retained.has(key)) continue;
    evictedRows ||= made.has(key);
    forget(key);
    if (oldRuns.has(key)) touch(key);
  }
  if (evictedRows || keys.some(stale)) onStale();
}

/** A step the transformer made differently than it would now. Only a step made before its run was known and that turned out not to
 * lead it: a step not placed yet is made a head of its own, which renders as itself and grows into the merged row in place. */
function stale(key: string) {
  const was = made.get(key);
  return !!was && was !== expected(key);
}

function expected(key: string) {
  return (places.get(key)?.index ?? 0) > 0 ? "none" : "head";
}

// ponytail: any followed agent counts, so a new call of an agent opened next to a busy one waits for its event too (~50ms late, no split).
const GROWING_MS = 60_000;
/** A followed agent is mid-run: its timeline ends in a step that changed within the last minute. */
function runGrowing() {
  const now = Date.now();
  for (const list of lists.values()) {
    const last = list.at(-1);
    if (last && last.at !== undefined && now - last.at < GROWING_MS && stepKey(last.item) && !skip(last.item)) return true;
  }
  return false;
}

/** Called by the transformer for every step: "head" (render the merged row) or "none" (leave it out). A step the followed timelines don't
 * have yet (a tab just opened, the subscription a beat behind) leads a run of one until they catch up. Except a tool call while a run is
 * growing: Paseo sometimes transforms it before the plugin's event arrives, and as a run of one it showed as its own row for ~80ms, then
 * merged (the split-then-merge flicker). It almost always joins that run, so it stays out until its event places it; if it turns out to
 * start a run instead, it is stale and the re-transform shows it. Calls only: their callId is the same in both timelines, while a
 * thought's key is its opening words, which may never match, and a thought kept out would then stay out. */
export function placeStep(item: Item, phase: Phase): { key: string; as: "head" | "none" } | undefined {
  const key = stepKey(item);
  if (!key) return undefined;
  const previous = seen.get(key);
  seen.delete(key);
  seen.set(key, { item, phase });
  if (seen.size > SEEN_MAX) for (const old of [...seen.keys()].slice(0, SEEN_MAX / 4)) forget(old);
  const place = places.get(key);
  const as = !place && item.type === "tool_call" && runGrowing() ? "none" : expected(key);
  const changed = previous?.item !== item || previous.phase !== phase || made.get(key) !== as;
  made.set(key, as);
  if (!place) onUnplaced();
  if (changed) touch(place?.head ?? key);
  return { key, as };
}

/** Keeps an agent's list current: the latest 1000 entries, then live events (those that raced the fetch are replayed past its end). */
export function followAgent(paseo: PluginClientContext["paseo"], agentId: string) {
  const timeline = paseo.agents.ref(agentId).timeline;
  let pending: Array<{ seq?: number; item: Item; at: number }> | undefined;
  let closed = false;
  const load = async () => {
    pending = [];
    try {
      const page = await timeline.refetch({ direction: "tail", limit: 1000, projection: "projected" });
      if (closed) return;
      const list = historyEntries(page.entries, page.agent?.status === "idle" ? page.agent.updatedAt : undefined);
      const end = page.endCursor?.seq ?? -1;
      for (const e of pending) if (e.seq === undefined || e.seq > end) applyItem(list, e.item, e.at);
      trimHistory(list);
      lists.set(agentId, list);
      rebuild(agentId);
    } catch (error) {
      console.warn("[chat-polish] Couldn't load the timeline to merge steps", error);
    } finally {
      pending = undefined;
    }
  };
  const subscription = timeline.subscribe((payload) => {
    const { event } = payload;
    if (event.type === "timeline") {
      const item = event.item as Item;
      const at = timestampMs("timestamp" in payload ? payload.timestamp : undefined) ?? Date.now();
      if (pending) return void pending.push({ seq: "seq" in payload ? payload.seq : undefined, item, at });
      const list = lists.get(agentId);
      if (list && applyItem(list, item, at)) {
        trimHistory(list);
        rebuild(agentId);
      }
    } else if (event.type === "replacement" || event.type === "subscription_restored") void load();
  });
  subscription.ready.then(load, (error: unknown) => console.warn("[chat-polish] Couldn't follow the timeline to merge steps", error));
  return () => {
    if (closed) return;
    closed = true;
    subscription();
    for (const key of keysByAgent.get(agentId) ?? []) {
      forget(key);
      if (runs.has(key)) touch(key);
    }
    unplace(agentId);
    keysByAgent.delete(agentId);
    lists.delete(agentId);
  };
}

/** After a fresh transform everything is made again. */
export const resetMade = () => made.clear();
export const onStaleSteps = (fn: () => void) => void (onStale = fn);
/** A step came before its agent's timeline was followed or caught up; lets the entry follow newly opened tabs right away. */
export const onUnplacedStep = (fn: () => void) => void (onUnplaced = fn);

/** A run's steps as the app last saw them and its duration; a single step when the head isn't known (yet). */
export function runOf(head: string): { steps: Array<{ item: Item; phase: Phase }>; ms?: number; open?: boolean } {
  const run = runs.get(head);
  if (!run) {
    const own = seen.get(head);
    return { steps: own ? [own] : [] };
  }
  return { steps: run.steps.map((item) => seen.get(stepKey(item)!) ?? { item, phase: "complete" as const }), ms: run.ms, open: run.open };
}

export function subscribeRun(head: string, listener: () => void) {
  let set = headListeners.get(head);
  if (!set) headListeners.set(head, (set = new Set()));
  set.add(listener);
  return () => {
    set.delete(listener);
    if (!set.size) {
      headListeners.delete(head);
      versions.delete(head);
    }
  };
}

export const runVersion = (head: string) => versions.get(head) ?? 0;
export const changesOfTodo = (key: string): readonly TaskChange[] => todoChanges.get(key) ?? [];
/** What a todo update changed when there is no timeline to work it out from (the dashboard preview's sample). */
export const setTodoChanges = (item: Item, changes: TaskChange[]) => void todoChanges.set(stepKey(item)!, changes);


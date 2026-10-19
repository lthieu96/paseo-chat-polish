import assert from "node:assert/strict";
import { test } from "node:test";
import { errorText, hideableKind, imageData, noticeData, toolData, toolSchema } from "../client/model.ts";

const tool = (detail, extra = {}) => ({ type: "tool_call", callId: "1", name: "Bash", status: "completed", error: null, detail, ...extra });

test("shell: tense follows status, nonzero exit is flagged", () => {
  const running = toolData(tool({ type: "shell", command: "npm test\n--watch" }, { status: "running" }));
  assert.equal(running.verb, "Running");
  assert.equal(running.target, "npm test");
  const failed = toolData(tool({ type: "shell", command: "npm test", exitCode: 1, output: "FAIL" }, { status: "failed", error: { message: "x" } }));
  assert.equal(failed.verb, "Ran");
  assert.equal(failed.meta, "exit 1");
  assert.equal(failed.metaTone, "danger");
  assert.equal(failed.detail.kind, "output");
});

test("edit: counts come from old/new strings when no unified diff", () => {
  const d = toolData(tool({ type: "edit", filePath: "/a/b/c/d/e.ts", oldString: "x\ny", newString: "z" }));
  assert.equal(d.meta, "+1 −2");
  assert.equal(d.target, "…/c/d/e.ts");
  assert.deepEqual(d.detail.lines.map((l) => l.sign), ["-", "-", "+"]);
});

test("edit: unified diff headers are dropped, hunk headers give line numbers", () => {
  const d = toolData(tool({ type: "edit", filePath: "a.ts", unifiedDiff: "--- a\n+++ b\n@@ -12,2 +12 @@\n-old\n+new\n same" }));
  assert.deepEqual(d.detail.lines, [{ sign: "-", text: "old", n: 12 }, { sign: "+", text: "new", n: 12 }, { sign: " ", text: "same", n: 13 }]);
});

test("canceled overrides verb and icon; every output passes the renderer schema", () => {
  const d = toolData(tool({ type: "read", filePath: "a.ts" }, { status: "canceled" }));
  assert.equal(d.verb, "Canceled");
  assert.equal(d.icon, "CircleSlash");
  for (const detail of [
    { type: "search", query: "q", numMatches: 1, numFiles: 2, filePaths: ["a"] },
    { type: "search", query: "q", toolName: "web_search", webResults: [{ title: "T", url: "https://x.dev" }] },
    { type: "fetch", url: "https://x.dev", code: 200, bytes: 2048 },
    { type: "worktree_setup", worktreePath: "/w", branchName: "b", log: "", commands: [{ index: 0, command: "npm ci", cwd: "/w", log: "", status: "completed", exitCode: 0 }] },
    { type: "sub_agent", subAgentType: "explore", log: "", actions: [{ index: 0, toolName: "Read" }] },
    { type: "plain_text", label: "Spoke", icon: "mic_vocal" },
    { type: "unknown", input: { id: 1 }, output: null },
  ]) {
    toolSchema.parse(JSON.parse(JSON.stringify(toolData(tool(detail)))));
  }
  assert.equal(toolData(tool({ type: "search", query: "q", numMatches: 1, numFiles: 2 })).meta, "1 match · 2 files");
  assert.equal(toolData(tool({ type: "plain_text", icon: "mic_vocal" })).icon, "MicVocal");
});

test("task notifications drop raw XML and keep the summary", () => {
  const d = toolData(tool({ type: "plain_text", label: "Fix ids", icon: "wrench", text: "<task-notification>…" }, { name: "task_notification" }));
  assert.equal(d.verb, "Background task");
  assert.equal(d.target, "Fix ids");
  assert.equal(d.detail, undefined);
});

test("notices", () => {
  assert.equal(noticeData({ type: "compaction", status: "completed", trigger: "manual", preTokens: 182400 }).text, "Context manually compacted · 182K tokens");
  assert.equal(noticeData({ type: "compaction", status: "loading" }).pulsing, true);
  assert.equal(noticeData({ type: "error", message: "boom" }).variant, "inline");
});

test("image-only assistant messages become thumbnails; mixed text stays native", () => {
  assert.deepEqual(imageData("![Image](file:///a.png)![](file:///b.png)\n"), {
    images: [{ alt: "Image", url: "file:///a.png" }, { alt: "Image", url: "file:///b.png" }],
  });
  assert.equal(imageData("Here it is: ![Image](file:///a.png)"), undefined);
  assert.equal(imageData("no images"), undefined);
});

test("errors read as one line: message first, never a lone brace", () => {
  assert.equal(errorText({ message: "Command failed\nstack…" }), "Command failed");
  assert.equal(errorText({ code: 1 }), '{"code":1}');
  assert.equal(errorText("\n  boom  \n"), "boom");
  assert.equal(errorText(null), undefined);
});

test("claude shell failures: exit code goes to meta, tool_result content becomes output", () => {
  const d = toolData(tool({ type: "shell", command: "rg x" }, { status: "failed", error: { type: "tool_result", content: "Exit code 2\nline one\nline two" } }));
  assert.equal(d.meta, "exit 2");
  assert.equal(d.error, undefined);
  assert.equal(d.detail.text, "line one\nline two");
  assert.equal(errorText({ type: "tool_result", content: [{ type: "text", text: "\nPermission denied" }] }), "Permission denied");
});

test("highlight colors code tokens and keeps every character", async () => {
  const { highlight } = await import("../client/highlight.ts");
  const line = 'const user = await verifyToken(req.headers.auth) // 401 if "missing"';
  const spans = highlight(line);
  assert.equal(spans.map((s) => s.text).join(""), line);
  const kind = (t) => spans.find((s) => s.text === t)?.kind;
  assert.equal(kind("const"), "keyword");
  assert.equal(kind("await"), "keyword");
  assert.equal(kind("verifyToken"), "function");
  assert.equal(kind("="), "operator");
  assert.equal(kind("// 401 if \"missing\""), "comment");
  assert.equal(highlight('{ "id": 12, "ok": true }').filter((s) => s.kind).map((s) => s.kind).join(" "), "punctuation string operator number punctuation string operator constant punctuation");
});

test("shell highlighting: commands after pipes and &&, flags, variables, strings, comments", async () => {
  const { highlightShell } = await import("../client/highlight.ts");
  const line = `F=$(rg -l "export" src) && cat $F | head -20 2>&1; sudo npm test # run`;
  const spans = highlightShell(line);
  assert.equal(spans.map((s) => s.text).join(""), line);
  const kinds = Object.fromEntries(spans.filter((s) => s.kind).map((s) => [s.text, s.kind]));
  assert.equal(kinds.F, "variable");
  assert.equal(kinds.rg, "function");
  assert.equal(kinds["-l"], "parameter");
  assert.equal(kinds['"export"'], "string");
  assert.equal(kinds.cat, "function");
  assert.equal(kinds.$F, "variable");
  assert.equal(kinds.head, "function");
  assert.equal(kinds["2>&1"], "operator");
  assert.equal(kinds.sudo, "keyword");
  assert.equal(kinds.npm, "function");
  assert.equal(kinds["# run"], "comment");
  assert.equal(kinds.test, undefined);
});

test("shell blocks: heredoc bodies are code, the terminator closes them, each line starts a command", async () => {
  const { highlightShellBlock } = await import("../client/highlight.ts");
  const text = "python3 - <<'EOF'\nimport json\nEOF\necho done";
  const spans = highlightShellBlock(text);
  assert.equal(spans.map((s) => s.text).join(""), text);
  const kinds = spans.filter((s) => s.kind).map((s) => `${s.text}:${s.kind}`);
  assert.ok(kinds.includes("python3:function"));
  assert.ok(kinds.includes("import:keyword"));
  assert.ok(kinds.includes("EOF:keyword"));
  assert.ok(kinds.includes("echo:function"));
});

test("every highlight theme colors every token kind; presets point at real highlight themes", async () => {
  const { SYNTAX_THEMES } = await import("../client/highlight.ts");
  const { PRESETS, themeSchema } = await import("../shared/theme.ts");
  for (const t of SYNTAX_THEMES) {
    assert.equal(Object.keys(t.colors).length, 10, t.id);
    for (const c of Object.values(t.colors)) assert.match(c, /^#[0-9a-f]{6}$/, t.id);
  }
  for (const p of PRESETS) assert.ok(SYNTAX_THEMES.some((t) => t.id === p.syntax && t.appearance === p.appearance), p.id);
  assert.equal(themeSchema.parse({}).syntax, "one-dark-darker-mariana");
});

test("hideable kinds: only completed reads, searches, fetches and background tasks", async () => {
  const { prefsSchema } = await import("../shared/timeline.ts");
  assert.equal(hideableKind(tool({ type: "read", filePath: "a.ts" })), "read");
  assert.equal(hideableKind(tool({ type: "search", query: "x" })), "search");
  assert.equal(hideableKind(tool({ type: "plain_text", label: "Done" }, { name: "task_notification" })), "task");
  assert.equal(hideableKind(tool({ type: "read", filePath: "a.ts" }, { status: "failed" })), undefined);
  assert.equal(hideableKind(tool({ type: "read", filePath: "a.ts" }, { status: "running" })), undefined);
  assert.equal(hideableKind(tool({ type: "shell", command: "ls" })), undefined);
  assert.deepEqual(prefsSchema.parse({}), { reasoning: "paseo", toolDetails: "collapsed", commandColors: "expanded", diffWrap: "off", hidden: [], userMessages: "clamp", steps: "faded", selectionCopy: "on", density: "normal", rowIcons: { steps: "show", tool: "show", thought: "show" }, merge: "on", loader: "dots", loaderSize: "s", nativeStyle: "design", recap: "on", images: "small", richText: { quote: "a", table: "a", code: "a", inline: "a", heading: "a", list: "a", callout: "a", rule: "a" } });
  assert.equal(prefsSchema.parse({ diffWrap: "on" }).diffWrap, "on");
  // A saved single choice from before icons were per kind applies to all three.
  assert.deepEqual(prefsSchema.parse({ rowIcons: "hide" }).rowIcons, { steps: "hide", tool: "hide", thought: "hide" });
  // Saved prefs from before rich text variants still load, with each element on its base style.
  assert.equal(prefsSchema.parse({ images: "large" }).richText.callout, "a");
  assert.equal(prefsSchema.parse({ richText: { table: "c" } }).richText.table, "c");
  // Only tables have a fourth style.
  assert.equal(prefsSchema.parse({ richText: { table: "d" } }).richText.table, "d");
  assert.equal(prefsSchema.parse({ steps: "merged" }).steps, "faded");
  assert.equal(prefsSchema.safeParse({ richText: { quote: "d" } }).success, false);
});

test("turn recap: files with +/− relative to cwd, failed commands with exit codes, nothing for read-only turns", async () => {
  const { recapData } = await import("../shared/recap.ts");
  const timeline = [
    { type: "user_message", text: "earlier turn" },
    tool({ type: "shell", command: "make" }, { status: "failed", error: { message: "x" } }),
    { type: "user_message", text: "this turn" },
    tool({ type: "edit", filePath: "/w/src/a.ts", unifiedDiff: "@@ -1,2 +1,2 @@\n-old\n+new\n same" }),
    tool({ type: "edit", filePath: "/w/src/a.ts", oldString: "x", newString: "y\nz" }),
    tool({ type: "write", filePath: "/w/new.md", content: "a\nb\nc" }),
    tool({ type: "edit", filePath: "/w/skip.ts", oldString: "x", newString: "y" }, { status: "failed", error: { message: "no match" } }),
    tool({ type: "shell", command: "npm test\n--watch", exitCode: 1 }),
    tool({ type: "shell", command: "rg x" }, { status: "failed", error: { type: "tool_result", content: "Exit code 2\nboom" } }),
    tool({ type: "shell", command: "ls" }),
    tool({ type: "write", filePath: "/Users/kvy/notes/todo.md", content: "x" }),
  ];
  assert.deepEqual(recapData(timeline, "/w"), {
    files: [{ path: "src/a.ts", added: 3, removed: 2 }, { path: "new.md", added: 3, removed: 0 }, { path: "~/notes/todo.md", added: 1, removed: 0 }],
    commands: 3,
    failed: [{ command: "npm test", exit: 1 }, { command: "rg x", exit: 2 }],
  });
  assert.equal(recapData([tool({ type: "read", filePath: "/w/a.ts" }), tool({ type: "shell", command: "ls" })], "/w"), undefined);
});

test("turn as Markdown: quoted prompt, reply, then changes from the recap", async () => {
  const { turnMarkdown } = await import("../client/model.ts");
  const md = turnMarkdown(
    [
      { type: "user_message", text: "old" },
      { type: "user_message", text: "fix it\nplease" },
      { type: "assistant_message", text: "Fixed." },
      tool({ type: "edit", filePath: "/w/a.ts", oldString: "x", newString: "y" }),
      tool({ type: "shell", command: "npm test" }, { status: "failed", error: { message: "x" } }),
      { type: "assistant_message", text: "Done." },
    ],
    "/w",
  );
  assert.equal(md, "> fix it\n> please\n\nFixed.\n\nDone.\n\n**Changes** · 1 file +1 −1 · 1 command · 1 failed\n- `a.ts` +1 −1\n- ✗ `npm test`");
  assert.equal(turnMarkdown([{ type: "assistant_message", text: "hi" }], "/w"), undefined);
});

test("steps: runs split on replies, fold tool updates and thought chunks, skip hidden steps, time the run", async () => {
  const { applyItem, stepRuns, stepKey, stepSummary } = await import("../client/steps.ts");
  const list = [{ item: { type: "user_message", text: "go" }, at: 1000 }];
  let at = 1000;
  for (const item of [
    { type: "reasoning", text: "Let me " },
    { type: "reasoning", text: "look." },
    tool({ type: "shell", command: "ls" }, { callId: "a", status: "running" }),
    tool({ type: "unknown", input: null, output: null }, { callId: "a" }),
    tool({ type: "read", filePath: "x.ts" }, { callId: "b" }),
    { type: "assistant_message", text: "Done" },
    { type: "assistant_message", text: " here" },
    tool({ type: "edit", filePath: "x.ts", oldString: "a", newString: "b" }, { callId: "c" }),
  ]) applyItem(list, item, (at += 1000));
  assert.equal(list.length, 6);
  assert.equal(list[1].item.text, "Let me look.");
  assert.equal(list[2].item.detail.type, "shell");
  assert.equal(list[2].item.status, "completed");
  const runs = stepRuns(list, (item) => item.detail?.type === "read");
  assert.deepEqual(runs.map((r) => r.steps.map(stepKey)), [["r:Let me look.", "t:a"], ["t:c"]]);
  // From the user message (1s) to the shell call's completion (5s); the second run starts when the reply's last chunk arrived (8s).
  assert.deepEqual(runs.map((r) => r.ms), [4000, 1000]);
  // Only the run nothing has followed yet can still grow.
  assert.deepEqual(runs.map((r) => r.open), [false, true]);
  assert.equal(stepSummary(runs[0].steps), "Thought 1 time and ran 1 command");
  assert.equal(stepSummary(list.map((e) => e.item)), "Thought 1 time, edited 1 file, ran 1 command, and read 1 file");
  assert.equal(stepSummary([tool({ type: "unknown", input: null, output: null }, { name: "mcp__paseo__browser_click" }), tool({ type: "unknown", input: null, output: null }, { name: "WebSearch" })]), "Used 1 other tool and called Paseo 1 time");
});

test("untyped tools read as words: MCP server › tool, known built-ins, labels as targets, search text", () => {
  const unknown = (name, input = null, output = null, extra = {}) => toolData(tool({ type: "unknown", input, output }, { name, ...extra }));
  assert.deepEqual([unknown("mcp__github__create_issue").target, unknown("mcp__github__create_issue").icon], ["github › Create issue", "Blocks"]);
  assert.deepEqual([unknown("mcp__paseo__create_agent").target, unknown("mcp__paseo__create_agent").icon], ["Create agent", "Bot"]);
  assert.deepEqual([unknown("mcp__paseo__browser_reload").icon, unknown("paseo.capture_terminal").icon, unknown("mcp__paseo__create_schedule").icon], ["AppWindow", "SquareTerminal", "CalendarClock"]);
  assert.equal(unknown("github.create_issue").target, "github › Create issue");
  const ask = unknown("AskUserQuestion", { description: "Pick one\nmore" }, null, { status: "running" });
  assert.deepEqual([ask.verb, ask.target, ask.icon], ["Asking", "Pick one", "MessageCircleQuestion"]);
  const speak = unknown("speak", "Hello there");
  assert.deepEqual([speak.verb, speak.target, speak.detail], ["Spoke", "Hello there", undefined]);
  assert.equal(unknown("SomeNewTool").target, "Some new tool");
  const skill = toolData(tool({ type: "plain_text", label: "paseo-plugin" }, { name: "Skill" }));
  assert.deepEqual([skill.verb, skill.target], ["Used skill", "paseo-plugin"]);
  const term = toolData(tool({ type: "plain_text", label: "npm test" }, { name: "terminal" }));
  assert.deepEqual([term.verb, term.target, term.shell], ["Ran", "npm test", true]);
  assert.equal(toolData(tool({ type: "plain_text", label: "Switching mode" }, { name: "switch_mode" })).verb, "Switch mode");
  const grep = toolData(tool({ type: "search", query: "foo", toolName: "grep", content: "a.ts:1: foo" }));
  assert.deepEqual(grep.detail, { kind: "text", text: "a.ts:1: foo" });
  for (const d of [ask, speak, skill, term, grep]) assert.ok(toolSchema.safeParse(d).success);
});

test("steps: Claude's task tools are passed over, todo-list calls and agent messages end a run", async () => {
  const { isTodo, stepRuns, stepKey } = await import("../client/steps.ts");
  const entries = [
    tool({ type: "unknown", input: null, output: null }, { callId: "t1", name: "TaskUpdate" }),
    tool({ type: "shell", command: "ls" }, { callId: "a" }),
    tool({ type: "unknown", input: null, output: null }, { callId: "t2", name: "TaskCreate" }),
    tool({ type: "read", filePath: "x.ts" }, { callId: "b" }),
    tool({ type: "unknown", input: null, output: null }, { callId: "w", name: "TodoWrite" }),
    tool({ type: "shell", command: "pwd" }, { callId: "c" }),
    tool({ type: "plain_text", text: "hi" }, { callId: "m", name: "agent_message" }),
  ].map((item, i) => ({ item, at: i }));
  assert.deepEqual(stepRuns(entries, () => false).map((r) => r.steps.map(stepKey)), [["t:a", "t:b"], ["t:c"]]);
  // Hidden todo lists (the call or the daemon's own todo item) are passed over, so the steps around them stay one run.
  const withTodo = [...entries.slice(0, 4), { item: { type: "todo", items: [] }, at: 4 }, ...entries.slice(5)];
  for (const list of [entries, withTodo]) assert.deepEqual(stepRuns(list, isTodo).map((r) => r.steps.map(stepKey)), [["t:a", "t:b", "t:c"]]);
});

test("steps: a step transformed before its timeline catches up leads its run in place, with no re-transform", async () => {
  const { followAgent, onStaleSteps, onUnplacedStep, placeStep } = await import("../client/steps.ts");
  let handler;
  let resolveReady;
  const subscription = Object.assign(() => {}, { ready: new Promise((r) => (resolveReady = r)) });
  const paseo = {
    agents: {
      ref: () => ({
        timeline: {
          refetch: async () => ({ entries: [{ item: { type: "user_message", text: "go" }, timestamp: new Date(0).toISOString() }], endCursor: { seq: 0 } }),
          subscribe: (h) => ((handler = h), subscription),
        },
      }),
    },
  };
  let stale = 0;
  let unplaced = 0;
  onStaleSteps(() => stale++);
  onUnplacedStep(() => unplaced++);
  const stop = followAgent(paseo, "agent");
  resolveReady();
  await new Promise((r) => setTimeout(r, 0));
  const send = (item, seq) => handler({ seq, timestamp: new Date().toISOString(), event: { type: "timeline", item } });
  const a = tool({ type: "shell", command: "ls" }, { callId: "a", status: "running" });
  const b = tool({ type: "shell", command: "pwd" }, { callId: "b", status: "running" });
  // Paseo renders the first call before the plugin's own event arrives: it leads a run of one.
  assert.deepEqual(placeStep(a, "streaming"), { key: "t:a", as: "head" });
  assert.equal(unplaced, 1);
  send(a, 1);
  send(b, 2);
  // The second joins it; the first row grows into the merged row without Paseo transforming again.
  assert.deepEqual(placeStep(b, "streaming"), { key: "t:b", as: "none" });
  assert.equal(stale, 0);
  // Only a step that turns out not to lead its run needs a fresh transform.
  const c = tool({ type: "shell", command: "id" }, { callId: "c", status: "running" });
  assert.equal(placeStep(c, "streaming").as, "head");
  send(c, 3);
  assert.equal(stale, 1);
  stop();
});

test("css guard: positional selectors get a :where() precheck on their subject, others are left alone", async () => {
  const { guardPositional } = await import("../client/css-guard.ts");
  assert.equal(guardPositional('[data-x] > div'), '[data-x] > div');
  assert.equal(guardPositional('[data-x] > div > div:first-child'), '[data-x] > div > div:where([data-x] > div > div):first-child');
  assert.equal(guardPositional('[data-x] > :last-child *'), '[data-x] > :last-child *:where([data-x] >  *)');
  assert.equal(guardPositional('[data-x] div:nth-child(2)::before'), '[data-x] div:where([data-x] div):nth-child(2)::before');
  assert.equal(guardPositional('[data-x] > :first-child'), '[data-x] > :where([data-x] > *):first-child');
  assert.equal(guardPositional('[data-x] :last-child'), '[data-x] :where([data-x] *):last-child');
  assert.equal(guardPositional('[a="b c"] > p:not(:last-child)'), '[a="b c"] > p:where([a="b c"] > p):not(:last-child)');
});

test("todo updates: what changed, folded into the run around them, never leading it", async () => {
  const { followAgent, placeStep, runOf, stepKey, stepRuns, stepSummary, taskChanges, changesOfTodo } = await import("../client/steps.ts");
  const todo = (...s) => ({ type: "todo", items: s.map((status, i) => ({ text: `t${i}`, completed: status === "completed", status })) });
  const t0 = todo("in_progress", "pending");
  const t1 = todo("completed", "in_progress");
  assert.deepEqual(taskChanges([], t0.items), [{ type: "created", count: 2 }]);
  assert.deepEqual(taskChanges(t0.items, t1.items), [{ type: "completed", text: "t0" }, { type: "started", text: "t1" }]);
  assert.deepEqual(taskChanges(t1.items, [...t1.items, { text: "t2", completed: false }]), [{ type: "added", text: "t2" }]);

  const a = tool({ type: "shell", command: "ls" }, { callId: "a" });
  const b = tool({ type: "shell", command: "pwd" }, { callId: "b" });
  const reply = { type: "assistant_message", text: "ok" };
  const at = (items) => items.map((item, i) => ({ item, at: i }));
  // A todo update joins the run; one with no steps around it isn't a run.
  assert.deepEqual(stepRuns(at([t0, a, t1, b, reply, t1, reply]), () => false).map((r) => r.steps.map(stepKey)), [[stepKey(t0), "t:a", stepKey(t1), "t:b"]]);
  assert.equal(stepSummary([a, t1, b], () => [{ type: "completed", text: "t0" }]), "Ran 2 commands and completed 1 task");
  // The same list sent again isn't another step.
  assert.deepEqual(stepRuns(at([a, t1, t1, b]), () => false).map((r) => r.steps.map(stepKey)), [["t:a", stepKey(t1), "t:b"]]);

  // Placed: the run's first tool call heads the merged row, the todo updates around it are left out; a lone update stays on its own.
  const lone = todo("completed", "completed");
  const entries = at([{ type: "user_message", text: "go" }, t0, a, t1, b, reply, lone, reply]).map((e) => ({ item: e.item, timestamp: new Date(e.at).toISOString() }));
  let ready;
  const subscription = Object.assign(() => {}, { ready: new Promise((r) => (ready = r)) });
  const paseo = { agents: { ref: () => ({ timeline: { refetch: async () => ({ entries, endCursor: { seq: 0 } }), subscribe: () => subscription } }) } };
  const stop = followAgent(paseo, "todo-agent");
  ready();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(placeStep(t0, "complete").as, "none");
  assert.equal(placeStep(a, "complete").as, "head");
  assert.equal(placeStep(t1, "complete").as, "none");
  assert.equal(placeStep(lone, "complete").as, "head");
  assert.deepEqual(runOf("t:a").steps.map((s) => stepKey(s.item)), [stepKey(t0), "t:a", stepKey(t1), "t:b"]);
  assert.deepEqual(changesOfTodo(stepKey(t1)), [{ type: "completed", text: "t0" }, { type: "started", text: "t1" }]);
  assert.equal(stepSummary(runOf("t:a").steps.map((s) => s.item)), "Ran 2 commands and completed 1 task");
  stop();
});

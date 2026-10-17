import type { AgentTimelineItem, ToolCallDetail } from "@getpaseo/protocol/agent-types";
import { z } from "zod";
import { diffLines } from "../shared/diff.ts";
import { recapData } from "../shared/recap.ts";
import type { Hideable } from "../shared/timeline";

type Item<T extends AgentTimelineItem["type"]> = Extract<AgentTimelineItem, { type: T }>;
type Phase = "streaming" | "complete";

const MAX_LINES = 200;
const MAX_CHARS = 8000;

const tone = z.enum(["muted", "success", "danger", "warning", "accent"]);

const listItem = z.object({ icon: z.string().optional(), text: z.string(), tone: tone.optional(), shell: z.boolean().optional() });

const detail = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("output"), command: z.string().optional(), cwd: z.string().optional(), text: z.string() }),
  z.object({ kind: z.literal("diff"), lines: z.array(z.object({ text: z.string(), sign: z.enum([" ", "+", "-"]), n: z.number().optional() })) }),
  z.object({ kind: z.literal("list"), items: z.array(listItem) }),
  z.object({ kind: z.literal("text"), text: z.string() }),
  z.object({ kind: z.literal("io"), input: z.string(), output: z.string() }),
]);

export const toolSchema = z.object({
  status: z.enum(["running", "completed", "failed", "canceled"]),
  icon: z.string(),
  verb: z.string(),
  target: z.string().optional(),
  /** The target is a shell command line, colored as one. */
  shell: z.boolean().optional(),
  mono: z.boolean(),
  meta: z.string().optional(),
  metaTone: tone.optional(),
  error: z.string().optional(),
  detail: detail.optional(),
});
export type ToolData = z.output<typeof toolSchema>;
export type Tone = z.output<typeof tone>;

export const planSchema = z.object({ text: z.string(), phase: z.enum(["streaming", "complete"]) });
export const thoughtSchema = z.object({ text: z.string(), phase: z.enum(["streaming", "complete"]) });
/** A merged run of steps, named by its first step's key (client/steps.ts holds the steps). */
export const stepsSchema = z.object({ head: z.string() });
/** A todo update on its own row: the list at that point, and the task then in progress (its active form). */
export const todoSchema = z.object({
  items: z.array(z.object({ text: z.string(), status: z.enum(["pending", "in_progress", "completed"]) })),
  active: z.string().optional(),
});
export const noticeSchema = z.object({
  variant: z.enum(["inline", "divider"]),
  tone,
  icon: z.string(),
  text: z.string(),
  pulsing: z.boolean(),
});

const clipLines = (text: string) => {
  const lines = text.replace(/\s+$/, "").split("\n");
  const kept = lines.length > MAX_LINES ? [`… ${lines.length - MAX_LINES} earlier lines`, ...lines.slice(-MAX_LINES)] : lines;
  const joined = kept.join("\n");
  return joined.length > MAX_CHARS ? "…" + joined.slice(-MAX_CHARS) : joined;
};

export function shortPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  return parts.length > 3 ? "…/" + parts.slice(-3).join("/") : path;
}

const firstLine = (s: string) => s.trim().split("\n")[0] ?? "";
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const pascal = (s: string) => s.replace(/(^|[_-])(\w)/g, (_, __, c: string) => c.toUpperCase());
const stringify = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v, null, 2) ?? "");

/** The text inside a provider error: `message`, tool-result `content` (string or text blocks), else compact JSON. */
export function errorBody(error: unknown): string | undefined {
  if (error == null) return undefined;
  if (typeof error === "string") return error;
  const e = error as { message?: unknown; content?: unknown; error?: unknown };
  if (typeof e.message === "string") return e.message;
  if (typeof e.content === "string") return e.content;
  if (Array.isArray(e.content)) {
    const text = e.content.map((b) => (b && typeof b === "object" && typeof (b as { text?: unknown }).text === "string" ? (b as { text: string }).text : "")).join("\n");
    if (text.trim()) return text;
  }
  if (typeof e.error === "string") return e.error;
  return JSON.stringify(error);
}

/** One readable line from a provider error. */
export function errorText(error: unknown) {
  const line = errorBody(error)?.trim().split("\n").find((l) => l.trim())?.trim() ?? "";
  return line.length > 300 ? line.slice(0, 299) + "…" : line || undefined;
}

const tense = (running: boolean, now: string, past: string) => (running ? now : past);

/** "AskUserQuestion", "create_agent" → "Ask user question", "Create agent". */
export const readable = (name: string) => {
  const words = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[._\s-]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};
// Paseo's own tools by what they act on, first match wins: browser_reload → AppWindow.
const PASEO_ICONS: Array<[RegExp, string]> = [
  [/^browser_/, "AppWindow"],
  [/terminal/, "SquareTerminal"],
  [/schedule|heartbeat/, "CalendarClock"],
  [/workspace/, "FolderGit2"],
  [/permission/, "ShieldCheck"],
  [/provider|model|profile/, "Cpu"],
  [/agent|user_input/, "Bot"],
];
/** An MCP tool, "mcp__github__create_issue" (Claude) or "github.create_issue" (Codex), with its icon. Paseo's own server goes unnamed. */
export function mcpTool(name: string) {
  const m = /^mcp__(.+?)__(.+)$/.exec(name) ?? /^([\w-]+)\.([\w.-]+)$/.exec(name);
  if (!m) return undefined;
  const leaf = m[2]!.toLowerCase();
  if (!/^paseo/i.test(m[1]!)) return { server: m[1]!, tool: readable(m[2]!), icon: "Blocks" };
  return { server: undefined, tool: readable(m[2]!), icon: PASEO_ICONS.find(([re]) => re.test(leaf))?.[1] ?? "Blocks" };
}
// Built-in tools that reach the client without a typed detail: icon, verb while running, verb once done. Keyed by name without separators.
const NAMED: Record<string, [string, string, string]> = {
  askuserquestion: ["MessageCircleQuestion", "Asking", "Asked"],
  question: ["MessageCircleQuestion", "Asking", "Asked"],
  requestuserinput: ["MessageCircleQuestion", "Asking", "Asked"],
  toolsearch: ["Search", "Finding tools", "Found tools"],
  notebookedit: ["Pencil", "Editing notebook", "Edited notebook"],
  bashoutput: ["SquareTerminal", "Reading output", "Read output"],
  taskoutput: ["SquareTerminal", "Reading output", "Read output"],
  killshell: ["Square", "Stopping", "Stopped"],
  taskstop: ["Square", "Stopping", "Stopped"],
  monitor: ["Activity", "Watching", "Watched"],
  sendmessage: ["Send", "Sending message", "Sent message"],
  lsp: ["Code", "Querying LSP", "Queried LSP"],
  webfetch: ["Globe", "Fetching", "Fetched"],
  list: ["FolderOpen", "Listing", "Listed"],
  applypatch: ["Pencil", "Patching", "Patched"],
  skill: ["Sparkles", "Using skill", "Used skill"],
  task: ["Bot", "Starting agent", "Started agent"],
  speak: ["MicVocal", "Speaking", "Spoke"],
  terminal: ["SquareTerminal", "Running", "Ran"],
  agentmessage: ["Bot", "Agent message", "Agent message"],
};
const named = (name: string) => NAMED[name.toLowerCase().replace(/[._\s-]+/g, "")];
/** A short target from a tool's input: the string itself, or its description, query, command, URL or path. */
function inputTarget(input: unknown) {
  if (typeof input === "string") return firstLine(input) || undefined;
  if (!input || typeof input !== "object") return undefined;
  const o = input as Record<string, unknown>;
  const v = [o.description, o.query, o.command, o.url, o.file_path, o.path, o.pattern, o.prompt].find((x) => typeof x === "string" && x.trim());
  return typeof v === "string" ? firstLine(v) : undefined;
}

function describe(d: ToolCallDetail, name: string, running: boolean): Omit<ToolData, "status" | "error"> {
  switch (d.type) {
    case "shell":
      return {
        icon: "SquareTerminal",
        verb: tense(running, "Running", "Ran"),
        target: firstLine(d.command),
        shell: true,
        mono: true,
        meta: d.exitCode ? `exit ${d.exitCode}` : undefined,
        metaTone: d.exitCode ? "danger" : undefined,
        detail: { kind: "output", command: d.command, cwd: d.cwd, text: clipLines(d.output ?? "") },
      };
    case "read":
      return {
        icon: "Eye",
        verb: tense(running, "Reading", "Read"),
        target: shortPath(d.filePath),
        mono: true,
        meta: d.offset != null && d.limit != null ? `L${d.offset}–${d.offset + d.limit}` : undefined,
      };
    case "edit": {
      const lines = diffLines(d);
      const add = lines.filter((l) => l.sign === "+").length;
      const del = lines.filter((l) => l.sign === "-").length;
      return {
        icon: "Pencil",
        verb: tense(running, "Editing", "Edited"),
        target: shortPath(d.filePath),
        mono: true,
        meta: lines.length ? `+${add} −${del}` : undefined,
        detail: lines.length ? { kind: "diff", lines: lines.slice(0, MAX_LINES) } : undefined,
      };
    }
    case "write":
      return {
        icon: "FilePlus",
        verb: tense(running, "Writing", "Wrote"),
        target: shortPath(d.filePath),
        mono: true,
        meta: d.content ? `+${d.content.split("\n").length}` : undefined,
        metaTone: "success",
      };
    case "search": {
      const web = d.toolName === "web_search";
      const items = web
        ? (d.webResults ?? []).map((r) => ({ text: `${r.title} — ${r.url.replace(/^https?:\/\//, "")}` }))
        : (d.filePaths ?? []).map((p) => ({ text: shortPath(p) }));
      const meta = web
        ? d.webResults && plural(d.webResults.length, "result")
        : [d.numMatches != null && plural(d.numMatches, "match", "matches"), d.numFiles != null && plural(d.numFiles, "file")]
            .filter(Boolean)
            .join(" · ") || undefined;
      return {
        icon: web ? "Globe" : "Search",
        verb: tense(running, web ? "Searching web" : "Searching", web ? "Searched web" : "Searched"),
        target: d.query,
        mono: !web,
        meta: meta || undefined,
        detail: items.length
          ? { kind: "list", items: items.slice(0, 50) }
          : d.content || d.annotations?.length
            ? { kind: "text", text: clipLines(d.content ?? d.annotations!.join("\n")) }
            : undefined,
      };
    }
    case "fetch":
      return {
        icon: "Globe",
        verb: tense(running, "Fetching", "Fetched"),
        target: d.url.replace(/^https?:\/\//, ""),
        mono: true,
        meta: [d.code, d.bytes != null && `${Math.max(1, Math.round(d.bytes / 1024))} KB`].filter(Boolean).join(" · ") || undefined,
        detail: d.result ? { kind: "text", text: clipLines(d.result) } : undefined,
      };
    case "worktree_setup": {
      const done = d.commands.filter((c) => c.status === "completed").length;
      return {
        icon: "GitBranch",
        verb: tense(running, "Setting up worktree", "Set up worktree"),
        target: d.branchName,
        mono: true,
        meta: `${done} / ${d.commands.length}`,
        detail: {
          kind: "list",
          items: d.commands.map((c) => ({
            icon: c.status === "completed" ? "Check" : c.status === "failed" ? "X" : "LoaderCircle",
            tone: c.status === "completed" ? "success" : c.status === "failed" ? "danger" : "accent",
            text: c.command,
            shell: true,
          })),
        },
      };
    }
    case "sub_agent": {
      const kind = d.subAgentType ? d.subAgentType[0]!.toUpperCase() + d.subAgentType.slice(1) : "Sub";
      const actions = d.actions ?? [];
      return {
        icon: "Bot",
        verb: `${kind} agent`,
        target: d.description,
        mono: false,
        meta: actions.length ? plural(actions.length, "action") : undefined,
        detail: actions.length
          ? { kind: "list", items: actions.slice(-20).map((a) => ({ text: a.summary ? `${a.toolName} ${a.summary}` : a.toolName })) }
          : d.log
            ? { kind: "text", text: clipLines(d.log) }
            : undefined,
      };
    }
    case "plain_text": {
      const text = d.text ? { kind: "text" as const, text: clipLines(d.text) } : undefined;
      const known = named(name);
      // The label is the subject (a skill's name, a command, an ACP title), never the verb.
      const target = d.label && d.label !== name ? firstLine(d.label) : known && d.text ? firstLine(d.text) : undefined;
      if (known) {
        const shell = /^terminal$/i.test(name);
        return { icon: known[0], verb: tense(running, known[1], known[2]), target, shell, mono: shell, detail: text };
      }
      return { icon: d.icon ? pascal(d.icon) : "Wrench", verb: readable(name), target, mono: false, detail: text };
    }
    case "plan":
    case "unknown": {
      const io =
        d.type === "unknown" && (d.input != null || d.output != null)
          ? { kind: "io" as const, input: clipLines(stringify(d.input)), output: clipLines(stringify(d.output)) }
          : undefined;
      const input = d.type === "unknown" ? d.input : undefined;
      const known = named(name);
      if (known) {
        // speak's input is the spoken text itself; its output is empty.
        const speech = known[0] === "MicVocal";
        return { icon: known[0], verb: tense(running, known[1], known[2]), target: inputTarget(input), mono: false, detail: speech ? undefined : io };
      }
      const mcp = mcpTool(name);
      if (mcp) return { icon: mcp.icon, verb: tense(running, "Calling", "Called"), target: mcp.server ? `${mcp.server} › ${mcp.tool}` : mcp.tool, mono: false, detail: io };
      return { icon: "Wrench", verb: tense(running, "Calling", "Called"), target: readable(name), mono: false, detail: io };
    }
  }
}

export function toolData(item: Item<"tool_call">): ToolData {
  // Claude background-task completions: the label is the task summary, the text is raw XML.
  const base =
    item.name === "task_notification" && item.detail.type === "plain_text"
      ? { icon: "Bell", verb: "Background task", target: item.detail.label, mono: false }
      : describe(item.detail, item.name, item.status === "running");
  if (item.status === "canceled") return { ...base, status: "canceled", icon: "CircleSlash", verb: "Canceled", meta: undefined };
  if (item.status === "failed") {
    const body = errorBody(item.error) ?? "";
    // Claude reports shell failures as "Exit code N" followed by the output: show it as exit N + output.
    const exit = item.detail.type === "shell" ? /^Exit code (\d+)\s*([\s\S]*)$/.exec(body.trim()) : null;
    if (exit && base.detail?.kind === "output") {
      const detail = base.detail.text ? base.detail : { ...base.detail, text: clipLines(exit[2] ?? "") };
      return { ...base, status: "failed", meta: `exit ${exit[1]}`, metaTone: "danger", detail };
    }
    return { ...base, status: "failed", meta: base.meta ?? "failed", metaTone: "danger", error: errorText(item.error) };
  }
  return { ...base, status: item.status };
}

/** Which "Show in timeline" switch covers a tool call; running and failed calls are never hidden. */
export function hideableKind(item: Item<"tool_call">): Hideable | undefined {
  if (item.status !== "completed") return undefined;
  if (item.name === "task_notification") return "task";
  const t = item.detail.type;
  return t === "read" || t === "search" || t === "fetch" ? t : undefined;
}

export function todoData(item: Item<"todo">) {
  const items = item.items.map((t) => {
    const status = t.status ?? (t.completed ? "completed" : "pending");
    return { status, text: status === "in_progress" && t.activeForm ? t.activeForm : t.text };
  });
  return { items, active: items.find((t) => t.status === "in_progress")?.text };
}

export function noticeData(item: Item<"error"> | Item<"compaction">) {
  if (item.type === "error") return { variant: "inline", tone: "danger", icon: "CircleAlert", text: item.message, pulsing: false } as const;
  if (item.status === "loading") return { variant: "divider", tone: "muted", icon: "Minimize2", text: "Compacting context…", pulsing: true } as const;
  const how = item.trigger === "manual" ? "manually" : "automatically";
  const tokens = item.preTokens ? ` · ${Math.round(item.preTokens / 1000)}K tokens` : "";
  return { variant: "divider", tone: "muted", icon: "Minimize2", text: `Context ${how} compacted${tokens}`, pulsing: false } as const;
}

export type { Phase };

const IMAGE_MD = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

export const imagesSchema = z.object({ images: z.array(z.object({ alt: z.string(), url: z.string() })) });

/** Images of an assistant message that is nothing but image markdown; mixed messages stay native. */
export function imageData(text: string) {
  if (text.replace(IMAGE_MD, "").trim()) return undefined;
  const images = [...text.matchAll(IMAGE_MD)].map((m) => ({ alt: m[1] || "Image", url: m[2]! }));
  return images.length ? { images } : undefined;
}

/** The latest turn as Markdown for a PR or handoff: your prompt quoted, the reply, then the files changed and failed commands. */
export function turnMarkdown(timeline: readonly AgentTimelineItem[], cwd: string): string | undefined {
  const start = timeline.findLastIndex((item) => item.type === "user_message");
  if (start < 0) return undefined;
  const prompt = (timeline[start] as Item<"user_message">).text.trim();
  const reply = timeline
    .slice(start + 1)
    .flatMap((item) => (item.type === "assistant_message" && item.text.trim() ? [item.text.trim()] : []))
    .join("\n\n");
  const parts = [prompt.split("\n").map((l) => `> ${l}`).join("\n"), reply];
  const recap = recapData(timeline, cwd);
  if (recap) {
    const added = recap.files.reduce((n, f) => n + f.added, 0);
    const removed = recap.files.reduce((n, f) => n + f.removed, 0);
    const head = [recap.files.length && `${plural(recap.files.length, "file")} +${added} −${removed}`, recap.commands && plural(recap.commands, "command"), recap.failed.length && `${recap.failed.length} failed`];
    parts.push(
      [
        `**Changes** · ${head.filter(Boolean).join(" · ")}`,
        ...recap.files.map((f) => `- \`${f.path}\` +${f.added} −${f.removed}`),
        ...recap.failed.map((f) => `- ✗ \`${f.command}\`${f.exit ? ` (exit ${f.exit})` : ""}`),
      ].join("\n"),
    );
  }
  return parts.filter(Boolean).join("\n\n");
}

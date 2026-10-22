import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import { z } from "zod";
import { diffLines } from "./diff.ts";

/** One line after a turn: the files it changed, the commands it ran and the ones that failed. */
export const recapSchema = z.object({
  files: z.array(z.object({ path: z.string(), added: z.number(), removed: z.number() })),
  commands: z.number(),
  failed: z.array(z.object({ command: z.string(), exit: z.number().optional() })),
});
export type Recap = z.output<typeof recapSchema>;

// Keeps the appended row far under the daemon's 64 KiB limit.
const MAX_FILES = 40;
const MAX_FAILED = 10;

/** Files changed with +/−, commands run and the ones that failed, across the given items. */
export function changeSummary(items: readonly AgentTimelineItem[], cwd: string): Recap {
  const files = new Map<string, { added: number; removed: number }>();
  let commands = 0;
  const failed: Recap["failed"] = [];
  // Paths inside the agent's folder are relative; others start from ~ rather than /Users/name.
  const relative = (path: string) => (path.startsWith(cwd + "/") ? path.slice(cwd.length + 1) : path.replace(/^\/(Users|home)\/[^/]+\//, "~/"));
  for (const item of items) {
    if (item.type !== "tool_call" || item.status === "running" || item.status === "canceled") continue;
    const d = item.detail;
    if (item.status === "completed" && (d.type === "edit" || d.type === "write")) {
      const file = files.get(relative(d.filePath)) ?? { added: 0, removed: 0 };
      if (d.type === "write") file.added += d.content ? d.content.split("\n").length : 0;
      else for (const l of diffLines(d)) l.sign === "+" ? file.added++ : l.sign === "-" && file.removed++;
      files.set(relative(d.filePath), file);
    }
    if (d.type !== "shell") continue;
    commands++;
    // Claude reports a failed command's exit code only in the error text ("Exit code 2").
    const exit = d.exitCode || Number(/Exit code (\d+)/.exec(JSON.stringify(item.error ?? ""))?.[1]) || undefined;
    if (item.status === "failed" || exit) failed.push({ command: d.command.trim().split("\n")[0] ?? "", exit });
  }
  return { files: [...files].map(([path, f]) => ({ path, ...f })), commands, failed };
}

/** The recap for the latest turn in an agent's timeline, or undefined when it changed no files and no command failed (Paseo's own rows already say "Ran 2 commands"). */
export function recapData(timeline: readonly AgentTimelineItem[], cwd: string): Recap | undefined {
  // Given more than one turn, the latest is everything after the last user message.
  const start = timeline.findLastIndex((item) => item.type === "user_message") + 1;
  const recap = changeSummary(timeline.slice(start), cwd);
  if (!recap.files.length && !recap.failed.length) return undefined;
  return { ...recap, files: recap.files.slice(0, MAX_FILES), failed: recap.failed.slice(0, MAX_FAILED) };
}

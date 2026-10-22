import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import { z } from "zod";
import { isHtmlTool, readHeights } from "../shared/html.ts";

// `heights`: width → height pairs the daemon measured when it checked the page, sorted by width; absent on pages it couldn't check, pages
// published with force, and older ones.
export const htmlSchema = z.object({ title: z.string(), html: z.string(), heights: z.array(z.tuple([z.number(), z.number()])).min(1).optional() });
export type HtmlData = z.output<typeof htmlSchema>;

/**
 * The page a finished html_render call published, read from the call's own input, plus the heights the daemon added to its output
 * (readHeights); failed calls (the tool rejected the page) stay tool rows.
 */
export function htmlData(item: AgentTimelineItem): HtmlData | undefined {
  if (item.type !== "tool_call" || item.status !== "completed" || item.detail.type !== "unknown" || !isHtmlTool(item.name)) return undefined;
  const input = item.detail.input as { title?: unknown; html?: unknown } | null;
  const output = item.detail.output as { isError?: unknown } | null;
  if (typeof input?.html !== "string" || output?.isError === true) return undefined;
  const heights = readHeights(output);
  return { title: typeof input.title === "string" && input.title.trim() ? input.title.trim() : "Page", html: input.html, ...(heights && { heights }) };
}

/**
 * The page's height at `width`, from the widths the daemon measured (at least one, sorted by width): in between, along the line between
 * the two nearest; outside, the nearest.
 */
export function heightAt(heights: ReadonlyArray<readonly [number, number]>, width: number) {
  const above = heights.findIndex(([w]) => w >= width);
  if (above <= 0) return heights.at(above)![1];
  const [w0, h0] = heights[above - 1]!;
  const [w1, h1] = heights[above]!;
  return Math.round(h0 + ((h1 - h0) * (width - w0)) / (w1 - w0));
}

/** The chat frame's sandbox. Never allow-same-origin: with it the page's scripts could reach the app's session and storage. */
export const FRAME_SANDBOX = "allow-scripts allow-popups allow-popups-to-escape-sandbox";

export interface FrameKey {
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** The key a frame passed on unhandled (Esc or an app shortcut), if `data` is one. */
export function frameKey(data: unknown): FrameKey | undefined {
  const d = data as Partial<Record<keyof FrameKey | "type", unknown>> | null;
  if (d?.type !== "cp-html-key" || typeof d.key !== "string" || typeof d.code !== "string") return undefined;
  return { key: d.key, code: d.code, metaKey: d.metaKey === true, ctrlKey: d.ctrlKey === true, shiftKey: d.shiftKey === true, altKey: d.altKey === true };
}

/** The web address a frame asked to open, if `data` is such a request for an http(s) one. */
export function frameLink(data: unknown) {
  const d = data as { type?: unknown; url?: unknown } | null;
  return d?.type === "cp-html-link" && typeof d.url === "string" && /^https?:\/\//i.test(d.url) ? d.url : undefined;
}

/** The content height (and the frame width it was measured at) a frame reports, if `data` is one. */
export function frameReport(data: unknown): { height: number; width: number } | undefined {
  const d = data as { type?: unknown; height?: unknown; width?: unknown } | null;
  if (d?.type !== "cp-html-height" || typeof d.height !== "number" || !Number.isFinite(d.height) || d.height <= 0) return undefined;
  return { height: Math.min(d.height, 20000), width: typeof d.width === "number" ? d.width : 0 };
}

/**
 * The frame's next height for a report. At one width the frame only grows: a page whose animation or live readout changes its height would
 * otherwise resize the frame every cycle, shifting the chat under the reader and, near its end, making Paseo scroll to the bottom. A new
 * width reflows the page, so the frame follows it down too, `later` (once the page settles) so a resize in progress doesn't flicker it.
 */
export function fitFrame(current: { height: number; width: number }, report: { height: number; width: number }): { height: number; later: boolean } | undefined {
  if (report.width === current.width) return report.height > current.height ? { height: report.height, later: false } : undefined;
  return { height: report.height, later: report.height < current.height };
}

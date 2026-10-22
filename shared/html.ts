import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/**
 * The MCP server the daemon gives new agents (server/html.ts): one tool shows an HTML page in the chat (client/html.ts), the other only lays
 * one out for the agent to look at.
 */
export const HTML_SERVER = "chat_polish";
export const HTML_TOOL = "html_render";
export const HTML_PREVIEW_TOOL = "html_preview";

/** The tool as each provider names it: "mcp__server__tool" (Claude) or "server.tool" (Codex). */
export const isHtmlTool = (name: string) => name === `mcp__${HTML_SERVER}__${HTML_TOOL}` || name === `${HTML_SERVER}.${HTML_TOOL}`;

// The page's height at each width the daemon laid it out at, on the last line of html_render's answer: the chat reads it back from the
// call's output, so a page's frame starts at its size without the daemon keeping anything.
const HEIGHTS = /Page height by width: ((?:\d+:\d+ ?)+)/;
export const heightsLine = (heights: ReadonlyArray<readonly [number, number]>) => `Page height by width: ${heights.map(([width, height]) => `${width}:${height}`).join(" ")}`;
/** The heights in a call's output, in whatever shape the provider keeps it; undefined without them. */
export function readHeights(output: unknown): Array<[number, number]> | undefined {
  const line = HEIGHTS.exec(JSON.stringify(output) ?? "")?.[1];
  return line ? line.trim().split(" ").map((pair) => pair.split(":").map(Number) as [number, number]) : undefined;
}

/** The browser that lays pages out before they show: Chrome for Testing's headless shell, which the user can download from the dashboard. */
export const browserStatusSchema = z.object({
  /** "unsupported": no build for this platform. */
  state: z.enum(["missing", "downloading", "installed", "failed", "unsupported"]),
  version: z.string(),
  /** Bytes received so far, while it downloads. */
  received: z.number().optional(),
  /** Bytes in all, when the server sends a Content-Length. */
  total: z.number().optional(),
  /** Why the last download failed, in the failed state. */
  error: z.string().optional(),
});
export type BrowserStatus = z.output<typeof browserStatusSchema>;
export const browserStatus = defineRpc({ name: "browser.status", input: z.object({}), output: browserStatusSchema });
/** Starts the download, if it isn't installed or under way; poll browser.status for its progress. */
export const installBrowser = defineRpc({ name: "browser.install", input: z.object({}), output: browserStatusSchema });
/** Deletes the headless shell from the plugin's cache: pages show unchecked until it's downloaded again. */
export const removeBrowser = defineRpc({ name: "browser.remove", input: z.object({}), output: browserStatusSchema });

/** Saves a page (already themed by the client) where the plugin's local server (the one serving the tool) serves it on the daemon's localhost, for the system browser. */
export const openHtml = defineRpc({ name: "html.open", input: z.object({ html: z.string().min(1).max(5_000_000) }), output: z.object({ url: z.string() }) });

// An image on the daemon machine, by absolute path (or file:// URL) in quotes or a CSS url(): the server checks it exists when the page is
// published, and the client swaps in its data when it shows the page, since a sandboxed frame can't load files. The image.read RPC's types.
const LOCAL_IMAGE = /(["'`])((?:file:\/\/)?(?:\/(?!\/)|[a-z]:[\\/])(?:(?!\1)[^\r\n]){0,2048}?\.(?:png|jpe?g|gif|webp))\1|url\(\s*((?:file:\/\/)?(?:\/(?!\/)|[a-z]:[\\/])[^\s"'`()]{0,2048}?\.(?:png|jpe?g|gif|webp))\s*\)/gi;

/** Where a page names local images, in order. */
export function localImages(html: string) {
  return Array.from(html.matchAll(LOCAL_IMAGE), (m) => {
    const path = (m[2] ?? m[3])!;
    const start = m.index! + m[0].indexOf(path);
    return { start, end: start + path.length, path };
  });
}

/** The page with each local image it names replaced by the data in `uris`; images missing from `uris` keep their path. */
export function inlineImages(html: string, uris: ReadonlyMap<string, string>) {
  let out = "";
  let at = 0;
  for (const { start, end, path } of localImages(html)) {
    const uri = uris.get(path);
    if (uri === undefined) continue;
    out += html.slice(at, start) + uri;
    at = end;
  }
  return out + html.slice(at);
}

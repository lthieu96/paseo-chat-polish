import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable, Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { htmlPage, themeCss } from "../shared/page.ts";
import { headlessShell } from "./headless-shell.ts";

// The chat's column on desktop and on a phone. The theme only has to lay the page out as the chat does: same fonts, kit and boot script.
const WIDTHS = [700, 360] as const;
// More widths the page's height is measured at, so the chat's frame can start at its size whatever the column's width.
const MORE_WIDTHS = [480, 600, 840, 1000] as const;
// A screenshot taller than this is cut; models scale long images down until they're unreadable anyway.
const SHOT_MAX_HEIGHT = 1600;
const THEME = themeCss(
  { surface0: "#1e1f22", surface1: "#2b2d31", border: "#3f4147", foreground: "#e6e6e6", foregroundMuted: "#9a9ca3", accent: "#5b8cff", accentForeground: "#ffffff", statusSuccess: "#3fb950", statusWarning: "#d29922", statusDanger: "#f85149" },
  { sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif', mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" },
  ["#5b8cff", "#3fb950", "#d29922", "#f85149", "#a371f7", "#39c5cf"],
);
const TIMEOUT_MS = 15_000;

interface Layout {
  wide: string[];
  overlaps: string[];
  cut: string[];
  truncated: string[];
}

/**
 * What laying a page out found: `problems` a reader would see; the console (up to 30 entries), its height at each width, sorted by width,
 * and a PNG of it at 700px (base64, cut at SHOT_MAX_HEIGHT). A page that hung the browser has only its problem.
 */
export interface PageCheck {
  problems: string[];
  console: string[];
  heights: Array<[width: number, height: number]>;
  screenshot: string;
}

// The page's height as the boot script reports it to the chat.
const HEIGHT = `(() => { const root = document.documentElement; return Math.ceil(root.scrollHeight > root.clientHeight ? root.scrollHeight : root.getBoundingClientRect().height); })()`;
// Runs in the page: what a reader would see wrong, as short descriptions.
const MEASURE = `(() => {
  const W = innerWidth, out = { wide: [], overlaps: [], cut: [], truncated: [] }, root = document.documentElement;
  const name = (el) => "<" + el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\\s+/).join(".") : "") + ">";
  const quote = (text) => JSON.stringify(text.trim().replace(/\\s+/g, " ").slice(0, 40));
  if (root.scrollWidth > W + 1) {
    for (const el of document.body.querySelectorAll("*")) {
      const box = el.getBoundingClientRect(), parent = el.parentElement && el.parentElement.getBoundingClientRect();
      if (box.width && box.right > W + 1 && !(parent && parent.right > W + 1)) out.wide.push(name(el) + " reaches " + Math.round(box.right) + "px");
      if (out.wide.length >= 3) break;
    }
  }
  for (const el of document.body.querySelectorAll("*")) {
    if (out.truncated.length >= 3) break;
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow === "ellipsis" && el.textContent.trim() && el.checkVisibility()) out.truncated.push(quote(el.textContent));
  }
  // The part of a box its scroll boxes and overflow:hidden ancestors (an <svg> is one) leave on screen: what they hide can't overlap anything.
  const shown = (el, box) => {
    let { left, top, right, bottom } = box;
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const style = getComputedStyle(p);
      if (style.overflowX === "visible" && style.overflowY === "visible") continue;
      const frame = p.getBoundingClientRect();
      left = Math.max(left, frame.left); top = Math.max(top, frame.top); right = Math.min(right, frame.right); bottom = Math.min(bottom, frame.bottom);
    }
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  };
  const boxes = [], walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node; (node = walker.nextNode()) && boxes.length < 1500; ) {
    const el = node.parentElement;
    if (!el || !node.data.trim() || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TITLE)$/.test(el.tagName)) continue;
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    let rects = Array.from(range.getClientRects());
    if (!rects.length && el instanceof SVGElement) rects = [el.getBoundingClientRect()];
    for (const box of rects) if (box.width > 1 && box.height > 1) boxes.push({ box, seen: shown(el, box), node, el });
  }
  for (const { box, node, el } of boxes) {
    const svg = el instanceof SVGElement && el.ownerSVGElement;
    if (!svg || out.cut.length >= 3) continue;
    const frame = svg.getBoundingClientRect();
    if (box.left < frame.left - 1 || box.right > frame.right + 1 || box.top < frame.top - 1 || box.bottom > frame.bottom + 1) out.cut.push(quote(node.data));
  }
  const seen = boxes.filter((b) => b.seen.width > 1 && b.seen.height > 1);
  outer: for (let i = 0; i < seen.length; i++) {
    for (let j = i + 1; j < seen.length; j++) {
      const a = seen[i], b = seen[j];
      if (a.node === b.node) continue;
      const w = Math.min(a.seen.right, b.seen.right) - Math.max(a.seen.left, b.seen.left), h = Math.min(a.seen.bottom, b.seen.bottom) - Math.max(a.seen.top, b.seen.top);
      if (w <= 2 || h <= 2 || w * h < 0.3 * Math.min(a.seen.width * a.seen.height, b.seen.width * b.seen.height)) continue;
      out.overlaps.push(quote(a.node.data) + " and " + quote(b.node.data));
      if (out.overlaps.length >= 5) break outer;
    }
  }
  return out;
})()`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The DevTools protocol over --remote-debugging-pipe: NUL-separated JSON on fds 3 (in) and 4 (out), so no port and no WebSocket.
function launch(executable: string, profile: string) {
  // Chrome refuses to sandbox as root, the one case its sandbox has to go.
  const root = process.getuid?.() === 0 ? ["--no-sandbox"] : [];
  const child = spawn(executable, [...root, "--remote-debugging-pipe", "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars", "--mute-audio", `--user-data-dir=${profile}`, "about:blank"], {
    stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"],
  });
  // The end of what the browser printed, which says why when it quits at start (a missing library, no usable sandbox).
  let said = "";
  (child.stderr as Readable).setEncoding("utf8").on("data", (chunk: string) => (said = (said + chunk).slice(-600)));
  const commands = child.stdio[3] as Writable;
  const events = child.stdio[4] as Readable;
  const waiting = new Map<number, (message: { result?: unknown; error?: { message: string } }) => void>();
  const listeners = new Set<(message: { method: string; params: Record<string, unknown>; sessionId?: string }) => void>();
  let id = 0;
  let buffer = "";
  events.setEncoding("utf8");
  events.on("data", (chunk: string) => {
    buffer += chunk;
    for (let at = buffer.indexOf("\0"); at >= 0; at = buffer.indexOf("\0")) {
      const message = JSON.parse(buffer.slice(0, at));
      buffer = buffer.slice(at + 1);
      if (message.id) waiting.get(message.id)?.(message);
      else for (const listener of listeners) listener(message);
    }
  });
  // A browser that quits (it crashed) fails what it was asked, rather than leaving it to the timeout; one that can't start (removed while
  // this check waited its turn) emits only "error", which would otherwise take the daemon down.
  child.once("exit", (code, signal) => {
    const why = said.trim().split("\n").filter((line) => !/^\s*$/.test(line)).slice(-3).join(" | ");
    for (const settle of waiting.values()) settle({ error: { message: `the browser exited (${code ?? signal})${why ? `: ${why}` : ""}` } });
  });
  child.once("error", (error) => {
    for (const settle of waiting.values()) settle({ error: { message: `the browser couldn't start: ${error.message}` } });
  });
  // Writing to a browser that's gone fails the command below, not the process.
  commands.on("error", () => undefined);
  const send = <T = Record<string, unknown>>(method: string, params: object = {}, sessionId?: string) =>
    new Promise<T>((resolve, reject) => {
      if (child.exitCode !== null || child.signalCode !== null) return reject(new Error(`${method}: the browser exited`));
      const n = ++id;
      waiting.set(n, (message) => {
        waiting.delete(n);
        if (message.error) reject(new Error(`${method}: ${message.error.message}`));
        else resolve(message.result as T);
      });
      commands.write(`${JSON.stringify({ id: n, method, params, sessionId })}\0`);
    });
  return { child, send, listeners };
}

type ConsoleArg = { value?: unknown; description?: string };
type StackFrame = { functionName: string; lineNumber: number };

// The answer for a page whose scripts kept the browser busy past TIMEOUT_MS: a reader would see a frozen page, so it's a problem, not a
// check that couldn't run.
const HUNG = "timed out" as const;

async function inspect(html: string, executable: string) {
  const profile = await mkdtemp(join(tmpdir(), "chat-polish-check-"));
  const { child, send, listeners } = launch(executable, profile);
  // Past a deadline the browser is killed, which fails its pending commands and so the check. The first covers its start (a slow one
  // isn't the page's fault, so the page goes out unchecked); the second, from when the page has a tab, covers the page.
  let hung = false;
  let deadline = setTimeout(() => child.kill(), TIMEOUT_MS);
  try {
    const file = join(profile, "page.html");
    // Absolute image paths resolve against file:///, so local images load as they will in the chat.
    await writeFile(file, htmlPage(html, THEME));
    const { targetId } = await send<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });
    const page = <T = Record<string, unknown>>(method: string, params: object = {}) => send<T>(method, params, sessionId);
    clearTimeout(deadline);
    deadline = setTimeout(() => {
      hung = true;
      child.kill();
    }, TIMEOUT_MS);
    const errors: string[] = [];
    const logs: string[] = [];
    let loaded!: () => void;
    const load = new Promise<void>((resolve) => (loaded = resolve));
    listeners.add(({ method, params, sessionId: from }) => {
      if (from !== sessionId) return;
      if (method === "Page.loadEventFired") loaded();
      if (method === "Runtime.exceptionThrown") {
        const details = params.exceptionDetails as { text: string; lineNumber: number; exception?: { description?: string }; stackTrace?: { callFrames: StackFrame[] } };
        // Where it was thrown and its callers, so the agent can find the code; the page's lines, as its own script is inlined in place.
        const [at, ...callers] = details.stackTrace?.callFrames ?? [];
        const from = callers.slice(0, 3).map((frame) => `${frame.functionName || "(anonymous)"} on line ${frame.lineNumber + 1}`);
        const error = `${(details.exception?.description ?? details.text).split("\n")[0]} (page line ${details.lineNumber + 1}${at?.functionName ? ` in ${at.functionName}` : ""}${from.length ? `, called from ${from.join(", ")}` : ""})`;
        errors.push(error);
        if (logs.length < 30) logs.push(`exception: ${error.slice(0, 300)}`);
      }
      if (method === "Runtime.consoleAPICalled") {
        const text = (params.args as ConsoleArg[]).map((arg) => String(arg.value ?? arg.description ?? "")).join(" ").slice(0, 300);
        if (params.type === "error") errors.push(`console.error: ${text}`);
        if (logs.length < 30) logs.push(`${params.type}: ${text}`);
      }
    });
    await page("Runtime.enable");
    await page("Page.enable");
    const resize = (width: number) => page("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
    const height = async () => (await page<{ result: { value: number } }>("Runtime.evaluate", { expression: HEIGHT, returnByValue: true })).result.value;
    const measure = async (width: number) => {
      await resize(width);
      await sleep(400);
      return (await page<{ result: { value: Layout } }>("Runtime.evaluate", { expression: MEASURE, returnByValue: true })).result.value;
    };
    await resize(WIDTHS[0]);
    await page("Page.navigate", { url: pathToFileURL(file).href });
    await Promise.race([load, sleep(5000)]);
    const layouts: Array<[number, Layout]> = [];
    const heights = new Map<number, number>();
    // Heights while animations run, at the first width: the chat's frame only grows, so a page that moves leaves gaps or a jump.
    const samples: number[] = [];
    layouts.push([WIDTHS[0], await measure(WIDTHS[0])]);
    for (let i = 0; i < 4; i++) {
      if (i) await sleep(250);
      samples.push(await height());
    }
    heights.set(WIDTHS[0], Math.max(...samples));
    const { data: screenshot } = await page<{ data: string }>("Page.captureScreenshot", {
      format: "png",
      clip: { x: 0, y: 0, width: WIDTHS[0], height: Math.max(1, Math.min(samples.at(-1)!, SHOT_MAX_HEIGHT)), scale: 1 },
      captureBeyondViewport: true,
    });
    for (const width of WIDTHS.slice(1)) {
      layouts.push([width, await measure(width)]);
      heights.set(width, await height());
    }
    for (const width of MORE_WIDTHS) {
      await resize(width);
      await sleep(150);
      heights.set(width, await height());
    }
    return { errors, logs, layouts, samples, heights: [...heights].sort(([a], [b]) => a - b), screenshot };
  } catch (error) {
    if (hung) return HUNG;
    throw error;
  } finally {
    clearTimeout(deadline);
    child.kill();
    await rm(profile, { recursive: true, force: true }).catch(() => undefined);
  }
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Lays a page out as the chat does, at desktop and phone widths, and names what a reader would see wrong: script errors, overlapping text,
 * text cut off at its SVG's edge or with an ellipsis, a page wider than the column, a height that moves while it runs, scripts that keep
 * the browser busy. Undefined when it couldn't be checked (the headless shell isn't installed, or the check itself failed): html_render
 * then publishes the page unchecked, and html_preview reports only its source checks.
 */
// ponytail: one browser at a time, launched per check (about 3s); keep one warm if agents publish often.
// ponytail: a shell that's there but can't start (a Linux box missing its libraries) leaves every page unchecked, with only a log line; say so in the dashboard if that shows up.
export function checkPage(html: string): Promise<PageCheck | undefined> {
  const executable = headlessShell();
  if (!executable) return Promise.resolve(undefined);
  const run = async (): Promise<PageCheck> => {
    const result = await inspect(html, executable);
    if (result === HUNG) {
      return { problems: [`The page didn't finish loading within ${TIMEOUT_MS / 1000}s: a script keeps the browser busy (an endless loop, or far too much work up front)`], console: [], heights: [], screenshot: "" };
    }
    const problems = [...new Set(result.errors)].slice(0, 3).map((error) => `Script error: ${error}`);
    // The same finding at both widths is reported once, with both.
    const found = new Map<string, number[]>();
    for (const [width, layout] of result.layouts) {
      const add = (finding: string) => found.set(finding, [...(found.get(finding) ?? []), width]);
      if (layout.overlaps.length) add(`text overlaps: ${layout.overlaps.join("; ")}`);
      if (layout.cut.length) add(`text is cut off at the edge of its SVG: ${layout.cut.join(", ")}`);
      if (layout.truncated.length) add(`text is cut off with an ellipsis; let it wrap or give it room: ${layout.truncated.join(", ")}`);
      if (layout.wide.length) add(`the page is wider than the column: ${layout.wide.join(", ")}`);
    }
    for (const [finding, widths] of found) problems.push(`At ${widths.join(" and ")}px wide, ${finding}`);
    const low = Math.min(...result.samples);
    const high = Math.max(...result.samples);
    if (high - low > 24) problems.push(`The page's height changes while it runs (${low} to ${high}px); reserve the space up front`);
    return { problems, console: result.logs, heights: result.heights, screenshot: result.screenshot };
  };
  const next = queue.then(run, run).catch((error: unknown) => (console.warn("[chat-polish] couldn't check an html_render page", error), undefined));
  queue = next;
  return next;
}

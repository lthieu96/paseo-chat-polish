import type { AgentSessionConfig } from "@getpaseo/protocol/agent-types";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import { HTML_PREVIEW_TOOL, HTML_SERVER, HTML_TOOL, heightsLine, localImages } from "../shared/html.ts";
import { headlessShell } from "./headless-shell.ts";
import { cacheDir } from "./icons.ts";
import { checkPage, type PageCheck } from "./page-check.ts";

// The tool's description is the style guide: the model reads it when it builds a page, on every provider.
const DESCRIPTION = `Show a finished HTML page inline in this chat, above your reply: a chart, table, dashboard, simulation, interactive explainer or UI mockup. Call it only when the user asks for a visual, and once per page, when the page is complete.

Page
- One self-contained HTML document with inline <style> and <script>. Prefer inline SVG or canvas; load a library from an https CDN only when it saves real work.
- Local images (screenshots, generated images): write their absolute paths, as in src="/abs/shot.png" or CSS url(/abs/bg.webp). PNG, JPEG, GIF or WebP up to 12 MB; the chat inlines them.
- The page sits on the chat background, as wide as the reply column (about 700px on desktop, 360px on phones) and aligned with your text. No page background, no outer card, border or title banner, and no horizontal padding on the outermost element. Use fluid widths.
- Content sets the height. Never use vh units or height:100% on html or body; give charts and canvases fixed pixel heights.

Theme
These CSS variables follow the user's theme live. Use only them for color, never hard-coded values; a canvas or chart library reads them with getComputedStyle(document.documentElement).getPropertyValue("--fg").
--fg, --muted (secondary text), --bg (chat background), --surface (raised panels), --border, --accent, --accent-fg (text on accent), --success, --warning, --danger, --chart-1 to --chart-6 (data series), --radius, --font, --mono.

Built-in styles (prefer them to custom CSS)
.stack (vertical, 12px gap), .row (horizontal, wraps, 8px gap), .grid (auto-fit columns), .card (raised panel), .stat > .label + .value (a metric), .chip, .muted, .small. Buttons (add .primary for the main action), inputs, selects, range sliders, tables, code and kbd are already styled.

Style
At most three font sizes, spacing in multiples of 4px, one accent color, series colors only for data. Right-align numbers in tables; label axes and units. Animations run 150 to 300ms ease-out and respect prefers-reduced-motion. Simulations size the canvas by devicePixelRatio, offer Play, Pause, Reset and sliders for the key parameters, draw a meaningful first frame, and pause while off-screen (IntersectionObserver).

Follow the layout rules in your instructions: you never see the page, so nothing may rely on hand-picked coordinates. The tool lays the page out at 700 and 360px before showing it; when it finds script errors, overlapping or cut-off text, overflow or a moving height, it shows nothing and returns them for you to fix.`;

/**
 * Added to a new agent's system prompt while the html pref is on: when the tool is wanted, and the layout rules, since a description can load late and the agent
 * never sees its page. Overlapping labels were the most common fault in trials, all from text placed at hand-picked coordinates.
 */
const SYSTEM_PROMPT = `# HTML pages
You have an ${HTML_TOOL} tool that shows an HTML page inline in this chat.

When to use it
- Only when the user asks for a visual, in any language: draw, chart, plot, visualize, illustrate, simulate, animate, mock up. Answer everything else in text.
- Flowcharts, sequence, state, class and ER diagrams: write a \`\`\`mermaid block in your reply instead. The chat draws and lays it out.

Layout rules
You never see the page you publish, so build it so nothing can overlap, get cut off or move the chat:
- Put text in normal HTML flow (flex, grid, tables) and let it wrap. Don't position text absolutely or at fixed coordinates when HTML layout can place it.
- In SVG and canvas, compute positions from the data in your script, never from hand-picked numbers. Give each item (step, message, bar) its own row, at least 20px per line of text plus 12px. Put labels in their own row above or beside a shape, never on another label, line or arrow. Size the viewBox from the rows. Split long labels into short lines with <tspan>, and make boxes wider than their text (about 0.6 × font size per character).
- Keep at least 8px between labels, and between text and a box edge. Everything must fit a 360px-wide page too.
- Simulations: moving parts get a region of their own; readouts and controls go below the canvas, in HTML.
- Animations and controls must not change the page's height: the chat resizes the frame to fit, so the conversation would jump. Reserve space for every state up front: fixed or min-height areas (one that scrolls its overflow is fine), room for rows that appear later, single-line readouts with tabular numbers.

Your reply
After publishing, write one or two sentences the page doesn't already say: a takeaway, a caveat or a next step. Never say the page is shown, above, ready or rendered, and never reply with only punctuation.`;

// Only for agents created while the headless shell is installed: html_preview has nothing to lay a page out in without it.
const PREVIEW_RULE = `- To see a page before publishing it (canvas drawings, dense SVG), call ${HTML_PREVIEW_TOOL}: it reports what ${HTML_TOOL} would reject and, once the page passes, returns a screenshot. It doesn't publish the page, and it means writing the page twice, so skip it for plain layouts.`;

const TOOL = {
  name: HTML_TOOL,
  description: DESCRIPTION,
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short name for the page" },
      html: { type: "string", description: "A complete, self-contained HTML document" },
      force: { type: "boolean", description: "Publish without the layout check. Only when a check reported problems you made on purpose." },
    },
    required: ["title", "html"],
  },
  annotations: { title: "Render HTML", readOnlyHint: true },
};
const PREVIEW = {
  name: HTML_PREVIEW_TOOL,
  description: `Lay an HTML page out exactly as ${HTML_TOOL} would, without publishing it, and get back what ${HTML_TOOL}'s checks would reject, its console output, its height and, once it passes them, a screenshot at 700px wide. Optional: ${HTML_TOOL} runs the same checks itself, and previewing means writing the page twice. Use it for what the checks can't judge (canvas drawings, dense SVG, a look you need to see), then publish the page with ${HTML_TOOL}.`,
  inputSchema: { type: "object", properties: { html: { type: "string", description: "A complete, self-contained HTML document" } }, required: ["html"] },
  annotations: { title: "Preview HTML", readOnlyHint: true },
};
// The frame grows to fit the page, so a size that follows the viewport grows it again and again. Only stylesheets and style attributes are
// scanned, so a page that mentions the unit in its text passes; comments match first so their contents are skipped.
const CSS_SOURCE = /<!--[\s\S]*?(?:-->|$)|<style\b[^>]*(?:>|$)([\s\S]*?)(?:<\/style\s*>|$)|\sstyle\s*=\s*(?:"([^"]*)(?:"|$)|'([^']*)(?:'|$)|([^\s>]+))/gi;
// The lookbehind skips base64 runs, such as an inlined image that happens to contain "1vh".
const VIEWPORT = /(?<![\w.+/])(?:\d+(?:\.\d+)?|\.\d+)[sld]?vh(?![\w-])/i;
const viewportUnit = (html: string) => {
  for (const [, sheet, double, single, bare] of html.matchAll(CSS_SOURCE)) {
    const found = VIEWPORT.exec(sheet ?? double ?? single ?? bare ?? "")?.[0];
    if (found) return found;
  }
  return undefined;
};

// Classic inline scripts, compiled but not run: a syntax error leaves the page blank or half-built, and this names it with its line even
// when the page isn't laid out (no headless browser, or force). Modules, src scripts and errors at run time are left to the page check.
const SCRIPT = /<!--[\s\S]*?(?:-->|$)|<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
function scriptError(html: string) {
  let n = 0;
  for (const [, attrs, code] of html.matchAll(SCRIPT)) {
    if (attrs === undefined) continue;
    n++;
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1];
    if (/\bsrc\s*=/i.test(attrs) || (type && !/^(?:text|application)\/(?:java|ecma)script$/i.test(type))) continue;
    try {
      new Script(code!, { filename: "script" });
    } catch (error) {
      const line = Number(/^script:(\d+)/.exec((error as Error).stack ?? "")?.[1]);
      const text = line ? code!.split("\n")[line - 1]?.trim().slice(0, 160) : undefined;
      return `Script ${n} has a syntax error${line ? ` on its line ${line}` : ""}: ${(error as Error).message}.${text ? ` The line: ${text}` : ""}`;
    }
  }
  return undefined;
}

// Same limit as the image.read RPC the chat loads them with.
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
async function imageError(html: string) {
  const paths = [...new Set(localImages(html).map((image) => image.path))];
  const sizes = await Promise.all(paths.map((path) => stat(path.startsWith("file://") ? fileURLToPath(path) : path).then((info) => (info.isFile() ? info.size : -1), () => -1)));
  const missing = paths.filter((_, i) => sizes[i]! < 0);
  if (missing.length) return `These local images could not be read: ${missing.join(", ")}. Use absolute paths to existing image files, or remove them.`;
  const large = paths.find((_, i) => sizes[i]! > MAX_IMAGE_BYTES);
  return large ? `${large} is over 12 MB; use a smaller image.` : undefined;
}

interface RpcMessage {
  id?: unknown;
  method?: unknown;
  params?: { protocolVersion?: unknown; name?: unknown; arguments?: { html?: unknown; force?: unknown } };
}

/**
 * The MCP server's answer to one JSON-RPC message, undefined for a notification. It only checks the page: the chat reads it from the
 * call's input, which the provider's transcript keeps, so nothing is stored here.
 */
export async function mcpAnswer(m: RpcMessage) {
  if (m.id === undefined) return undefined;
  const result = (value: unknown) => ({ jsonrpc: "2.0", id: m.id, result: value });
  const text = (value: string, isError = false) => result({ content: [{ type: "text", text: value }], isError });
  if (m.method === "initialize") return result({ protocolVersion: m.params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: HTML_SERVER, version: "1" } });
  if (m.method === "ping") return result({});
  // html_preview while the headless shell is installed; without it pages go out unchecked and there's nothing to preview them in.
  if (m.method === "tools/list") return result({ tools: headlessShell() ? [TOOL, PREVIEW] : [TOOL] });
  if (m.method !== "tools/call") return { jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "Method not found" } };
  const html = m.params?.arguments?.html;
  const preview = m.params?.name === PREVIEW.name;
  if ((m.params?.name !== TOOL.name && !preview) || typeof html !== "string" || !html.trim()) return text(preview ? "Pass a complete HTML document." : "Pass a title and a complete HTML document.", true);
  if (html.length > 200000) return text("The page is over 200,000 characters; make it smaller.", true);
  const vh = viewportUnit(html);
  const problem = (vh && `The page uses a viewport height unit (${vh}). Let content set the height, or use fixed pixel heights.`) || scriptError(html) || (await imageError(html));
  if (preview) return result(previewAnswer(problem, await checkPage(html)));
  if (problem) return text(problem, true);
  const check = m.params?.arguments?.force === true ? undefined : await checkPage(html);
  if (check?.problems.length) {
    return text(`The page was laid out as the chat shows it, and a reader would see these problems. Fix them and call ${HTML_TOOL} again; pass force: true only if every one is on purpose.\n- ${check.problems.join("\n- ")}`, true);
  }
  const shown = "Shown to the reader above your reply. Don't say it's shown and don't describe it; reply in one or two sentences with what it doesn't say: a takeaway, a caveat or a next step.";
  if (check) return text(`${shown}\n\n${heightsLine(check.heights)}`);
  // The browser is there but the check didn't run (it couldn't start, or failed): the agent should know nothing vouched for the page.
  const unchecked = m.params?.arguments?.force !== true && headlessShell();
  return text(unchecked ? `${shown} The layout check couldn't run, so it went out unchecked.` : shown);
}

/**
 * What html_preview tells the agent: everything html_render would, as notes rather than a rejection. The screenshot comes only once the
 * checks pass: until then the problems say what to fix, and Paseo shows every image a tool returns in the chat.
 */
function previewAnswer(problem: string | undefined, check: PageCheck | undefined) {
  const problems = [problem, ...(check?.problems ?? [])].filter(Boolean);
  const height = (width: number) => check?.heights.find(([w]) => w === width)?.[1];
  const heights = height(700) && height(360) ? [`Height: ${height(700)}px at 700px wide, ${height(360)}px at 360px.`] : [];
  const text = [
    check
      ? `Laid out as the chat would show it, at 700px and 360px wide. The page wasn't published.${problems.length ? " The screenshot comes once these are fixed." : " The screenshot is at 700px."}`
      : `The page couldn't be laid out (${headlessShell() ? "the check failed" : "the headless browser isn't installed"}), so only its source was checked. The page wasn't published.`,
    problems.length ? `${HTML_TOOL} would reject it for:\n- ${problems.join("\n- ")}` : `${HTML_TOOL}'s checks pass.`,
    ...(check ? [check.console.length ? `Console:\n${check.console.join("\n")}` : "Console: nothing logged.", ...heights] : []),
    `When it looks right, publish it with ${HTML_TOOL}.`,
  ].join("\n\n");
  const shot = check && !problems.length ? [{ type: "image", data: check.screenshot, mimeType: "image/png" }] : [];
  return { content: [{ type: "text", text }, ...shot], isError: false };
}

/** A new agent's config with the tools added, preapproved so calling them never asks for permission, loaded up front on Claude, and its rules appended to the system prompt. */
export function withHtmlTool(config: AgentSessionConfig, { url, token }: { url: string; token: string }): AgentSessionConfig {
  return {
    ...config,
    mcpServers: { ...config.mcpServers, [HTML_SERVER]: { type: "http", url, headers: { Authorization: `Bearer ${token}` }, alwaysLoad: true } },
    toolPolicy: { ...config.toolPolicy, preapproved: [...(config.toolPolicy?.preapproved ?? []), ...[HTML_TOOL, HTML_PREVIEW_TOOL].map((tool) => ({ kind: "mcp" as const, server: HTML_SERVER, tool }))] },
    systemPrompt: [config.systemPrompt, headlessShell() ? SYSTEM_PROMPT.replace("\n\nYour reply", `\n${PREVIEW_RULE}\n\nYour reply`) : SYSTEM_PROMPT].filter(Boolean).join("\n\n"),
  };
}

// ---- The local server: the tool for agents, and pages for the system browser ----

const MCP_PATH = "/mcp";
// Served with a sandbox policy like the chat's frame, plus forms and modals a browser tab can show: the page gets an opaque origin, so it
// can't read anything else served here.
const PAGE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
};
const pagesDir = () => join(cacheDir(), "pages");
const addressFile = () => join(cacheDir(), "html-server.json");
let listening: Promise<{ server: Server; port: number; token: string }> | undefined;

// Stateless Streamable HTTP: one JSON answer per POST, no event stream and no sessions, so a plugin restart between calls goes unnoticed.
async function serveMcp(req: IncomingMessage, res: ServerResponse, token: string) {
  if (req.method !== "POST") return void res.writeHead(405, { Allow: "POST" }).end();
  if (req.headers.authorization !== `Bearer ${token}`) return void res.writeHead(403).end();
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  let message: unknown;
  try {
    message = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return void res.writeHead(400).end();
  }
  const answer = message && typeof message === "object" ? await mcpAnswer(message as RpcMessage) : undefined;
  if (!answer) return void res.writeHead(202).end();
  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(answer));
}

async function serve(req: IncomingMessage, res: ServerResponse, token: string) {
  if (req.url === MCP_PATH) return serveMcp(req, res, token);
  const name = /^\/([0-9a-f]{64})\.html$/.exec(req.url ?? "")?.[1];
  const page = name ? await readFile(join(pagesDir(), `${name}.html`)).catch(() => undefined) : undefined;
  if (!page) return void res.writeHead(404).end();
  res.writeHead(200, PAGE_HEADERS).end(page);
}

// ponytail: localhost on the daemon's machine, so a page opened from a remote daemon's chat doesn't load; serve through Paseo's relay if that's needed.
/**
 * One server in the plugin's process for every agent's tool and every opened page, on 127.0.0.1; the tool needs the token, a page only its
 * hash. Its port and token are saved, so agents keep working across restarts with the address they were created with; a new port only if the
 * old one is taken, and agents created before then lose the tool.
 */
function localServer() {
  listening ??= (async () => {
    const saved = (await readFile(addressFile(), "utf8").then(JSON.parse).catch(() => undefined)) as { port?: unknown; token?: unknown } | undefined;
    const token = typeof saved?.token === "string" ? saved.token : randomBytes(24).toString("hex");
    const start = (port: number) =>
      new Promise<Server>((resolve, reject) => {
        const server = createServer((req, res) =>
          serve(req, res, token).catch((error: unknown) => {
            console.error("[chat-polish] html server", req.method, req.url, error);
            if (!res.headersSent) res.writeHead(500);
            res.end();
          }),
        );
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
          server.off("error", reject);
          resolve(server);
        });
      });
    const server = await (typeof saved?.port !== "number"
      ? start(0)
      : start(saved.port).catch((error: unknown) => {
          console.warn(`[chat-polish] html server port ${saved.port} unavailable, agents created before now lose html_render`, error);
          return start(0);
        }));
    const port = (server.address() as { port: number }).port;
    if (port !== saved?.port || token !== saved?.token) {
      // Unsaved, the server still works until the plugin stops; only the next start picks a new address.
      await mkdir(cacheDir(), { recursive: true })
        .then(() => writeFile(addressFile(), JSON.stringify({ port, token })))
        .catch((error: unknown) => console.warn("[chat-polish] couldn't save the html server's address", error));
    }
    return { server, port, token };
  })();
  listening.catch(() => (listening = undefined));
  return listening;
}

/** Where agents reach the chat_polish MCP server (html_render, and html_preview while the headless browser is installed). */
export const startHtmlTool = () => localServer().then(({ port, token }) => ({ url: `http://127.0.0.1:${port}${MCP_PATH}`, token }));

/** Saves the page under its hash and returns its address on the daemon's localhost. */
export async function openHtmlPage({ html }: { html: string }) {
  const name = createHash("sha256").update(html).digest("hex");
  await mkdir(pagesDir(), { recursive: true });
  await writeFile(join(pagesDir(), `${name}.html`), html);
  const { port } = await localServer();
  return { url: `http://127.0.0.1:${port}/${name}.html` };
}

export async function closeLocalServer() {
  const current = await listening?.catch(() => undefined);
  listening = undefined;
  current?.server.close();
  current?.server.closeAllConnections();
}

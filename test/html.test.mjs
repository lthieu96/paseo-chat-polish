import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { FRAME_SANDBOX, fitFrame, frameKey, frameLink, frameReport, heightAt, htmlData } from "../client/html.ts";
import { htmlPage } from "../shared/page.ts";
import { heightsLine, inlineImages, localImages, readHeights } from "../shared/html.ts";
import { stepKey } from "../client/steps.ts";

// The Paseo home the headless shell is installed in (~/.paseo, or CI's); the MCP test swaps in an empty one.
const home = process.env.PASEO_HOME;
const call = (name, input, extra = {}) => ({ type: "tool_call", callId: "1", name, status: "completed", error: null, detail: { type: "unknown", input, output: null }, ...extra });

test("htmlData: reads finished calls from Claude and Codex, skips running, failed and other tools", () => {
  const page = { title: " Chart ", html: "<p>x</p>" };
  assert.deepEqual(htmlData(call("mcp__chat_polish__html_render", page)), { title: "Chart", html: "<p>x</p>" });
  assert.deepEqual(htmlData(call("chat_polish.html_render", { html: "<p>x</p>" })), { title: "Page", html: "<p>x</p>" });
  assert.equal(htmlData(call("chat_polish.html_render", page, { status: "running" })), undefined);
  assert.equal(htmlData(call("chat_polish.html_render", page, { status: "failed" })), undefined);
  assert.equal(htmlData({ ...call("chat_polish.html_render", page), detail: { type: "unknown", input: page, output: { isError: true } } }), undefined);
  assert.equal(htmlData(call("mcp__other__html_render", page)), undefined);
  // A page never folds into a merged steps row, and its frame never gets the app's origin.
  assert.equal(stepKey(call("mcp__chat_polish__html_render", page)), undefined);
  assert.equal(stepKey(call("chat_polish.html_render", page)), undefined);
  assert.doesNotMatch(FRAME_SANDBOX, /allow-same-origin/);
});

test("page heights: read back from the call's output in either provider's shape, and read between the widths measured", () => {
  const page = { title: "Chart", html: "<p>x</p>" };
  const line = heightsLine([[360, 900], [700, 500], [1000, 400]]);
  const heights = [[360, 900], [700, 500], [1000, 400]];
  // Claude keeps the answer's text as `output`; Codex keeps the MCP result.
  assert.deepEqual(htmlData(call("mcp__chat_polish__html_render", page, { detail: { type: "unknown", input: page, output: { output: `Shown to the reader.\n\n${line}` } } })).heights, heights);
  assert.deepEqual(htmlData(call("chat_polish.html_render", page, { detail: { type: "unknown", input: page, output: { content: [{ type: "text", text: `Shown.\n\n${line}` }] } } })).heights, heights);
  assert.equal("heights" in htmlData(call("chat_polish.html_render", page, { detail: { type: "unknown", input: page, output: { output: "Shown." } } })), false);
  assert.equal(heightAt(heights, 700), 500);
  assert.equal(heightAt(heights, 530), 700);
  assert.equal(heightAt(heights, 320), 900);
  assert.equal(heightAt(heights, 1400), 400);
});

test("htmlPage: the bootstrap lands inside head, after a doctype, never before it", () => {
  const theme = ":root{--fg:#fff}";
  const withHead = htmlPage("<!doctype html><html><head><title>t</title></head><body>b</body></html>", theme);
  assert.match(withHead, /^<!doctype html><html><head><meta charset="utf-8">.*<style id="cp-theme">:root\{--fg:#fff\}<\/style>.*<title>t<\/title>/s);
  assert.match(htmlPage("<!DOCTYPE html><html lang=en><body>b</body></html>", theme), /^<!DOCTYPE html><html lang=en><head><meta charset/);
  assert.match(htmlPage("<!doctype html><svg></svg>", theme), /^<!doctype html><head><meta charset.*<\/head><svg>/s);
  assert.match(htmlPage("<div>bare</div>", theme), /^<!doctype html><head>.*<\/head><div>bare<\/div>$/s);
});

test("local images: found by absolute path in quotes or url(), swapped for data, other paths left alone", () => {
  const html = `<img src="/a/shot.png"><div style="background:url( /b/bg.webp )"></div><script>show('/a/shot.png'); load("/api/x.json"); href="//cdn.x/y.png"</script><img src="photo.jpg">`;
  assert.deepEqual(localImages(html).map((image) => image.path), ["/a/shot.png", "/b/bg.webp", "/a/shot.png"]);
  const out = inlineImages(html, new Map([["/a/shot.png", "data:image/png;base64,AA"]]));
  assert.equal(out, html.replaceAll("/a/shot.png", "data:image/png;base64,AA"));
  assert.equal(inlineImages("<p>none</p>", new Map()), "<p>none</p>");
});

test("frame messages: keys and links are read only in their own shape", () => {
  assert.deepEqual(frameKey({ type: "cp-html-key", key: "k", code: "KeyK", metaKey: true }), { key: "k", code: "KeyK", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false });
  assert.equal(frameKey({ type: "cp-html-key", key: 1, code: "x" }), undefined);
  assert.equal(frameLink({ type: "cp-html-link", url: "https://paseo.sh/docs" }), "https://paseo.sh/docs");
  assert.equal(frameLink({ type: "cp-html-link", url: "javascript:alert(1)" }), undefined);
  assert.equal(frameLink({ type: "cp-html-link", url: "file:///etc/passwd" }), undefined);
});

test("frameReport: only the frame's own height message counts", () => {
  assert.deepEqual(frameReport({ type: "cp-html-height", height: 321, width: 728 }), { height: 321, width: 728 });
  assert.equal(frameReport({ type: "cp-html-height", height: 1e9, width: 728 }).height, 20000);
  assert.equal(frameReport({ type: "cp-html-height", height: -1 }), undefined);
  assert.equal(frameReport({ type: "other", height: 10 }), undefined);
  assert.equal(frameReport(null), undefined);
});

test("fitFrame: grows at once, never shrinks at the same width, follows a new width down once the page settles", () => {
  const at = { height: 229, width: 728 };
  assert.deepEqual(fitFrame(at, { height: 300, width: 728 }), { height: 300, later: false });
  // An animation cycling 229 → 188 → 229 leaves the frame alone.
  assert.equal(fitFrame(at, { height: 188, width: 728 }), undefined);
  assert.equal(fitFrame(at, { height: 229, width: 728 }), undefined);
  assert.deepEqual(fitFrame(at, { height: 150, width: 1200 }), { height: 150, later: true });
  assert.deepEqual(fitFrame(at, { height: 400, width: 360 }), { height: 400, later: false });
});

test("MCP over HTTP: lists the tool, rejects vh pages, accepts a good one; config adds it without dropping others; same port after a restart", async () => {
  process.env.PASEO_HOME = await mkdtemp(join(tmpdir(), "cp-html-"));
  // A half-written address file from a crash is ignored, not fatal.
  const cache = join(process.env.PASEO_HOME, "plugin-cache", "paseo-chat-polish");
  await mkdir(cache, { recursive: true });
  await writeFile(join(cache, "html-server.json"), '{"port":');
  const { startHtmlTool, withHtmlTool, baseProvider, openHtmlPage, closeLocalServer } = await import("../server/html.ts");
  try {
    const tool = await startHtmlTool();
    assert.match(tool.url, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    const config = withHtmlTool({ provider: "claude", systemPrompt: "Base", mcpServers: { other: { type: "http", url: "x" } } }, tool);
    assert.deepEqual(Object.keys(config.mcpServers), ["other", "chat_polish"]);
    assert.deepEqual(config.mcpServers.chat_polish, { type: "http", url: tool.url, headers: { Authorization: `Bearer ${tool.token}` }, alwaysLoad: true });
    assert.deepEqual(config.toolPolicy.preapproved, [
      { kind: "mcp", server: "chat_polish", tool: "html_render" },
      { kind: "mcp", server: "chat_polish", tool: "html_preview" },
    ]);
    // Paseo refuses to create an OMP agent with a toolPolicy, so the tools ride along unapproved.
    const ompConfig = withHtmlTool({ provider: "omp", systemPrompt: "Base" }, tool);
    assert.equal(ompConfig.toolPolicy, undefined);
    assert.equal(ompConfig.mcpServers.chat_polish.type, "http");
    // A configured provider gets its base's contract, through a chain of extends; a custom ACP one gets none.
    const providers = { "claude-mobile": { extends: "claude" }, work: { extends: "claude-mobile" }, mine: { extends: "acp" }, loop: { extends: "loop" }, omp: {} };
    assert.deepEqual(["claude-mobile", "work", "mine", "loop", "omp", "codex"].map((id) => baseProvider(id, providers)), ["claude", "claude", "acp", "loop", "omp", "codex"]);
    assert.equal(withHtmlTool({ provider: "claude-mobile" }, tool, baseProvider("claude-mobile", providers)).toolPolicy.preapproved.length, 2);
    assert.equal(withHtmlTool({ provider: "mine" }, tool, baseProvider("mine", providers)).toolPolicy, undefined);
    assert.match(config.systemPrompt, /^Base\n\n# HTML pages\nYou have an html_render tool/);
    // No headless shell in this cache: pages go out unchecked, with nothing to preview them in.
    assert.doesNotMatch(config.systemPrompt, /html_preview/);

    const post = (body, token = tool.token) =>
      fetch(tool.url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const ask = async (id, method, params) => (await post({ jsonrpc: "2.0", id, method, params })).json();
    assert.equal((await post({ jsonrpc: "2.0", id: 1, method: "initialize" }, "wrong")).status, 403);
    assert.equal((await fetch(tool.url)).status, 405);
    assert.equal((await ask(1, "initialize", { protocolVersion: "2025-06-18" })).result.serverInfo.name, "chat_polish");
    assert.equal((await post({ jsonrpc: "2.0", method: "notifications/initialized" })).status, 202);
    // No headless shell in this cache, so no preview to offer.
    const [listed, ...others] = (await ask(2, "tools/list")).result.tools;
    assert.equal(listed.name, "html_render");
    assert.deepEqual(others, []);
    assert.match(listed.description, /only when the user asks for a visual/);
    const tall = await ask(3, "tools/call", { name: "html_render", arguments: { title: "t", html: "<style>.a{height:100vh}</style>" } });
    assert.equal(tall.result.isError, true);
    // An agent created while the shell was installed can still call html_preview: it reports what html_render would reject without failing, and never publishes.
    const previewed = (await ask(3, "tools/call", { name: "html_preview", arguments: { html: "<style>.a{height:100vh}</style>" } })).result;
    assert.equal(previewed.isError, false);
    // No screenshot of a page that still has problems.
    assert.equal(previewed.content.length, 1);
    assert.match(previewed.content[0].text, /The page wasn't published[\s\S]*html_render would reject it for:\n- The page uses a viewport height unit \(100vh\)/);
    const ok = await ask(4, "tools/call", { name: "html_render", arguments: { title: "t", html: "<p>Use 12px, not 100vh or names like ovhd</p>", force: true } });
    assert.equal(ok.result.isError, false);
    assert.match(ok.result.content[0].text, /^Shown to the reader/);
    const reject = async (html) => (await ask(5, "tools/call", { name: "html_render", arguments: { title: "t", html, force: true } })).result;
    assert.match((await reject('<div style="min-height:100dvh"></div>')).content[0].text, /viewport height unit \(100dvh\)/);
    assert.match((await reject("<script>\nconst a = {;\n</script>")).content[0].text, /^Script 1 has a syntax error on its line 2/);
    assert.equal((await reject('<script type="module">import x from "https://x"</script><script type="application/json">{"a":</script>')).isError, false);
    assert.match((await reject('<img src="/nope/missing.png">')).content[0].text, /could not be read: \/nope\/missing\.png/);
    assert.equal((await reject(`<img src="${join(process.cwd(), "images", "icon.png")}">`)).isError, false);

    // A page for the system browser, from the same server.
    const { url } = await openHtmlPage({ html: "<p>hi</p>" });
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{64}\.html$/);
    const page = await fetch(url);
    assert.equal(page.status, 200);
    assert.equal(await page.text(), "<p>hi</p>");
    assert.match(page.headers.get("content-security-policy"), /^sandbox allow-scripts/);
    assert.equal((await fetch(new URL("/../html-server.json", url))).status, 404);
    assert.equal((await fetch(url.replace(/[0-9a-f]{64}/, "0".repeat(64)))).status, 404);

    // A fresh cache has no headless shell until the user downloads it from the dashboard.
    const { installHeadlessShell, removeHeadlessShell, shellStatus, staleShell } = await import("../server/headless-shell.ts");
    assert.match(shellStatus().state, /^(missing|unsupported)$/);
    // Only an older version left behind: it was downloaded once, so a new one is fetched without asking; Remove deletes every version.
    const old = join(cache, "chrome-headless-shell", "1.0.0");
    await mkdir(old, { recursive: true });
    assert.equal(staleShell(), shellStatus().state !== "unsupported");
    await removeHeadlessShell();
    assert.equal(await stat(old).then(() => true, () => false), false);
    assert.equal(staleShell(), false);
    // A download that doesn't match its pinned hash is never unpacked: the dashboard says why, and nothing is left behind.
    if (shellStatus().state !== "unsupported") {
      const realFetch = globalThis.fetch;
      globalThis.fetch = async () => new Response("not the shell");
      try {
        await installHeadlessShell();
      } finally {
        globalThis.fetch = realFetch;
      }
      assert.equal(shellStatus().state, "failed");
      assert.match(shellStatus().error, /doesn't match its pinned hash/);
      assert.deepEqual(await readdir(join(cache, "chrome-headless-shell")), []);
    }

    await closeLocalServer();
    assert.deepEqual(await startHtmlTool(), tool);
  } finally {
    await closeLocalServer();
    if (home === undefined) delete process.env.PASEO_HOME;
    else process.env.PASEO_HOME = home;
  }
});

test("page check: lays the page out in a browser and names what a reader would see wrong", async (t) => {
  const { checkPage } = await import("../server/page-check.ts");
  const clean = await checkPage('<div class="stack"><h2>Sales</h2><svg viewBox="0 0 200 60" width="100%" height="60"><text x="8" y="20">Mon</text><text x="8" y="44">Tue</text></svg></div><script>console.log("drawn")</script>');
  // CI installs the shell first, so there a missing check is a failure, not a skip.
  if (clean === undefined && process.env.CI) assert.fail("the page couldn't be checked; see the [chat-polish] warning above");
  if (clean === undefined) return t.skip("the headless shell isn't installed: download it from the dashboard's HTML pages tab");
  assert.deepEqual(clean.problems, []);
  assert.deepEqual(clean.console, ["log: drawn"]);
  assert.deepEqual(clean.heights.map(([width]) => width), [360, 480, 600, 700, 840, 1000]);
  assert.ok(clean.heights.every(([, height]) => height > 60));
  assert.match(clean.screenshot, /^iVBORw0KGgo/);
  const problems = (await checkPage('<svg viewBox="0 0 300 60" width="300" height="60"><text x="10" y="20">Client app</text><text x="20" y="22">Auth server</text></svg><script>function draw() { undefined.map(); }\nconsole.error("no data");\ndraw();</script>')).problems.join("\n");
  assert.match(problems, /Script error: TypeError.*\(page line 1 in draw, called from \(anonymous\) on line 3\)/);
  assert.match(problems, /Script error: console\.error: no data/);
  assert.match(problems, /At 700 and 360px wide, text overlaps: "Client app" and "Auth server"/);
  // Rows a fixed-height list scrolls out of view aren't on screen, so they overlap nothing; text cut short with an ellipsis is named.
  const rows = Array.from({ length: 30 }, (_, i) => `<div>Row ${i}</div>`).join("");
  const scrolled = await checkPage(`<div style="height:120px;overflow:auto">${rows}</div><p>After the list</p><div style="width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Claude / Codex / Gemini / Copilot</div>`);
  assert.deepEqual(scrolled.problems, ['At 700 and 360px wide, text is cut off with an ellipsis; let it wrap or give it room: "Claude / Codex / Gemini / Copilot"']);

  // Through the MCP server, with the shell there: preview is offered, html_render's answer carries the page's heights for the chat's
  // frame, and a passing preview its screenshot.
  const { mcpAnswer } = await import("../server/html.ts");
  const answer = async (name, args) => (await mcpAnswer({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } })).result;
  assert.deepEqual((await mcpAnswer({ jsonrpc: "2.0", id: 1, method: "tools/list" })).result.tools.map((tool) => tool.name), ["html_render", "html_preview"]);
  assert.deepEqual(readHeights(await answer("html_render", { title: "t", html: "<p>hi</p>" })).map(([width]) => width), [360, 480, 600, 700, 840, 1000]);
  assert.deepEqual((await answer("html_preview", { html: "<p>hi</p>" })).content.map((part) => part.type), ["text", "image"]);

  // A page whose script never yields is a problem to fix, not a check that couldn't run; the next check runs as usual.
  assert.match((await checkPage("<script>for (;;) {}</script>")).problems.join("\n"), /didn't finish loading within 15s/);
  assert.deepEqual((await checkPage("<p>after</p>")).problems, []);
});

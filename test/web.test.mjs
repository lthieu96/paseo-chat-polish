import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { test } from "node:test";
import ts from "typescript";

const chrome = [process.env.CHROME_BIN, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ...(process.env.PATH ?? "").split(delimiter).flatMap((dir) => ["google-chrome", "chromium", "chromium-browser"].map((name) => join(dir, name)))].find((file) => file && existsSync(file));

test("DOM restyling, accordion transitions, and bottom following stay stable", { skip: chrome ? false : "Chrome not installed (set CHROME_BIN)" }, async () => {
  const temp = mkdtempSync(join(tmpdir(), "chat-polish-web-test-"));
  let server;
  try {
    const names = ["css-guard", "provider-icons", "web", ...readdirSync(new URL("../client/web/", import.meta.url)).map((file) => `web/${file.replace(/\.ts$/, "")}`)];
    const sources = Object.fromEntries(names.map((name) => [name, ts.transpileModule(readFileSync(new URL(`../client/${name}.ts`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText]));
    // Paseo's bundle exports its mermaid document as a minified string literal, with JS-only escapes like \xHH.
    const bundle = String.raw`Object.defineProperty(a,"mermaidRuntimeHtml",{get:function(){return o}});const o='<!doctype html>\n<p class="x" title=\'y\'>\x3c!-- __PASEO_MERMAID_RUNTIME_RECEIVE__ \\x41 \u0041 \u{1F600} \v \/ --\x3e</p>';`;
    const mermaidDoc = "<!doctype html>\n<p class=\"x\" title='y'><!-- __PASEO_MERMAID_RUNTIME_RECEIVE__ \\x41 A \u{1F600} \v / --></p>";
    const html = `<!doctype html><html><head><title>pending</title><script type="text/plain" src="/bundle.js"></script></head><body><img src="/hold" hidden>
      <div data-testid="settings-detail-pane"></div>
      <div data-testid="context-window-details" style="position:absolute;border:1px solid black;border-radius:12px;background:white"><div><span>Context</span><span>35% used</span></div><div data-testid="usage-report-test" style="height:180px">Usage</div></div>
      <div data-testid="assistant-message"><div data-paseo-markdown-tag="blockquote"><span id="marker">[!NO</span></div></div>
      <script>
        const checks = {}; const errors = [];
        window.onerror = (message) => errors.push(String(message));
        const wait = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));
        const NativeObserver = MutationObserver; let batches = 0; let capped = false;
        window.MutationObserver = class extends NativeObserver {
          constructor(cb) { super((records) => { if (++batches > 30) { capped = true; this.disconnect(); } else cb(records); }); }
        };
        let released = 0;
        const remove = EventTarget.prototype.removeEventListener;
        EventTarget.prototype.removeEventListener = function(type, ...args) {
          if (type === 'click' && this.hasAttribute?.('data-chat-polish-clamp') && !this.isConnected) released++;
          return remove.call(this, type, ...args);
        };
        function prompts() {
          const list = document.createElement('section');
          for (let i = 0; i < 10; i++) {
            const message = document.createElement('div'); message.dataset.testid = 'user-message';
            message.innerHTML = '<div><div><div style="line-height:20px;font-size:14px;white-space:pre">' + Array(15).fill('long prompt').join('\\n') + '</div></div></div>';
            list.appendChild(message);
          }
          document.body.appendChild(list); return list;
        }
        const sources = ${JSON.stringify(sources)}; const modules = {};
        function load(name) {
          if (modules[name]) return modules[name];
          const exports = modules[name] = {};
          // "./dom" from "web/parts" is "web/dom"; "../css-guard" is "css-guard".
          const resolve = (id) => id.split('/').reduce((path, part) => part === '..' ? path.slice(0, -1) : part === '.' ? path : [...path, part], name.split('/').slice(0, -1)).join('/');
          new Function('exports', 'require', sources[name])(exports, (id) => id === 'react-native' ? { Platform: { OS: 'web' } } : load(resolve(id)));
          return exports;
        }
        (async () => {
          localStorage.removeItem('chat-polish:context-card-heights');
          const first = prompts(); const web = load('web');
          const restyle = web.restyleNative(() => true); const clamp = web.clampUserMessages(() => true);
          checks.mermaidDocFromBundle = (await web.loadMermaidDoc()) === new TextDecoder().decode(Uint8Array.from(atob("${Buffer.from(mermaidDoc).toString("base64")}"), (ch) => ch.charCodeAt(0)));
          await wait(); checks.observerSettles = !capped;
          first.remove(); await wait(); checks.detachedReleased = released === 10;
          const card = document.querySelector('[data-testid="context-window-details"]');
          const usage = card.lastElementChild;
          usage.style.height = '40px'; usage.appendChild(document.createElement('span')); await wait();
          const heights = JSON.parse(localStorage.getItem('chat-polish:context-card-heights'));
          checks.heightShrinks = heights[''] < 180 && !card.style.minHeight;
          usage.remove(); card.appendChild(document.createElement('span')); await wait();
          checks.placeholder = !!card.style.minHeight;
          card.appendChild(usage); await wait(); checks.placeholderReleased = !card.style.minHeight;
          let fullScans = 0; let markdownScans = 0;
          const queryDocument = Document.prototype.querySelectorAll;
          Document.prototype.querySelectorAll = function(selector) { if (selector === '*') fullScans++; return queryDocument.call(this, selector); };
          const queryElement = Element.prototype.querySelectorAll;
          Element.prototype.querySelectorAll = function(selector) { if (this === document.documentElement && selector.includes('data-paseo-markdown')) markdownScans++; return queryElement.call(this, selector); };
          document.getElementById('marker').firstChild.nodeValue = '[!NOTE]';
          document.querySelector('[data-testid="settings-detail-pane"]').appendChild(document.createElement('div'));
          await wait(300);
          checks.calloutUpdated = document.getElementById('marker').parentElement.dataset.cpCallout === 'note';
          checks.noGlobalScans = fullScans === 0 && markdownScans === 0;
          checks.observerSettles &&= !capped;
          clamp(); restyle();
          const unstyle = web.stylePluginViews();
          checks.accordionCloses = true; checks.accordionReverses = true;
          for (const width of [320, 1000]) {
            const fixture = document.createElement('div'); fixture.style.width = width + 'px';
            fixture.innerHTML = '<div data-cp-expand="open" style="display:flex;flex-direction:column"><div style="display:flex;flex-direction:column;min-height:0;overflow:hidden"><div style="display:flex;margin-top:6px;margin-bottom:12px;height:100px;flex-shrink:0">Output</div></div></div><div>Next tool</div>';
            document.body.appendChild(fixture);
            const box = fixture.firstElementChild, next = fixture.lastElementChild;
            const height = () => box.getBoundingClientRect().height;
            height(); box.getAnimations().forEach((animation) => animation.finish());
            const full = height(); box.dataset.cpExpand = 'closed'; height();
            const animations = box.getAnimations(); animations.forEach((animation) => animation.pause());
            animations.forEach((animation) => { animation.currentTime = 50; });
            const middle = height();
            checks.accordionCloses &&= full === 118 && middle > 0 && middle < full && Math.abs(next.getBoundingClientRect().top - box.getBoundingClientRect().top - middle) < 1;
            animations.forEach((animation) => animation.finish());
            checks.accordionCloses &&= height() === 0;
            box.dataset.cpExpand = 'open'; height();
            const opening = box.getAnimations(); opening.forEach((animation) => { animation.pause(); animation.currentTime = 25; });
            const partial = height(); box.dataset.cpExpand = 'closed';
            checks.accordionReverses &&= partial > 0 && partial < full && Math.abs(height() - partial) < 1;
            box.getAnimations().forEach((animation) => animation.finish());
            checks.accordionReverses &&= height() === 0;
            fixture.remove();
          }
          const chat = document.createElement('div');
          chat.dataset.testid = 'agent-chat-scroll';
          chat.style = 'width:600px;height:400px;overflow:auto;overflow-anchor:auto';
          chat.innerHTML = '<div style="display:flex;flex-direction:column;padding:16px"><div style="height:700px;flex-shrink:0;overflow-anchor:none"></div><div style="flex-shrink:0"><button>Ran command</button><div data-cp-expand="closed"><div style="min-height:0;overflow:hidden"><div style="height:250px;margin:6px 0 12px">Output</div></div></div></div></div>';
          document.body.appendChild(chat);
          const content = chat.firstElementChild, expanding = chat.querySelector('[data-cp-expand]');
          chat.scrollTop = chat.scrollHeight; await wait();
          // Paseo 0.11.4 follows content resizing in the next animation frame.
          let hostFollowing = true;
          const hostFollow = new ResizeObserver(() => requestAnimationFrame(() => {
            if (hostFollowing) chat.scrollTop = chat.scrollHeight;
          }));
          hostFollow.observe(content); await wait();
          chat.querySelector('button').focus({ preventScroll: true });
          web.followExpansionAtBottom();
          const gaps = [];
          const beforePaint = new ResizeObserver(() => gaps.push(chat.scrollHeight - chat.clientHeight - chat.scrollTop));
          beforePaint.observe(content);
          expanding.dataset.cpExpand = 'open'; expanding.getBoundingClientRect();
          const reveal = expanding.getAnimations(); reveal.forEach((animation) => animation.pause());
          for (const time of [0, 20, 50, 100]) {
            reveal.forEach((animation) => { animation.currentTime = time; });
            expanding.getBoundingClientRect(); await wait(30);
          }
          checks.expansionStaysAtBottom = gaps.length > 0 && gaps.every((gap) => Math.abs(gap) <= 1);
          hostFollowing = false;
          beforePaint.disconnect(); hostFollow.disconnect();
          reveal.forEach((animation) => animation.finish());
          chat.dispatchEvent(new WheelEvent('wheel', { deltaY: -80, bubbles: true }));
          chat.style.overflowAnchor = 'none'; chat.scrollTop -= 80;
          const readingTop = chat.scrollTop, output = expanding.firstElementChild.firstElementChild;
          output.style.height = '300px'; await wait(30);
          checks.userScrollCancelsFollowing = Math.abs(chat.scrollTop - readingTop) <= 1;
          web.followExpansionAtBottom(); output.style.height = '350px'; await wait(30);
          checks.detachedReadingPreserved = Math.abs(chat.scrollTop - readingTop) <= 1;
          chat.scrollTop = chat.scrollHeight;
          const detachedBottom = chat.scrollTop;
          web.followExpansionAtBottom(); output.style.height = '400px'; await wait(30);
          checks.disabledFollowingPreserved = Math.abs(chat.scrollTop - detachedBottom) <= 1;
          chat.remove();
          const diff = document.createElement('div');
          diff.dataset.cpNowrap = '';
          diff.style = 'width:300px;max-height:100px;overflow-x:hidden;overflow-y:auto;display:flex;flex-direction:column;font:12px monospace;line-height:18px';
          const lines = document.createElement('div'); lines.style = 'display:flex;flex-direction:column';
          for (let i = 0; i < 12; i++) {
            const row = document.createElement('div'); row.style = 'display:flex;gap:12px;flex-shrink:0';
            const gutter = document.createElement('span'); gutter.textContent = '+ ' + String(99 + i).padStart(3, '\\u2007'); gutter.style.flexShrink = '0';
            const code = document.createElement('span'); code.dataset.pmono = ''; code.style = 'flex-grow:1;flex-shrink:0;white-space:pre-wrap;overflow-wrap:break-word'; code.textContent = '  const value = ' + 'longFunctionName(argument); '.repeat(12);
            row.append(gutter, code); lines.appendChild(row);
          }
          diff.appendChild(lines); document.body.appendChild(diff);
          const firstCode = lines.firstElementChild.lastElementChild;
          diff.scrollLeft = 80; diff.scrollTop = 36;
          checks.diffNoWrapScrollsBothAxes = firstCode.getBoundingClientRect().height === 18 && diff.scrollLeft === 80 && diff.scrollTop === 36;
          diff.removeAttribute('data-cp-nowrap');
          for (const row of lines.children) row.lastElementChild.style = 'flex:1;min-width:0;white-space:pre-wrap;overflow-wrap:break-word';
          checks.diffWrapRestoresWrapping = firstCode.getBoundingClientRect().height > 18 && diff.scrollWidth <= diff.clientWidth + 1;
          diff.remove();
          unstyle();
          document.title = JSON.stringify({ checks, errors });
        })().catch((error) => { document.title = JSON.stringify({ error: error.stack, checks }); }).finally(() => fetch('/done'));
      </script></body></html>`;
    // Hold page load open while real animation frames and ResizeObserver callbacks run.
    let held;
    server = createServer((request, response) => {
      if (request.url === "/hold") { held = response; return; }
      if (request.url === "/done") { held?.end(); response.end(); return; }
      if (request.url === "/bundle.js") { response.end(bundle); return; }
      response.setHeader("Content-Type", "text/html"); response.end(html);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const result = await promisify(execFile)(chrome, ["--headless=new", "--no-sandbox", "--disable-gpu", "--no-first-run", "--disable-background-networking", `--user-data-dir=${join(temp, "chrome")}`, "--dump-dom", `http://127.0.0.1:${server.address().port}`], { encoding: "utf8", timeout: 20000, maxBuffer: 8 * 1024 * 1024 });
    const title = /<title>([\s\S]*?)<\/title>/.exec(result.stdout)?.[1];
    assert.notEqual(title, "pending", "browser test did not finish");
    const report = JSON.parse(title.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">"));
    assert.equal(report.error, undefined, report.error);
    assert.deepEqual(report.errors, []);
    for (const [check, passed] of Object.entries(report.checks)) assert.equal(passed, true, check);
    assert.equal(Object.keys(report.checks).length, 16);
  } finally {
    server?.closeAllConnections(); server?.close();
    rmSync(temp, { recursive: true, force: true });
  }
});

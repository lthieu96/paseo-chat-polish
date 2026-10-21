// Mermaid diagrams: Paseo's mermaid themed in the app's colors, Pele drawing in its place, and the redraw button.
import { darker, isDark, mix } from "./color";
import type { DomElement, KeyEvent, MessageListener, WebDocument } from "./dom";

declare const document: WebDocument;
declare const window: { addEventListener(type: "message", listener: MessageListener): void; removeEventListener(type: "message", listener: MessageListener): void };
declare const HTMLIFrameElement: { prototype: { setAttribute(name: string, value: string): void } };
declare function setTimeout(cb: () => void, ms: number): number;

/** The app theme's colors the diagrams are drawn in (Paseo's theme.colors). */
export interface DiagramColors {
  surface0: string;
  surface1: string;
  surface2: string;
  border: string;
  foreground: string;
  foregroundMuted: string;
  accent: string;
  statusDanger: string;
}

// Paseo draws each diagram in a sandboxed iframe from a srcdoc that bundles mermaid, so page CSS can't reach it.
// The theme goes into that srcdoc instead, as React sets it and before the frame loads (changing it later doesn't take).
// Paseo's own theme expression, or one this plugin put there earlier (its variables nest one level, for xyChart).
const MERMAID_THEME = /theme:(\w+)==="dark"\?"dark":"default"|theme:"base",themeVariables:\{(?:[^{}]|\{[^}]*\})*\},themeCSS:"(?:[^"\\]|\\.)*"/;
const MERMAID_FRAME = '[data-testid="mermaid-viewport-canvas"] iframe';
const MERMAID_CSS = [
  ".node rect, .actor, rect.note, .labelBox, .statediagram-state rect, .classGroup rect { rx: 6px; ry: 6px; }",
  ".cluster rect { rx: 8px; ry: 8px; stroke-dasharray: 3 3; }",
  ".flowchart-link, .edgePath .path, .transition, .relation, .messageLine0, .messageLine1 { stroke-width: 1.25px; }",
  ".edgeLabel, .edgeLabel p, .edgeLabel rect { border-radius: 4px; }",
].join(" ");
const DIAGRAM_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif';
let mermaidTheme = "";
let rethemeMermaid: (() => void) | undefined;
let claimDiagram: ((viewport: DomElement, source: string) => Promise<boolean>) | undefined;
/** Redraws the diagrams on screen after the renderer pref changes. */
export const redrawDiagrams = () => rethemeMermaid?.();

// Pele (pele.run) draws the same mermaid source as SVG, in a fraction of mermaid's size. It runs on the daemon (so clients,
// phones included, don't carry it): the frame Paseo makes only forwards each render request here, this asks the
// daemon, and the frame shows the SVG that comes back. The drawing names its own font, one the frame's system has.
type DiagramRenderer = (source: string) => Promise<{ svg: string; width: number; height: number } | null>;
/** Pele's render function, and whether new and redrawn diagrams should use it. */
export interface PeleDiagrams {
  render: DiagramRenderer;
  on(): boolean;
}
// Each reply echoes its request, so overlapping requests (a replay beside Paseo's own) can't mislabel a drawing.
// The script runs by nonce, so markup in a drawing can't run handlers even if Pele let some through.
const PELE_DOC = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-cp-pele'; style-src 'unsafe-inline'; img-src data: blob:">
<style>html,body{margin:0;height:100%;background:transparent}#d,#d>svg{display:block;width:100%;height:100%}</style><style id="t"></style></head><body><div id="d"></div><script nonce="cp-pele">
const d = document.getElementById("d"), t = document.getElementById("t");
addEventListener("message", ({ source, data: m }) => {
  if (source !== parent || !m) return;
  if (m.type === "render") parent.postMessage({ type: "cp-pele-render", revision: m.revision, source: m.source, colorScheme: m.colorScheme }, "*");
  else if (m.type === "cp-pele-theme") t.textContent = m.css;
  else if (m.type === "cp-pele-svg") {
    if (typeof m.svg !== "string") return parent.postMessage({ type: "renderError", revision: m.revision }, "*");
    t.textContent = m.css;
    d.innerHTML = m.svg;
    for (const revision of m.revisions || [m.revision]) parent.postMessage({ type: "rendered", revision, source: m.source, colorScheme: m.colorScheme, width: m.width, height: m.height }, "*");
  }
});
parent.postMessage({ type: "bridgeReady" }, "*");
<\/script></body></html>`;
let peleCss = "";
// The last mermaid document Paseo gave a diagram frame, for the dashboard's preview.
let paseoMermaidDoc = "";

/** The document a diagram frame loads: Pele's bridge, or Paseo's mermaid as a chat last loaded it (none until one has). */
export const diagramDoc = (pele: boolean) => (pele ? PELE_DOC : paseoMermaidDoc || undefined);

let bundledMermaidDoc: Promise<string | undefined> | undefined;
/**
 * Paseo's mermaid document even before a chat has drawn a diagram: read once out of the app's own script.
 * ponytail: finds the exported mermaidRuntimeHtml string literal in Paseo's minified bundle; if Paseo renames or
 * splits it, this resolves to nothing and the preview says so.
 */
export function loadMermaidDoc(): Promise<string | undefined> {
  if (paseoMermaidDoc) return Promise.resolve(paseoMermaidDoc);
  bundledMermaidDoc ??= (async () => {
    for (const script of Array.from(document.querySelectorAll("script[src]"))) {
      try {
        const response = await fetch(script.getAttribute("src") ?? "");
        const doc = response.ok ? mermaidDocIn(await response.text()) : undefined;
        if (doc) return (paseoMermaidDoc ||= doc);
      } catch (error) {
        console.warn("[chat-polish] Couldn't read a script for Paseo's mermaid", error);
      }
    }
    // Look again next time.
    bundledMermaidDoc = undefined;
  })();
  return bundledMermaidDoc;
}

const JS_ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", "0": "\0", "\n": "", "\r": "", "\r\n": "", "\u2028": "", "\u2029": "" };
/** The mermaid document in a script's source: the string literal exported as mermaidRuntimeHtml, unescaped. */
function mermaidDocIn(text: string) {
  const name = text.indexOf("mermaidRuntimeHtml");
  const start = name < 0 ? -1 : text.slice(name).search(/["'`]<!doctype html>/i) + name;
  if (start < name) return;
  const quote = text[start];
  let end = start + 1;
  while (end < text.length && text[end] !== quote) end += text[end] === "\\" ? 2 : 1;
  const doc = text
    .slice(start + 1, end)
    .replace(/\\(u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|\r\n|[\s\S])/g, (_, e: string, point?: string, unit?: string, byte?: string) =>
      point ? String.fromCodePoint(parseInt(point, 16)) : unit ?? byte ? String.fromCharCode(parseInt((unit ?? byte)!, 16)) : (JS_ESCAPES[e] ?? e),
    );
  return doc.includes("__PASEO_MERMAID_RUNTIME_RECEIVE__") ? doc : undefined;
}

/**
 * Asks a frame loading diagramDoc to draw source, the way Paseo asks its own, and reports the drawn size (none if it
 * can't draw it); returns cleanup. Paseo's mermaid takes the plugin's theme only while the restyle is on.
 */
export function drawDiagram(frame: unknown, source: string, done: (size?: { width: number; height: number }) => void) {
  const win = () => (frame as { contentWindow: { postMessage(message: unknown, targetOrigin: string): void } | null }).contentWindow;
  const request = () => win()?.postMessage({ type: "render", revision: 1, source, colorScheme: "dark", interactive: false }, "*");
  const onMessage: MessageListener = ({ source: from, data }) => {
    if (!from || from !== win()) return;
    const d = data as { type?: unknown; width?: unknown; height?: unknown } | null;
    if (d?.type === "bridgeReady") request();
    else if (d?.type === "rendered") done({ width: Number(d.width), height: Number(d.height) });
    else if (d?.type === "renderError") done();
  };
  window.addEventListener("message", onMessage);
  // The frame may have loaded before this listener.
  request();
  return () => window.removeEventListener("message", onMessage);
}

/**
 * Chart series colors: the accent's hue turned in even steps, keeping its lightness so each reads like the theme. The status
 * colors can't serve: themes often share a hue between them (Paseo's light accent and success are both green). A gray
 * accent still gets some chroma. Opaque hex, since mermaid derives shades from them; the browser does the color math.
 */
export function seriesFrom(accent: string) {
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  return [0, 180, 90, 270, 45, 225, 135, 315].map((turn) => {
    if (!ctx) return accent;
    // A browser without relative colors keeps the accent.
    ctx.fillStyle = accent;
    ctx.fillStyle = `oklch(from ${accent} l max(c, 0.08) calc(h + ${turn}))`;
    ctx.fillRect(0, 0, 1, 1);
    const { data } = ctx.getImageData(0, 0, 1, 1);
    return `#${[data[0], data[1], data[2]].map((v) => v!.toString(16).padStart(2, "0")).join("")}`;
  });
}

/** Pele's variables in the app's colors, matching the mermaid theme below. */
function peleCssFrom(c: DiagramColors, series: string[]) {
  const sunken = darker(c.surface0);
  const vars = {
    bg: sunken,
    fg: c.foreground,
    muted: c.foregroundMuted,
    line: c.foregroundMuted,
    surface: c.surface1,
    "surface-alt": mix(sunken, c.surface1, 0.4),
    border: c.border,
    accent: c.accent,
    critical: c.statusDanger,
    error: c.statusDanger,
    ...Object.fromEntries(series.map((h, i) => [`series-${i + 1}`, h])),
    radius: "6px",
  };
  return `.pele{${Object.entries(vars).map(([k, v]) => `--pele-${k}:${v}`).join(";")}}`;
}

/** Mermaid's "base" theme in the app's colors: raised nodes with a 1px border, thin muted edges, accent-tinted notes. */
function mermaidThemeFrom(c: DiagramColors, series: string[]) {
  const sunken = darker(c.surface0);
  // Mermaid derives shades from these, so they stay opaque hex.
  const vars = {
    darkMode: isDark(c.surface0),
    background: sunken,
    fontFamily: DIAGRAM_FONT,
    fontSize: "13px",
    primaryColor: c.surface1,
    primaryBorderColor: c.border,
    primaryTextColor: c.foreground,
    secondaryColor: c.surface2,
    tertiaryColor: sunken,
    mainBkg: c.surface1,
    nodeBorder: c.border,
    textColor: c.foreground,
    titleColor: c.foreground,
    lineColor: c.foregroundMuted,
    edgeLabelBackground: sunken,
    clusterBkg: mix(sunken, c.surface1, 0.4),
    clusterBorder: c.border,
    actorBkg: c.surface1,
    actorBorder: c.border,
    actorTextColor: c.foreground,
    actorLineColor: c.border,
    signalColor: c.foregroundMuted,
    signalTextColor: c.foreground,
    labelBoxBkgColor: c.surface1,
    labelBoxBorderColor: c.border,
    labelTextColor: c.foreground,
    loopTextColor: c.foreground,
    activationBkgColor: c.surface2,
    activationBorderColor: c.border,
    noteBkgColor: mix(sunken, c.accent, 0.12),
    noteBorderColor: mix(sunken, c.accent, 0.3),
    noteTextColor: c.accent,
    rowOdd: c.surface1,
    rowEven: mix(sunken, c.surface1, 0.5),
    // Pie slices, git branches and the sections of mindmaps, timelines and journeys take the chart series, which
    // "base" would otherwise shade from the gray surfaces above. Labels on them use the background, as Pele's do.
    ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`pie${i + 1}`, series[i % 8]])),
    pieStrokeColor: sunken,
    pieOuterStrokeColor: c.border,
    pieSectionTextColor: sunken,
    pieTitleTextColor: c.foreground,
    pieLegendTextColor: c.foreground,
    ...Object.fromEntries(series.flatMap((h, i) => [[`git${i}`, h], [`gitBranchLabel${i}`, sunken]])),
    ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [[`cScale${i}`, series[i % 8]], [`cScaleLabel${i}`, sunken]]).flat()),
    // Passing xyChart replaces what mermaid would derive for it, so its background and axes come along.
    xyChart: {
      plotColorPalette: series.join(","),
      backgroundColor: sunken,
      titleColor: c.foreground,
      ...Object.fromEntries(["x", "y"].flatMap((a) => [[`${a}AxisTitleColor`, c.foreground], [`${a}AxisLabelColor`, c.foregroundMuted], [`${a}AxisTickColor`, c.border], [`${a}AxisLineColor`, c.border]])),
    },
  };
  // ER's "zero" markers are hard-coded white.
  const css = `${MERMAID_CSS} marker[id*="zeroOr"] circle { fill: ${sunken}; }`;
  return `theme:"base",themeVariables:${JSON.stringify(vars)},themeCSS:${JSON.stringify(css)}`;
}

/**
 * Themes mermaid diagrams from now on while the restyle is on, and redraws those on screen when the colors change; returns cleanup.
 * While Pele is on, diagram frames load Pele's bridge instead of Paseo's mermaid; switching (or turning the restyle
 * off) redraws those on screen. It stays installed with the restyle off, since frames showing Pele need its answers.
 * Diagrams already on screen when it starts keep Paseo's theme until they remount.
 * ponytail: matches the theme expression in Paseo's minified mermaid bridge and replays its render message;
 * if Paseo rewrites either, diagrams silently fall back to Paseo's own theme.
 */
export function themeMermaid(enabled: () => boolean, pele?: PeleDiagrams) {
  type Frame = { postMessage(message: unknown, targetOrigin: string): void };
  const usePele = () => !!pele && enabled() && pele.on();
  const proto = HTMLIFrameElement.prototype;
  const inherited = proto.setAttribute;
  // Paseo's own document for each frame now showing Pele, to switch back to.
  const mermaidDocs = new WeakMap<object, string>();
  proto.setAttribute = function (this: object, name: string, value: string) {
    if (name.toLowerCase() === "srcdoc" && typeof value === "string") {
      if (value.includes("__PASEO_MERMAID_RUNTIME_RECEIVE__")) paseoMermaidDoc = value;
      if (usePele() && value.includes("__PASEO_MERMAID_RUNTIME_RECEIVE__")) {
        mermaidDocs.set(this, value);
        value = PELE_DOC;
      } else if (mermaidTheme && enabled()) value = value.replace(MERMAID_THEME, () => mermaidTheme);
    }
    inherited.call(this, name, value);
  };
  // A reloaded frame waits for a render request that only Paseo sends, so replay the last one it took.
  const requests = new WeakMap<object, unknown>();
  const reloading = new WeakSet<object>();
  const onMessage: MessageListener = ({ source, data }) => {
    const d = data as { type?: unknown; revision?: unknown; source?: unknown; colorScheme?: unknown } | null;
    if (!source || typeof source !== "object" || !d) return;
    const request = { type: "render", revision: d.revision, source: d.source, colorScheme: d.colorScheme, interactive: false };
    if (d.type === "cp-pele-render" && pele && typeof d.source === "string") {
      // Kept even if Pele fails, so switching to mermaid can redraw it.
      requests.set(source, request);
      // Without an SVG, the frame reports an error and Paseo shows the source instead.
      void pele
        .render(d.source)
        .then(
          (r) => (r ? { ...request, type: "cp-pele-svg", ...r, css: peleCss } : { ...request, type: "cp-pele-svg" }),
          (error: unknown) => {
            console.warn("[chat-polish] Pele couldn't draw a diagram", error);
            return { ...request, type: "cp-pele-svg" };
          },
        )
        .then((reply) => (source as Frame).postMessage(reply, "*"));
    } else if (d.type === "rendered") {
      requests.set(source, request);
      // The colors may have changed while this frame was still loading.
      refresh(source);
    } else if (d.type === "bridgeReady") {
      if (reloading.delete(source)) (source as Frame).postMessage(requests.get(source), "*");
      // Paseo's full screen viewer starts a model of its own, which won't draw a redrawn diagram either.
      else if (fullscreenSource !== undefined && Array.from(document.querySelectorAll('[data-testid="mermaid-fullscreen-viewport"] iframe')).some((f) => frameWindow(f) === source)) {
        void claim(source as Frame, fullscreenSource, [1]);
        fullscreenSource = undefined;
      }
    }
  };
  window.addEventListener("message", onMessage);
  const refresh = (only?: object) => {
    for (const frame of Array.from(document.querySelectorAll(MERMAID_FRAME))) {
      const win = (frame as unknown as { contentWindow: object | null }).contentWindow;
      if (!win || (only && win !== only) || !requests.has(win)) continue;
      const srcdoc = frame.getAttribute("srcdoc");
      if (!srcdoc) continue;
      const isPele = srcdoc === PELE_DOC;
      if (isPele && usePele()) {
        // Pele's colors are CSS variables, so its frames take new ones without reloading.
        (win as Frame).postMessage({ type: "cp-pele-theme", css: peleCss }, "*");
        continue;
      }
      // Mermaid frames keep their theme while the restyle is off, as before.
      if (!isPele && !usePele() && (!enabled() || srcdoc.includes(mermaidTheme))) continue;
      // Setting the document runs it through the swap and theme above.
      const next = isPele ? mermaidDocs.get(frame) : srcdoc;
      if (!next) continue;
      reloading.add(win);
      frame.setAttribute("srcdoc", next);
    }
  };
  rethemeMermaid = () => refresh();
  const frameWindow = (frame: unknown) => (frame as { contentWindow?: Frame | null } | null)?.contentWindow ?? null;
  /**
   * Has Paseo take a Pele drawing for a diagram it won't draw itself: the frame reports it drawn under every revision the
   * block may be at, for the fence's source with and without its last newline, in both color schemes. Paseo keeps the one
   * reply that matches its state and ignores the rest.
   * ponytail: leans on Paseo's render model (revisions count from 1 on mount; "rendered" must match revision, source and
   * scheme); if that changes, nothing takes and redraw falls back to its own card.
   */
  const claim = async (win: Frame, text: string, revisions: number[]) => {
    const drawn = await pele?.render(text).catch(() => null);
    if (!drawn) return false;
    for (const source of [text, `${text}\n`]) for (const colorScheme of ["dark", "light"]) win.postMessage({ type: "cp-pele-svg", revisions, source, colorScheme, ...drawn, css: peleCss }, "*");
    return true;
  };
  // Each redrawn block's viewport and its source, for the full screen viewer it opens.
  const claimed = new WeakMap<object, string>();
  let fullscreenSource: string | undefined;
  claimDiagram = (viewport, text) => {
    const win = frameWindow(viewport.querySelector("iframe"));
    if (!win) return Promise.resolve(false);
    claimed.set(viewport, text);
    // Past the last revision this frame was asked for; a block that remounted since is back at 1.
    const last = (requests.get(win) as { revision?: unknown } | undefined)?.revision;
    return claim(win, text, Array.from({ length: (typeof last === "number" ? last : 0) + 256 }, (_, i) => i + 1));
  };
  const onClick = ({ target }: { target: unknown }) => {
    const viewport = (target as DomElement | null)?.closest?.('[data-testid="mermaid-fullscreen"]')?.closest('[data-testid="mermaid-viewport"]');
    fullscreenSource = viewport ? claimed.get(viewport) : undefined;
  };
  document.addEventListener("click", onClick, true);
  return () => {
    delete (proto as { setAttribute?: unknown }).setAttribute;
    window.removeEventListener("message", onMessage);
    document.removeEventListener("click", onClick, true);
    rethemeMermaid = undefined;
    claimDiagram = undefined;
  };
}

/** Diagrams in the app theme's colors from now on; those on screen redraw when the colors change. */
export function setDiagramColors(c: DiagramColors) {
  const series = seriesFrom(c.accent);
  const css = peleCssFrom(c, series);
  const theme = mermaidThemeFrom(c, series);
  if (theme === mermaidTheme && css === peleCss) return;
  peleCss = css;
  mermaidTheme = theme;
  rethemeMermaid?.();
}

/**
 * Paseo can leave a diagram showing its source until the block remounts: once a render goes unanswered or fails as the
 * reply completes, it never asks again, and it never draws a source its safety check rejects. Redraw has Pele draw it and
 * hands the drawing to Paseo (claimDiagram), so it becomes Paseo's own diagram with its zoom, source toggle and full screen.
 * If Paseo doesn't take it, the drawing shows in a card of the plugin's own over the source.
 */
export function redrawDiagram(box: DomElement, button: DomElement) {
  const source = (box.querySelector('[data-paseo-markdown-language="mermaid"] > div:first-child')?.textContent ?? "").replace(/\n$/, "");
  box.querySelector(":scope > [data-cp-redraw-card]")?.remove();
  button.setAttribute("data-cp-redraw", "");
  button.setAttribute("title", "Redraw diagram");
  const viewport = box.nextElementSibling;
  const taken = viewport?.matches('[data-testid="mermaid-viewport"]') && claimDiagram ? claimDiagram(viewport, source) : Promise.resolve(false);
  // Once Paseo takes the drawing, it unmounts the source block.
  void taken.then((ok) => setTimeout(() => box.isConnected && drawCard(box, button, source), ok ? 800 : 0));
}

function drawCard(box: DomElement, button: DomElement, source: string) {
  const card = document.createElement("div");
  card.setAttribute("data-cp-redraw-card", "");
  card.setAttribute("title", "Open full screen");
  card.addEventListener("click", () => openDiagram(source));
  const frame = peleFrame();
  card.appendChild(frame);
  box.appendChild(card);
  const stop = drawDiagram(frame, source, (size) => {
    stop();
    if (!size) {
      card.remove();
      button.setAttribute("data-cp-redraw", "failed");
      button.setAttribute("title", "Pele couldn't draw this diagram");
      return;
    }
    frame.setAttribute("style", `height: auto; max-width: ${size.width}px; aspect-ratio: ${size.width} / ${size.height}`);
    box.setAttribute("data-cp-redrawn", "");
  });
}

function peleFrame() {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("srcdoc", PELE_DOC);
  return frame;
}

/** A redrawn diagram over the whole window, fit to it; a click or Escape closes it. */
function openDiagram(source: string) {
  const overlay = document.createElement("div");
  overlay.setAttribute("data-cp-diagram-full", "");
  const frame = peleFrame();
  overlay.appendChild(frame);
  (document.body as DomElement).appendChild(overlay);
  const onKey = (event: KeyEvent) => event.key === "Escape" && close();
  const close = () => {
    stop();
    overlay.remove();
    document.removeEventListener("keydown", onKey, true);
  };
  overlay.addEventListener("click", close);
  document.addEventListener("keydown", onKey, true);
  const stop = drawDiagram(frame, source, (size) => size || close());
}

import { Platform } from "react-native";
import { BOT_ICON, PROVIDER_ICONS } from "./provider-icons";
import { guardPositional, POSITIONAL, splitTop } from "./css-guard";

declare const localStorage: { getItem(key: string): string | null; setItem(key: string, value: string): void };
declare const location: { reload(): void };
interface DomElement {
  isConnected: boolean;
  parentElement: DomElement | null;
  firstElementChild: DomElement | null;
  lastElementChild: DomElement | null;
  previousElementSibling: DomElement | null;
  nextElementSibling: DomElement | null;
  scrollHeight: number;
  textContent: string | null;
  querySelector(selector: string): DomElement | null;
  querySelectorAll(selector: string): ArrayLike<DomElement>;
  style: { getPropertyValue(name: string): string; setProperty(name: string, value: string, priority?: string): void; removeProperty(name: string): void };
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  hasAttribute(name: string): boolean;
  matches(selector: string): boolean;
  closest(selector: string): DomElement | null;
  tagName: string;
  removeAttribute(name: string): void;
  addEventListener(type: "click" | "mouseover" | "mouseleave" | "wheel" | "touchstart" | "pointerdown", listener: (event: { target: unknown }) => void, capture?: boolean): void;
  removeEventListener(type: "click" | "mouseover" | "mouseleave" | "wheel" | "touchstart" | "pointerdown", listener: (event: { target: unknown }) => void, capture?: boolean): void;
  remove(): void;
  // Used by the model selector.
  children: ArrayLike<DomElement>;
  firstChild: { nodeValue: string | null } | null;
  innerHTML: string;
  outerHTML: string;
  scrollTop: number;
  clientHeight: number;
  scrollBy(options: { top: number }): void;
  appendChild(el: DomElement): void;
  insertAdjacentElement(where: "afterend" | "beforeend", el: DomElement): void;
  click(): void;
  cloneNode(deep: true): DomElement;
  getBoundingClientRect(): { top: number; left: number; right: number; bottom: number; width: number; height: number };
}
declare const document: {
  documentElement: DomElement;
  querySelector(selector: string): DomElement | null;
  querySelectorAll(selector: string): ArrayLike<DomElement>;
  createElement(tag: "style" | "div" | "span" | "button"): DomElement;
  addEventListener(type: "click", listener: (event: { target: unknown; clientX: number; clientY: number }) => void, capture?: boolean): void;
  removeEventListener(type: "click", listener: (event: { target: unknown; clientX: number; clientY: number }) => void, capture?: boolean): void;
  addEventListener(type: "pointerover", listener: (event: { target: unknown }) => void, capture?: boolean): void;
  removeEventListener(type: "pointerover", listener: (event: { target: unknown }) => void, capture?: boolean): void;
  elementsFromPoint(x: number, y: number): DomElement[];
  addEventListener(type: "keydown", listener: (event: KeyEvent) => void, capture?: boolean): void;
  removeEventListener(type: "keydown", listener: (event: KeyEvent) => void, capture?: boolean): void;
  body: unknown;
  head: { appendChild(el: DomElement): void };
};
interface KeyEvent {
  key: string;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  preventDefault(): void;
}
declare function setTimeout(cb: () => void, ms: number): number;
declare const HTMLIFrameElement: { prototype: { setAttribute(name: string, value: string): void } };
type MessageListener = (event: { source: unknown; data: unknown }) => void;
declare const window: { addEventListener(type: "message", listener: MessageListener): void; removeEventListener(type: "message", listener: MessageListener): void };
declare function requestAnimationFrame(cb: () => void): number;
declare function getComputedStyle(el: DomElement): {
  transform: string;
  borderRightWidth: string;
  borderRightStyle: string;
  borderLeftWidth: string;
  borderTopWidth: string;
  borderBottomWidth: string;
  borderRadius: string;
  backgroundColor: string;
  lineHeight: string;
  fontSize: string;
  fontWeight: string;
  fontFamily: string;
  marginLeft: string;
  height: string;
  color: string;
  position: string;
  zIndex: string;
  boxShadow: string;
  overflowAnchor: string;
};
declare class ResizeObserver {
  constructor(cb: () => void);
  observe(target: DomElement): void;
  disconnect(): void;
}
declare function getSelection(): { toString(): string } | null;
declare class MutationObserver {
  constructor(cb: (records: Array<{ addedNodes: ArrayLike<unknown>; removedNodes: ArrayLike<unknown>; target: unknown; attributeName?: string | null; type: string }>) => void);
  observe(target: unknown, options: { childList: boolean; subtree: boolean; characterData?: boolean; attributes?: boolean; attributeFilter?: string[] }): void;
  disconnect(): void;
}

const SETTINGS_KEY = "@paseo:app-settings";

export interface HostAppearance {
  uiFont?: string;
  monoFont?: string;
  contentSize: number;
  codeSize: number;
  pluginThemeId?: string;
  /** Settings → Appearance → Theme: a Paseo theme id, or "plugin" for one a plugin contributes. */
  theme?: string;
  /** Settings → Appearance → Always expand reasoning. */
  autoExpandReasoning: boolean;
  /** Settings → Tool call display: "overview" (Summary) groups consecutive calls, "detailed" lists each one. */
  toolCallDetail: "overview" | "detailed";
}

export const DEFAULTS: HostAppearance = { contentSize: 15, codeSize: 12, autoExpandReasoning: false, toolCallDetail: "detailed" };
let cache: { at: number; value: HostAppearance } | undefined;

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const size = (v: unknown, fallback: number) => (typeof v === "number" && v >= 8 && v <= 32 ? v : fallback);

/**
 * Settings → Appearance fonts, sizes and reasoning expansion, which the plugin API doesn't pass to plugins.
 * ponytail: reads the desktop/web app's own `@paseo:app-settings` storage (undocumented, may move);
 * iOS/Android get defaults. Switch to a host settings API once Paseo exposes one.
 */
export function readHostAppearance(): HostAppearance {
  if (Platform.OS !== "web") return DEFAULTS;
  if (cache && Date.now() - cache.at < 2000) return cache.value;
  let value = DEFAULTS;
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Record<string, unknown> | null;
    if (s && typeof s === "object") {
      value = {
        uiFont: text(s.uiFontFamily),
        monoFont: text(s.monoFontFamily),
        contentSize: size(s.contentFontSize, DEFAULTS.contentSize),
        codeSize: size(s.codeFontSize, DEFAULTS.codeSize),
        pluginThemeId: s.theme === "plugin" ? text(s.pluginThemeId) : undefined,
        theme: text(s.theme),
        autoExpandReasoning: s.autoExpandReasoning === true,
        // Same fallback as Paseo: the legacy compactToolCalls flag, then "detailed"; "concise" is the old "overview".
        toolCallDetail: ["overview", "concise"].includes(String(s.toolCallDetailLevel)) || (s.toolCallDetailLevel === undefined && s.compactToolCalls === true) ? "overview" : "detailed",
      };
    }
  } catch {
    // Unreadable or missing settings: keep Paseo's defaults.
  }
  cache = { at: Date.now(), value };
  return value;
}

/** Whether this client can switch Paseo's app theme itself (desktop and web). */
export const canSetAppTheme = Platform.OS === "web";

/**
 * Selects a plugin theme as Paseo's app theme the way Settings → Appearance does, then reloads the
 * app so it is applied. `catalogId` is `<plugin id>/theme/<theme id>`.
 * ponytail: writes Paseo's private settings document (undocumented); replace with a host
 * "select theme" API once Paseo offers one.
 */
export function setAppTheme(catalogId: string, extra: Record<string, unknown> = {}) {
  updateAppSettings({ ...extra, theme: "plugin", pluginThemeId: catalogId });
}

/**
 * Paseo's font stacks when Settings → Appearance leaves a font empty.
 * ponytail: copied from Paseo 0.11.x (DEFAULT_UI_FONT_STACK / DEFAULT_MONO_FONT_STACK); update if Paseo changes them.
 */
export const PASEO_FONT_STACKS = {
  ui: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
};

/** Changes Paseo's own app settings (desktop/web) and reloads so Paseo picks them up. Same caveat as setAppTheme. */
export function updateAppSettings(patch: Record<string, unknown>) {
  if (!canSetAppTheme) return;
  let current: Record<string, unknown> = {};
  try {
    current = (JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Record<string, unknown> | null) ?? {};
  } catch {
    // Start from Paseo's defaults rather than refusing to switch.
  }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...patch }));
  cache = undefined;
  location.reload();
}

/** Paseo's current code-block syntax theme (Settings → Appearance), desktop/web only. */
export function readSyntaxTheme(): string | undefined {
  if (!canSetAppTheme) return undefined;
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as { syntaxTheme?: unknown } | null;
    return typeof s?.syntaxTheme === "string" ? s.syntaxTheme : "one";
  } catch {
    return undefined;
  }
}


/** Elements matching `selector` within the added roots, the roots themselves included. */
const within = (roots: DomElement[], selector: string) => roots.flatMap((root) => [...(root.matches(selector) ? [root] : []), ...Array.from(root.querySelectorAll(selector))]);

/** Process an added subtree once, even when a mutation batch lists its descendants too. */
function distinctRoots(roots: Iterable<DomElement>): DomElement[] {
  const all = new Set(roots);
  return [...all].filter((root) => {
    if (!root.isConnected) return false;
    for (let parent = root.parentElement; parent; parent = parent.parentElement) if (all.has(parent)) return false;
    return true;
  });
}

interface DomWatcher {
  /** Runs before the browser paints, with the elements just added (initially the whole body), so restyled parts never flash. */
  added?: (roots: DomElement[]) => void;
  /** Runs at most every 250ms once mutations settle (they stream in while agents run). */
  settled?: (textRoots: DomElement[]) => void;
  /** Runs before the browser paints, with the elements just removed and the parents they left. */
  removed?: (nodes: Array<{ el: DomElement; from: DomElement }>) => void;
}

// One observer for every watcher: Paseo mutates the DOM on each streamed token.
const watchers = new Set<DomWatcher>();
let observer: MutationObserver | undefined;
let settleTimer: ReturnType<typeof setTimeout> | undefined;
const textRoots = new Set<DomElement>();

function settle() {
  settleTimer = undefined;
  const roots = distinctRoots(textRoots);
  textRoots.clear();
  for (const w of watchers) w.settled?.(roots);
}

/**
 * Watches the DOM for the restyles below; also how the plugin notices host settings that change without
 * telling plugins. Returns cleanup, which runs `cleanup` after the watcher is removed.
 */
export function watchDom(watcher: DomWatcher, cleanup: () => void) {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  watchers.add(watcher);
  if (!observer) {
    observer = new MutationObserver((records) => {
      const roots: DomElement[] = [];
      const settings = records.some((r) => r.attributeName) && document.querySelector(SETTINGS_PANE);
      const removed: Array<{ el: DomElement; from: DomElement }> = [];
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) if ((node as { nodeType?: number }).nodeType === 1) roots.push(node as DomElement);
        for (const node of Array.from(record.removedNodes)) if ((node as { nodeType?: number }).nodeType === 1) removed.push({ el: node as DomElement, from: record.target as DomElement });
        const node = record.target as { nodeType: number; parentElement: DomElement | null };
        const target = node.nodeType === 1 ? record.target as DomElement : node.parentElement;
        if (!target) continue;
        // Text mutations need only revisit their own markdown subtree, rather than every historical reply.
        if (!record.attributeName && target.closest(MSG)) textRoots.add(target);
        if (record.attributeName && settings) {
          if (target.closest(SETTINGS_PANE) || getComputedStyle(target).position === "absolute" || getComputedStyle(target).position === "fixed") roots.push(target);
        }
      }
      const added = distinctRoots(roots);
      if (added.length) for (const w of watchers) w.added?.(added);
      if (removed.length) for (const w of watchers) w.removed?.(removed);
      settleTimer ??= setTimeout(settle, 250);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "style", "hidden", "aria-hidden", "aria-expanded", "data-state"] });
  }
  watcher.added?.([document.body as DomElement]);
  watcher.settled?.([]);
  return () => {
    watchers.delete(watcher);
    if (!watchers.size) {
      observer?.disconnect();
      observer = undefined;
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = undefined;
      textRoots.clear();
    }
    cleanup();
  };
}

/**
 * Gives Paseo's sidebars (left nav, explorer, Settings) the theme's sidebar color while `colors()` returns one.
 * Plugin themes can't set it: Paseo builds their surfaceSidebar from the background. On web Paseo's styles read
 * the theme from CSS variables (`--colors-surface-sidebar` on `:root.pluginDark` / `.pluginLight`), so overriding
 * the variable recolors every sidebar surface from the first frame, on every screen. Returns cleanup.
 * ponytail: the variable and class names are Unistyles/Paseo internals; replace with a sidebar theme token once Paseo has one.
 */
export function paintSidebar(colors: () => { sidebar: string } | undefined) {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  const style = document.createElement("style");
  document.head.appendChild(style);
  return watchDom({ settled: () => {
    const sidebar = colors()?.sidebar;
    // The explorer's tab row draws the page color (surface0) rather than the sidebar's.
    const css = sidebar
      ? `html:root:is(.pluginDark, .pluginLight) { --colors-surface-sidebar: ${sidebar}; }
[data-testid="workspace-explorer-sidebar"] [data-testid="workspace-tabs-row"] { background-color: var(--colors-surface-sidebar) !important; }`
      : "";
    if (style.textContent !== css) style.textContent = css;
  } }, () => style.remove());
}

const SELECT_CSS = `
[data-cp-select] { position: fixed; z-index: 10000; display: flex; align-items: center; gap: 1px; padding: 3px; border: 1px solid var(--colors-border); border-radius: 8px; background-color: var(--cp-control, var(--colors-surface2)); box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45); animation: cp-pop 40ms ease-out; }
:root:is(.light, .pluginLight) [data-cp-select] { background-color: var(--cp-raised, var(--colors-surface1)); }
[data-cp-select] > span { padding: 0 4px 0 7px; color: var(--cp-muted, var(--colors-foreground-muted)); font-size: 12px; }
[data-cp-select] > button { height: 24px; padding: 0 8px; border: 0; border-radius: 6px; background: transparent; color: var(--cp-fg, var(--colors-foreground)); font-family: inherit; font-size: 12px; font-weight: 500; white-space: nowrap; cursor: pointer; }
[data-cp-select] > button:hover { background-color: color-mix(in srgb, var(--cp-control, var(--colors-surface2)), var(--cp-fg, var(--colors-foreground)) 12%); }
`;
const REPLY = '[data-testid="assistant-message"]';
type SelNode = { nodeType: number; parentElement: DomElement | null };
type Selected = { isCollapsed: boolean; rangeCount: number; toString(): string; getRangeAt(i: 0): { startContainer: SelNode; endContainer: SelNode; getBoundingClientRect(): ReturnType<DomElement["getBoundingClientRect"]> } };
type CopyEvent = { target: unknown; key?: string; shiftKey?: boolean; clipboardData?: { setData(type: string, data: string): void }; preventDefault(): void; stopImmediatePropagation(): void };
const selDoc = document as unknown as {
  getSelection(): Selected | null;
  execCommand(command: "copy"): boolean;
  addEventListener(type: string, listener: (event: CopyEvent) => void, capture?: boolean): void;
  removeEventListener(type: string, listener: (event: CopyEvent) => void, capture?: boolean): void;
  body: DomElement;
};
declare const innerWidth: number;

/**
 * Selecting text in a reply shows "Copy  Text  Markdown" above it. Markdown is what ⌘C already copies (Paseo's
 * copy handler on replies turns the selection into markdown), so that button just runs a copy; plain text
 * swaps in the selection's rendered text. Returns cleanup.
 */
export function selectionCopyMenu(enabled: () => boolean) {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  const style = document.createElement("style");
  style.textContent = SELECT_CSS;
  document.head.appendChild(style);
  let menu: DomElement | undefined;
  const hide = () => (menu?.remove(), (menu = undefined));
  const inMenu = (target: unknown) => !!menu && !!(target as DomElement | null)?.closest?.("[data-cp-select]");
  const copyPlain = (text: string) => {
    const swap = (event: CopyEvent) => {
      event.clipboardData?.setData("text/plain", text);
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    selDoc.addEventListener("copy", swap, true);
    selDoc.execCommand("copy");
    selDoc.removeEventListener("copy", swap, true);
  };
  const el = (n: SelNode) => (n.nodeType === 1 ? (n as unknown as DomElement) : n.parentElement);
  // Above the selection, or below it near the top; hidden once the selection scrolls out of view.
  const place = () => {
    const sel = selDoc.getSelection();
    if (!menu || !sel?.rangeCount) return hide();
    const box = sel.getRangeAt(0).getBoundingClientRect();
    if (box.bottom < 0 || box.height === 0) return hide();
    const { width, height } = menu.getBoundingClientRect();
    const top = box.top - height - 12 < 8 ? box.bottom + 12 : box.top - height - 12;
    menu.style.setProperty("top", `${Math.round(top)}px`);
    menu.style.setProperty("left", `${Math.round(Math.min(Math.max(box.left + box.width / 2 - width / 2, 8), innerWidth - width - 8))}px`);
  };
  const show = () => {
    hide();
    const sel = selDoc.getSelection();
    if (!enabled() || !sel || sel.isCollapsed || !sel.rangeCount || !sel.toString().trim()) return;
    const range = sel.getRangeAt(0);
    const reply = el(range.startContainer)?.closest(REPLY) ?? el(range.endContainer)?.closest(REPLY);
    if (!reply) return;
    const m = (menu = document.createElement("div"));
    m.setAttribute("data-cp-select", "");
    // The menu sits outside #root, where Paseo sets its UI font.
    m.style.setProperty("font-family", getComputedStyle(reply).fontFamily);
    // Pressing a button would otherwise clear the selection before it copies.
    (m as unknown as { addEventListener(type: "mousedown", l: (e: CopyEvent) => void): void }).addEventListener("mousedown", (e) => e.preventDefault());
    const lead = document.createElement("span");
    lead.textContent = "Copy";
    m.appendChild(lead);
    for (const [label, copy] of [
      ["Text", () => copyPlain(sel.toString())],
      ["Markdown", () => selDoc.execCommand("copy")],
    ] as const) {
      const button = document.createElement("button");
      button.textContent = label;
      button.addEventListener("click", () => {
        copy();
        lead.textContent = "Copied";
        setTimeout(() => menu === m && hide(), 700);
      });
      m.appendChild(button);
    }
    selDoc.body.appendChild(m);
    place();
  };
  const onUp = (e: CopyEvent) => void (inMenu(e.target) || setTimeout(show, 0));
  const onDown = (e: CopyEvent) => void (inMenu(e.target) || hide());
  const onKey = (e: CopyEvent) => void (e.key === "Escape" ? hide() : e.shiftKey && setTimeout(show, 0));
  const onSelection = () => void (selDoc.getSelection()?.isCollapsed && hide());
  const events: Array<[string, (e: CopyEvent) => void, boolean]> = [["mouseup", onUp, false], ["mousedown", onDown, false], ["keyup", onKey, false], ["selectionchange", onSelection, false], ["scroll", place, true]];
  for (const [type, l, capture] of events) selDoc.addEventListener(type, l, capture);
  return () => {
    for (const [type, l, capture] of events) selDoc.removeEventListener(type, l, capture);
    hide();
    style.remove();
  };
}

const CLAMP = "data-chat-polish-clamp";
const SHOWN_LINES = 6;
// Clamp only when it hides a real chunk; a 7-line message isn't worth a click.
const CLAMP_FROM_LINES = 9;
const CLAMP_CSS = `
[${CLAMP}] { cursor: pointer; }
[${CLAMP}] > :last-child { overflow: hidden; }
[${CLAMP}="closed"] > :last-child { max-height: var(--chat-polish-max); -webkit-mask-image: linear-gradient(#000 55%, transparent); mask-image: linear-gradient(#000 55%, transparent); }
[${CLAMP}]::after { content: "Show full message"; margin-top: 8px; font-size: 12px; font-weight: 500; color: var(--chat-polish-muted); opacity: 0.75; }
[${CLAMP}="open"]::after { content: "Show less"; }
`;

/**
 * Clamps long user messages to six lines with a fade while `enabled()`; clicking the bubble toggles it.
 * Paseo keeps its own bubble, so rewind, copy, timestamps and attachments still work. Returns cleanup.
 * ponytail: the bubble is the first grandchild of [data-testid="user-message"] and its text the bubble's last
 * child; breaks if Paseo restructures the message. Replace with a native clamp if Paseo adds one.
 */
export function clampUserMessages(enabled: () => boolean) {
  const bound = new Map<DomElement, () => void>();
  let style: DomElement | undefined;
  const release = () => {
    for (const [bubble, onClick] of bound) {
      bubble.removeEventListener("click", onClick);
      bubble.removeAttribute(CLAMP);
    }
    bound.clear();
  };
  const prune = () => {
    for (const [bubble, onClick] of bound) if (!bubble.isConnected) {
      bubble.removeEventListener("click", onClick);
      bubble.removeAttribute(CLAMP);
      bound.delete(bubble);
    }
  };
  return watchDom({ added: (roots) => {
      if (!enabled()) return release();
      if (!style) {
        style = document.createElement("style");
        style.textContent = CLAMP_CSS;
        document.head.appendChild(style);
      }
      prune();
      for (const message of within(roots, '[data-testid="user-message"]')) {
        const bubble = message.firstElementChild?.firstElementChild;
        const text = bubble?.lastElementChild;
        if (!bubble || !text || bound.has(bubble)) continue;
        const css = getComputedStyle(text);
        const line = parseFloat(css.lineHeight) || parseFloat(css.fontSize) * 1.4;
        if (!line || text.scrollHeight < line * CLAMP_FROM_LINES) continue;
        bubble.style.setProperty("--chat-polish-max", `${Math.round(line * SHOWN_LINES)}px`);
        bubble.style.setProperty("--chat-polish-muted", css.color);
        bubble.setAttribute(CLAMP, "closed");
        // Selecting text inside the bubble shouldn't toggle it.
        const onClick = () => {
          if (getSelection()?.toString()) return;
          bubble.setAttribute(CLAMP, bubble.getAttribute(CLAMP) === "open" ? "closed" : "open");
        };
        bubble.addEventListener("click", onClick);
        bound.set(bubble, onClick);
      }
    }, removed: prune },
    () => {
      release();
      style?.remove();
      style = undefined;
    },
  );
}

const TAG = "data-chat-polish";
// Assistant replies, plus the plan body Paseo renders with the same markdown (tagged in tagParts: a positional pseudo-class here
// would be tested on every ancestor of every markdown node).
const MSG = ':is([data-testid="assistant-message"], [data-cp-plan-md])';
const ROW = ':is([data-testid="tool-call-group"], [data-testid="tool-call-badge"])';
const ROW_ICON = `${ROW} > button > div > div:first-child`;
const mask = (paths: string) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`)}")`;
// Shown when a row was first drawn open, so its own icon was never seen.
const WRENCH_MASK = mask('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>');
const THUMBS = `:root:not([data-cp-rt-images="native"]) ${MSG} [data-paseo-markdown-tag="img"]`;
// Parts Paseo marks only through a child, and containers whose every descendant is restyled, are tagged by tagParts.
// :has(), and "X *" where X is only known by data-testid (on nearly every ancestor), re-match the whole timeline
// on every node a scroll mounts, which made fast scrolling stutter.
// Paseo marks each markdown part for its copy-as-markdown feature; the restyle keys on those marks.
const md = (tag: string) => `[data-paseo-markdown-tag="${tag}"]`;
const INLINE_CODE = `span${md("code")}`;
const HEADING = (n: number) => `${md(`h${n}`)} > [dir] > span`;
const MARK = "[data-paseo-markdown-list-marker]";
const MARK_UL = `${md("ul")} > ${md("li")} > ${MARK}`;
const MARK_OL = `${md("ol")} > ${md("li")} > ${MARK}`;
const CODE_BLOCK = `${MSG} ${md("pre")}`;
// Paseo 0.12 renders markdown as plain HTML (p, h1, li, table, …) inside .enrm-text, styled inline and without the marks above,
// except code fences, which keep them. The md() rules for other elements only match 0.11's renderer (plugin v0.2.x).
const MD = `${MSG} .enrm-text`;
const TASK_BOX = `${MD} li > span > input[type="checkbox"]`;
const ADMONITION = `${MD} .enrm-admonition`;
// Fences that name a language (```ts); Paseo leaves the attribute off otherwise.
const LANG = '[data-paseo-markdown-language]:not([data-paseo-markdown-language=""])';

const FOOTER = '[data-cp-part="footer"]';
const FOOTER_ICON = ':is(button[aria-label="Copy turn"], [data-testid="assistant-fork-menu-trigger"])';
const COMPOSER_BUTTON =
  ':is([data-testid="message-input-attach-button"], [data-testid^="agent-feature-"], [data-testid="workspace-create-submit"], [data-testid="context-window-meter"], button:is([aria-label="Open agent features"], [aria-label="Start dictation"], [aria-label="Send message"], [aria-label="Queue message"], [aria-label="Stop agent"], [aria-label$="Voice mode"]))';
const CHIP = ':is([data-testid="combined-model-selector"], [data-testid="agent-thinking-selector"], [data-testid="mode-control"])';
const PERMISSION = '[data-cp-part="permission"]';
const PLAN = '[data-testid="permission-plan-card"]';
const CTX = '[data-cp-part="context"]';
const CTX_HEAD = `${CTX} > div:first-child`;
const USAGE = `${CTX} > [data-testid^="usage-report-"]`;
const LIMIT = '[data-cp-part="usage-limits"] > div';
const QUESTION = '[data-testid="question-form-card"]';
const PRIMARY = ':is([data-testid="permission-request-accept"], [data-testid="question-form-primary-action"])';
const SECONDARY = ':is([data-testid="permission-request-deny"], [data-testid="question-form-dismiss"])';

// Paseo steps the working dots' opacity from JS every ~160ms, which reads as slow and choppy. The same
// clockwise chase (dots 4, 6, 5, 3, 1, 2) as a CSS animation runs smoothly on the compositor.
// WORKING_BOX is the indicator's 14px box (tagged by tagParts; the dashboard preview draws one too), its first child Paseo's 2 × 3 grid.
const WORKING_BOX = '[data-cp-part="loader"]';
// The dashboard's "Dots" loader tile ([data-cp-dots]) shares the animation.
const DOT = `:is(${WORKING_BOX}, [data-cp-dots]) > div:first-child > div`;
const WORKING_DOTS = `${DOT} { animation: cp-dots 0.8s linear infinite !important; }
${[4, 5, 3, 0, 2, 1].map((step, i) => `${DOT}:nth-child(${i + 1}) { animation-delay: ${((step - 6) * 0.8) / 6}s !important; }`).join("\n")}
@keyframes cp-dots { 0% { opacity: 1; } 70%, 90% { opacity: 0.15; } 100% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { ${DOT} { animation: none !important; } }`;

// Other loaders (Dashboard → Messages → Working indicator): tagParts puts nine <i> over the box, Paseo's grid hides,
// and each loader draws with the dots it needs (or the overlay's ::before). Sizes scale the whole box.
// The dashboard's loader tiles carry their own overlay ([data-cp-loader][data-cp-tile="name"]) so each tile animates whatever is chosen globally.
const L = (name: string) => `:is(:root[data-cp-rt-loader="${name}"] [data-cp-loader]:not([data-cp-tile]), [data-cp-loader][data-cp-tile="${name}"])`;
const RING = [0, 1, 2, 3, 4, 5, 6, 7];
const LOADERS = `
${WORKING_BOX} { position: relative; }
:root[data-cp-rt-loader-size="m"] ${WORKING_BOX} { transform: scale(1.15); }
:root[data-cp-rt-loader-size="l"] ${WORKING_BOX} { transform: scale(1.3); }
[data-cp-loader] { display: none; position: absolute; inset: 0; pointer-events: none; color: var(--cp-fg); }
:root[data-cp-rt-loader] ${WORKING_BOX} > div:first-child { visibility: hidden; }
:root[data-cp-rt-loader] [data-cp-loader], [data-cp-loader][data-cp-tile] { display: block; }
[data-cp-loader] > i { position: absolute; display: none; border-radius: 50%; background: currentColor; }
${[...Array(9)].map((_, i) => `[data-cp-loader] > i:nth-child(${i + 1}) { --i: ${i}; --c: ${i % 3}; --r: ${Math.floor(i / 3)}; --m: ${Math.max(Math.abs((i % 3) - 1), Math.abs(Math.floor(i / 3) - 1))}; --s: ${[0, 1, 2, 5, 4, 3, 6, 7, 8].indexOf(i)}; }`).join("\n")}
@keyframes cp-tail { 0% { opacity: 1; } 100% { opacity: 0.15; } }
@keyframes cp-spin { to { transform: rotate(360deg); } }
${L("sparkle")}::before { content: "·"; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font: 13px/1 var(--cp-mono); color: var(--cp-accent); animation: cp-sparkle 1.2s steps(1) infinite; }
@keyframes cp-sparkle { 0% { content: "·"; } 10% { content: "✢"; } 20% { content: "✳"; } 30% { content: "✶"; } 40% { content: "✻"; } 50% { content: "✽"; } 60% { content: "✻"; } 70% { content: "✶"; } 80% { content: "✳"; } 90% { content: "✢"; } }
${L("spokes")} > i:nth-child(-n+8) { display: block; left: 50%; top: 50%; width: 1.4px; height: 3.6px; margin: -1.8px 0 0 -0.7px; border-radius: 1px; transform: rotate(calc(var(--i) * 45deg)) translateY(-4.4px); animation: cp-tail 0.9s linear infinite; animation-delay: calc((var(--i) - 8) * 0.9s / 8); }
${L("dotring")} > i:nth-child(-n+8) { display: block; left: 50%; top: 50%; width: 2.4px; height: 2.4px; margin: -1.2px 0 0 -1.2px; transform: rotate(calc(var(--i) * 45deg)) translateY(-5px); animation: cp-tail 1s linear infinite; animation-delay: calc((var(--i) - 8) * 1s / 8); }
${L("orb")}::before { content: ""; position: absolute; inset: 3px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #fff 0, var(--cp-accent) 45%, color-mix(in srgb, var(--cp-accent), #000 40%) 100%); animation: cp-orb 2s ease-in-out infinite; }
@keyframes cp-orb { 0%, 100% { transform: scale(0.78); box-shadow: 0 0 0 0 transparent; opacity: 0.75; } 50% { transform: scale(1); box-shadow: 0 0 5px 1.5px color-mix(in srgb, var(--cp-accent) 45%, transparent); opacity: 1; } }
:is(${L("matrix")}, ${L("snake")}) > i { display: block; width: 2.6px; height: 2.6px; left: calc(1.5px + var(--c) * 4.2px); top: calc(1.5px + var(--r) * 4.2px); }
${L("matrix")} > i { animation: cp-matrix 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite; animation-delay: calc(var(--m) * 0.14s); }
@keyframes cp-matrix { 0%, 100% { opacity: 0.2; transform: scale(0.7); } 30% { opacity: 1; transform: scale(1.1); } 60% { opacity: 0.3; transform: scale(0.8); } }
${L("snake")} > i { animation: cp-snake 1.35s linear infinite; animation-delay: calc((var(--s) - 9) * 1.35s / 9); }
@keyframes cp-snake { 0% { opacity: 1; } 33% { opacity: 0.35; } 55%, 100% { opacity: 0.12; } }
@media (prefers-reduced-motion: reduce) { [data-cp-loader] > i, [data-cp-loader]::before { animation: none !important; } }`;

const CLOCK_MASK = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16.5 12"/></svg>')}")`;
// Paseo renders a popover once hidden (inline opacity 0, or parked at -9999px) to measure it, then places it. Animating
// that first frame would override the hiding and flash the popover in the window corner, so motion starts once placed.
// On close, the context card is swapped for an exit copy without its FadeIn; animating that copy made it blink, so only
// the open card (FadeIn in its style) rises in.
// Floating surfaces drawn alike: pickers, Paseo's menus (tagged by tagParts), Command Center.
const SURFACE = ':is([data-testid="combobox-desktop-container"], [data-cp-part="menu"], [role="menu"], [role="listbox"], [data-testid="command-center-panel"])';
const POPOVER = `:is(:is([data-testid="combobox-desktop-container"], [data-testid="chat-outline-preview"]):not([style*="opacity: 0"]), [data-testid="context-window-details"][style*="FadeIn"], :is([data-cp-part="menu"], [role="menu"], [role="listbox"]):not([hidden]):not([aria-hidden="true"]):not([data-state="closed"]):not([style*="opacity: 0"])):not([style*="-9999"], [style*="FadeOut"], [data-cp-glide], [data-cp-swap], [data-cp-ghost])`;

// The chat's own chrome from the "Chat Surfaces" design: turn footer, composer, prompts, outline rail.
const CHAT_CHROME_CSS = `
${FOOTER} { gap: 8px !important; min-height: 26px !important; align-items: center !important; }
${FOOTER} > [data-cp-part="fork"] { width: 20px !important; height: 20px !important; }
${FOOTER} ${FOOTER_ICON} { width: 20px !important; height: 20px !important; padding: 3px !important; margin: 0 !important; }
${FOOTER} > :last-child, ${FOOTER} > :last-child * { font-size: 12px !important; }
[data-testid="user-message"] > div:first-child > div:first-child { transition: box-shadow 0.6s ease-out; }
[data-testid="user-message"][data-cp-flash] > div:first-child > div:first-child { box-shadow: 0 0 0 1.5px var(--cp-accent); transition: none; }
[data-testid="turn-working-indicator"] > div > div:first-child { width: 20px !important; margin-left: 0 !important; align-items: center !important; }
${WORKING_DOTS}
${LOADERS}

/* Queued messages: a dashed "not sent yet" row with a clock and label, quiet 26px icon actions; send-now keeps the accent. */
[data-cp-part="queued"] { min-height: 36px !important; padding: 0 6px 0 12px !important; gap: 8px !important; align-items: center !important; box-sizing: border-box !important; border: 1px dashed var(--cp-rule) !important; border-radius: 12px !important; background-color: transparent !important; }
[data-cp-part="queued"]::before { content: ""; order: -2; flex-shrink: 0; width: 13px; height: 13px; background-color: var(--cp-muted); -webkit-mask: ${CLOCK_MASK} center / contain no-repeat; mask: ${CLOCK_MASK} center / contain no-repeat; }
[data-cp-part="queued"]::after { content: "Queued"; order: -1; flex-shrink: 0; font-size: 11px; color: var(--cp-muted); }
[data-cp-part="queued"] > div:first-child { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 13px !important; color: var(--cp-fg) !important; }
[data-cp-part="queued"] > div:last-child { gap: 0 !important; align-items: center !important; }
/* The actions are matched by position (edit, then send-now): Paseo builds differ in their tags and labels. */
[data-cp-part="queued"] > div:last-child > * { width: 26px !important; height: 26px !important; min-width: 0 !important; border: 0 !important; border-radius: 8px !important; background-color: transparent !important; box-shadow: none !important; }
[data-cp-part="queued"] > div:last-child > * * { background-color: transparent !important; }
[data-cp-part="queued"] > div:last-child > *:hover { background-color: var(--cp-control) !important; }
[data-cp-part="queued"] > div:last-child svg { width: 14px !important; height: 14px !important; }
/* The icons carry their stroke as an attribute (dark, for Paseo's filled buttons); CSS stroke overrides it. */
[data-cp-part="queued"] > div:last-child :is(svg, svg *) { stroke: var(--cp-muted) !important; }
[data-cp-part="queued"] > div:last-child > :last-child :is(svg, svg *) { stroke: var(--cp-accent) !important; }
[data-cp-part="queued"] > div:last-child > :last-child:is(:disabled, [aria-disabled="true"]) :is(svg, svg *) { stroke: var(--cp-muted) !important; }
[data-cp-part="queued"] > div:last-child > :is(:disabled, [aria-disabled="true"]) { opacity: 0.45 !important; }
[data-cp-part="queued"] > div:last-child > :is(:disabled, [aria-disabled="true"]):hover { background-color: transparent !important; }

/* Popovers that open with no motion (pickers, the context card, the outline preview) rise in; Paseo's menus already animate. */
@keyframes cp-pop { from { opacity: 0; transform: translateY(2px) scale(0.99); } to { opacity: 1; transform: none; } }
${POPOVER} { animation: cp-pop 40ms cubic-bezier(0.16, 1, 0.3, 1) both !important; }
/* Menus open quickly; dismiss them immediately without a closing transition. */
${SURFACE} { transition: none !important; animation-duration: 40ms !important; }
${SURFACE}:is([hidden], [aria-hidden="true"], [data-state="closed"], [style*="opacity: 0"], [style*="-9999"]),
[data-testid="chat-outline-preview"]:is([hidden], [aria-hidden="true"], [data-state="closed"], [style*="opacity: 0"], [style*="-9999"]) { animation: none !important; transition: none !important; }
@media (prefers-reduced-motion: reduce) { ${POPOVER} { animation: none !important; } }
/* Every floating surface shares one shape: all pickers, menus/listboxes, and Command Center. */
${SURFACE} { border-radius: 12px !important; border-color: var(--colors-border) !important; box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45) !important; }
[data-cp-setting-menu] { box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22) !important; }
/* Dark raised sits too close to the page (1.15:1), so dark themes lift surfaces to control; light themes keep raised (white), as control is darker than the page there. */
${SURFACE} { background-color: var(--cp-control) !important; }
:root:is(.light, .pluginLight) ${SURFACE} { background-color: var(--cp-raised) !important; }
${SURFACE} :is(button, [role="button"], [role="menuitem"], [role="option"], a[href]) { border-radius: 16px !important; }
/* Reset inherited cursor styles throughout the popup; restore pointer only across active rows. */
${SURFACE}, ${SURFACE} * { cursor: default !important; }
${SURFACE} :is(input, textarea, [contenteditable="true"]) { cursor: text !important; }
${SURFACE} :is(button, [role="button"], [role="menuitem"], [role="option"], a[href]):not(:disabled):not([aria-disabled="true"]),
${SURFACE} :is(button, [role="button"], [role="menuitem"], [role="option"], a[href]):not(:disabled):not([aria-disabled="true"]) * { cursor: pointer !important; }
${SURFACE} :is(button, [role="button"], [role="menuitem"], [role="option"], a[href]):not(:disabled):not([aria-disabled="true"]):is(:hover, :focus-visible, [aria-selected="true"]) { background-color: color-mix(in srgb, var(--cp-control), var(--cp-fg) 12%) !important; }
:root:is(.light, .pluginLight) ${SURFACE} :is(button, [role="button"], [role="menuitem"], [role="option"], a[href]):not(:disabled):not([aria-disabled="true"]):is(:hover, :focus-visible, [aria-selected="true"]) { background-color: color-mix(in srgb, var(--cp-raised), var(--cp-fg) 8%) !important; }
/* Paseo lights a row with the raised color, which would vanish on a raised surface; markLitRows tags it to draw it a step up. */
[data-cp-lit] { background-color: color-mix(in srgb, var(--cp-control), var(--cp-fg) 12%) !important; }
:root:is(.light, .pluginLight) [data-cp-lit] { background-color: color-mix(in srgb, var(--cp-raised), var(--cp-fg) 8%) !important; }
/* The sidebar's workspace hover card is a menu too (role=menu), but its rows ran edge to edge, so their 16px hover fill missed the
   card's corners. Inset them 4px like menu rows: 28px tall, 13px text, 14px icons, title 13/600, divider inset too. */
[data-cp-part="ws-card"] { padding: 4px !important; }
[data-cp-part="ws-card"] > * { min-height: 28px !important; padding: 0 8px !important; gap: 8px !important; align-items: center !important; }
[data-cp-part="ws-card"] > :first-child { min-height: 0 !important; padding: 8px 8px 6px !important; }
[data-cp-part="ws-card"] > :empty { min-height: 0 !important; height: 1px !important; margin: 4px 0 !important; padding: 0 !important; background-color: var(--cp-rule, var(--colors-border)) !important; }
[data-cp-part="ws-card"] svg { width: 14px !important; height: 14px !important; flex-shrink: 0; }
[data-cp-part="ws-card"] [dir] { font-size: 13px !important; line-height: 18px !important; }
[data-cp-part="ws-card"] > :first-child [dir] { font-weight: 600 !important; color: var(--cp-fg) !important; }
/* Between sessions only the newest card shows, gliding from the last one (watchHoverCards). */
[data-cp-gone] { visibility: hidden !important; }
@keyframes cp-glide-a { from { transform: translateY(var(--cp-from)); } }
@keyframes cp-glide-b { from { transform: translateY(var(--cp-from)); } }
[data-cp-part="ws-card"][data-cp-glide="a"]:not([style*="FadeOut"]) { animation: cp-glide-a 100ms cubic-bezier(0.33, 1, 0.68, 1) both !important; }
[data-cp-part="ws-card"][data-cp-glide="b"]:not([style*="FadeOut"]) { animation: cp-glide-b 100ms cubic-bezier(0.33, 1, 0.68, 1) both !important; }
@keyframes cp-icon-a { from { opacity: 0; transform: scale(0.5); } }
@keyframes cp-icon-b { from { opacity: 0; transform: scale(0.5); } }
[data-cp-part="ws-card"][data-cp-swap="a"] svg { animation: cp-icon-a 100ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
[data-cp-part="ws-card"][data-cp-swap="b"] svg { animation: cp-icon-b 100ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
@keyframes cp-swap-text-a { from { opacity: 0.35; transform: translateY(var(--cp-shift, 0px)); } }
@keyframes cp-swap-text-b { from { opacity: 0.35; transform: translateY(var(--cp-shift, 0px)); } }
[data-cp-part="ws-card"][data-cp-swap="a"] [dir] { animation: cp-swap-text-a 100ms cubic-bezier(0.33, 1, 0.68, 1) both; }
[data-cp-part="ws-card"][data-cp-swap="b"] [dir] { animation: cp-swap-text-b 100ms cubic-bezier(0.33, 1, 0.68, 1) both; }
@media (prefers-reduced-motion: reduce) { [data-cp-part="ws-card"]:is([data-cp-glide], [data-cp-swap]), [data-cp-part="ws-card"][data-cp-swap] :is(svg, [dir]) { animation: none !important; } }
/* Command Center keeps its taller palette rows, inset like every other surface's. */
[data-testid="command-center-panel"] button { margin: 0 6px !important; padding: 8px 10px !important; border-radius: 6px !important; }
[data-testid="combobox-desktop-container"]:not([${TAG}]) > div:first-child > div { padding: 4px 12px !important; }
[data-testid="combobox-desktop-container"]:not([${TAG}]) > div:nth-child(2) button { min-height: 28px !important; margin: 0 4px !important; padding: 0 8px !important; }
/* Picker rows sit 4px inside a 12px card with a 1px border: 12 - 1 - 4 = 7px keeps their corners concentric with the card's. */
[data-testid="combobox-desktop-container"]:not([${TAG}="models"]) button { border-radius: 7px !important; }
:is(:is([data-testid="combobox-desktop-container"]:not([${TAG}]) > div:nth-child(2) button, [data-cp-part="menu"] [role="menuitem"]) > div:nth-child(2), [data-testid="command-center-panel"] button > div > div:first-child > div:nth-child(2)) > :first-child { font-size: 13px !important; font-weight: 500 !important; }

/* Pin the bottom while the chat follows output. Paseo scrolls to the bottom a frame after a row grows (streaming text, a tool call
   finishing), so one frame painted with the bottom cut off: the jitter. With every child but the last (its bottom inset) out of
   scroll anchoring, the browser keeps that inset in place in the same layout. Scrolled up, Paseo sets overflow-anchor: none on the
   scroller, which turns this off. Measured on a streaming reply: off-bottom frames went from 12/33 to 0/69. */
[data-testid="agent-chat-scroll"] > div > :not(:last-child) { overflow-anchor: none !important; }

[data-cp-part="composer"] { border-radius: 12px !important; padding: 14px 10px 10px 16px !important; gap: 20px !important; }
@supports (corner-shape: squircle) { [data-cp-part="composer"] { border-radius: 28px !important; corner-shape: squircle; } }
/* Paseo keeps the box two lines tall even when empty; let it size to its text instead (one line, up to 400px). */
/* Paseo pulls the toolbar 6px past both sides; keep it on the left (the + lines up with the text) but not the right, so Send sits as far from the edge as from the bottom. */
[data-cp-part="composer"] > div:last-child { margin-right: 0 !important; }
[data-testid="message-input-root"] textarea { field-sizing: content !important; height: auto !important; min-height: 21px !important; }
[data-cp-part="input-extra"] { display: none !important; }
${CHIP} { height: 24px !important; padding: 0 7px !important; border-radius: 8px !important; }
[data-cp-part="chip"] * { font-size: 13px !important; font-weight: 500 !important; }
[data-cp-part="chip"] > div > div:last-child:nth-child(3) { display: none !important; }
${CHIP}:hover { background-color: var(--cp-control) !important; }
[data-testid="message-input-root"] ${COMPOSER_BUTTON} { width: 26px !important; min-width: 26px !important; height: 26px !important; border-radius: 8px !important; }
[data-testid="message-input-root"] [data-testid="context-window-meter"] { border-radius: 999px !important; }
button[aria-label="Stop agent"] { background-color: var(--cp-control) !important; border: 1px solid var(--cp-rule) !important; }
button[aria-label="Stop agent"] svg { width: 11px !important; height: 11px !important; stroke: var(--cp-fg) !important; fill: var(--cp-fg) !important; }
:is([data-testid="subagents-track-header"], [data-testid="composer-diff-stat-pill"]) { height: 24px !important; padding: 0 10px !important; border-radius: 999px !important; border-color: var(--cp-rule) !important; }

${PERMISSION}, ${QUESTION} { padding: 12px 14px !important; border-color: var(--cp-rule) !important; border-radius: 12px !important; }
${PERMISSION} > div:first-child, [data-testid="question-form-current-question"] { font-weight: 500 !important; color: var(--cp-fg) !important; }
[data-cp-part="permission-body"] > div > div:first-child { background-color: var(--cp-sunken) !important; border: 1px solid var(--cp-rule) !important; border-radius: 8px !important; overflow: hidden !important; }
[data-testid="permission-request-question"] { font-size: 12px !important; margin: 0 !important; }
${PERMISSION} > div:last-child, ${QUESTION} > div:last-child, ${PLAN} > div:last-child > div:last-child { justify-content: flex-end !important; }
:is(${PRIMARY}, ${SECONDARY}) { height: 28px !important; padding: 0 12px !important; border-radius: 8px !important; justify-content: center !important; }
[data-cp-part="primary"] *, [data-cp-part="secondary"] * { font-size: 13px !important; font-weight: 500 !important; }
${SECONDARY} { background-color: transparent !important; border-color: var(--cp-rule) !important; }
${PRIMARY} { background-color: var(--cp-accent) !important; border-color: var(--cp-accent) !important; }
[data-cp-part="primary"] * { color: var(--cp-accent-fg) !important; font-weight: 600 !important; }
${PRIMARY} svg { stroke: var(--cp-accent-fg) !important; }
${PRIMARY}[aria-disabled="true"] { opacity: 0.45 !important; }
${QUESTION} [role="radio"] { padding: 7px 10px !important; }
${QUESTION} [role="radio"][aria-checked="true"] { background-color: var(--cp-control) !important; }
${QUESTION} [role="radio"] > div > div:first-child { width: 14px !important; height: 14px !important; margin-top: 4px !important; }
${QUESTION} [role="radio"][aria-checked="true"] > div > div:first-child { border-color: var(--cp-accent) !important; background-color: var(--cp-accent) !important; box-shadow: inset 0 0 0 3px var(--cp-control) !important; }
${QUESTION} [role="radio"] > div > div:nth-child(2) > :first-child { color: var(--cp-fg) !important; }
${QUESTION} [role="radio"] > div > div:nth-child(2) > :nth-child(2) { font-size: 12px !important; line-height: 18px !important; }
${PLAN} { border-radius: 12px !important; padding: 0 !important; gap: 0 !important; border-color: var(--cp-rule) !important; overflow: hidden !important; }
${PLAN} > button:first-child { padding: 12px 16px !important; border-bottom: 1px solid var(--cp-rule) !important; }
[data-cp-part="plan-head"] * { font-weight: 600 !important; }
${PLAN} > div:nth-child(2) { padding: 14px 16px !important; }
${PLAN} > div:last-child { padding: 10px 16px 12px !important; border-top: 1px solid var(--cp-rule) !important; }

[data-testid^="chat-outline-tick-"][aria-selected="true"] > div { background-color: var(--cp-accent) !important; }
[data-testid="chat-outline-preview"] { background-color: var(--cp-raised) !important; border-radius: 12px !important; box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45) !important; }
[data-cp-part="outline-preview"] * { font-size: 13px !important; }
/* Between ticks, a copy of the last preview glides to the hovered tick until Paseo's next one takes over (ghostOutlinePreview). */
[data-testid="chat-outline-preview"][data-cp-ghost] { pointer-events: none; animation: none !important; transition: transform 100ms cubic-bezier(0.33, 1, 0.68, 1), opacity 100ms ease-out !important; }
[data-cp-ghost="out"] { opacity: 0; }
@keyframes cp-outline-in { from { transform: translateY(var(--cp-from, 0px)); } }
/* Starts where the copy's dimmed text was, so the swap has no blank frame. */
@keyframes cp-text-in { from { opacity: 0.35; transform: translateY(var(--cp-shift, 0px)); } }
[data-testid="chat-outline-preview"][data-cp-swap] { animation: cp-outline-in 100ms cubic-bezier(0.33, 1, 0.68, 1) both !important; }
[data-testid="chat-outline-preview"][data-cp-swap="new"] > * { animation: cp-text-in 100ms cubic-bezier(0.33, 1, 0.68, 1) both; }
[data-testid="chat-outline-preview"][data-cp-ghost] > * { transition: opacity 100ms ease-out; }
[data-testid="chat-outline-preview"][data-cp-ghost][data-cp-moved] > * { opacity: 0.35; }
@media (prefers-reduced-motion: reduce) { [data-testid="chat-outline-preview"]:is([data-cp-ghost], [data-cp-swap]), [data-cp-swap] > * { animation: none !important; transition: none !important; } }

/* Context window hover card: caps label, big percent with a bar (from data-cp-pct), plan pill, rounded limit bars, footer under a hairline. */
${CTX} { padding: 14px !important; gap: 14px !important; border-radius: 12px !important; border: 1px solid var(--cp-rule) !important; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.3) !important; }
${CTX_HEAD} { display: grid !important; grid-template-columns: auto 1fr; column-gap: 6px; row-gap: 6px; align-items: baseline; }
${CTX_HEAD} > :nth-child(1) { grid-column: 1 / -1; font-size: 11px !important; font-weight: 600 !important; letter-spacing: 0.06em; text-transform: uppercase; color: var(--cp-muted) !important; }
${CTX_HEAD} > :nth-child(2) { grid-column: 1; grid-row: 2; }
${CTX_HEAD} > [data-cp-pct] { font-size: 0 !important; }
${CTX_HEAD} > [data-cp-pct]::before { content: attr(data-cp-pct) "%"; margin-right: 6px; font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--cp-fg); }
${CTX_HEAD} > [data-cp-pct]::after { content: "used"; font-size: 12px; color: var(--cp-muted); }
${CTX_HEAD} > :nth-child(3) { grid-column: 2; grid-row: 2; justify-self: end; font-family: var(--cp-mono) !important; font-size: 12px !important; }
${CTX_HEAD}[data-cp-level]::after { content: ""; grid-column: 1 / -1; grid-row: 3; height: 4px; margin-top: 2px; border-radius: 999px; background: linear-gradient(to right, var(--cp-accent) var(--cp-pct), var(--cp-control) 0); }
${CTX_HEAD}[data-cp-level="high"]::after { background: linear-gradient(to right, var(--cp-warn) var(--cp-pct), var(--cp-control) 0); }
${CTX_HEAD} > :nth-child(4) { grid-column: 1 / -1; grid-row: 4; font-size: 12px !important; color: var(--cp-muted) !important; }
${CTX} > div:nth-child(2) { background-color: var(--cp-rule) !important; }
${USAGE} > div:first-child > div:nth-child(2) { font-size: 13px !important; font-weight: 500 !important; color: var(--cp-fg) !important; }
${USAGE} > div:first-child > div:nth-child(3) { background-color: transparent !important; border: 1px solid var(--cp-rule) !important; padding: 0 7px !important; }
[data-cp-part="usage-plan"] > div { font-size: 11px !important; }
${USAGE} > div:nth-child(2) { gap: 10px !important; }
${LIMIT} { margin: 0 !important; padding: 0 !important; }
[data-cp-part="limit-body"] > div { gap: 6px !important; }
[data-cp-part="limit-body"] > div > div:first-child > div:nth-child(2) { font-variant-numeric: tabular-nums; }
[data-cp-part="limit-body"] > div > div:last-child { height: 4px !important; border-radius: 999px !important; background-color: var(--cp-control) !important; }
[data-cp-part="limit-body"] > div > div:last-child > div { border-radius: 999px !important; }
${USAGE} > div:nth-child(3) { padding-top: 12px !important; border-top: 1px solid var(--cp-rule) !important; }
[data-cp-compact] { margin: -6px -6px 0; }
[data-cp-compact] > button { display: flex; flex: 1; align-items: center; gap: 8px; height: 30px; padding: 0 8px; border: 0; border-radius: 8px; background: transparent; color: var(--cp-fg); font: inherit; font-size: 12px; font-weight: 500; text-align: left; cursor: pointer; }
[data-cp-compact] > button:hover { background-color: var(--cp-control); }
[data-cp-compact] > button > span:last-child { margin-left: auto; font-size: 11px; font-weight: 400; color: var(--cp-muted); }
[data-cp-compact][data-cp-level="high"] > button { color: var(--cp-warn); }
[data-cp-compact] > button[disabled] { opacity: 0.6; cursor: default; }
[data-cp-compact] svg { width: 13px; height: 13px; flex-shrink: 0; }
/* Paseo's card sits 8px above the meter and closes 100ms after the pointer leaves both; this strip bridges the gap. */
${CTX}::after { content: ""; position: absolute; left: 0; right: 0; top: 100%; height: 12px; }
${USAGE} > div:nth-child(4) { margin-top: -6px !important; }
`;

// Values come from CSS variables set by setNativeColors, so a theme switch restyles without re-tagging.
const NATIVE_CSS = `
/* Settings pages (tagged by tagSettings): surfaces 12, controls 8, and one text field, 32px in a sunken well that lights up on focus.
   Settings has its own sidebar, so a reload there can come before the --cp-* colors are set: Paseo's own colors stand in. */
[data-cp-set="card"] { border-radius: 12px !important; }
[data-cp-set="control"] { height: 32px !important; min-height: 32px !important; padding-top: 0 !important; padding-bottom: 0 !important; border-radius: 8px !important; }
:is([data-cp-set="field"], [data-cp-set="area"]) { border: 1px solid var(--colors-border) !important; border-radius: 8px !important; background-color: var(--cp-sunken, color-mix(in srgb, var(--colors-surface0), #000 15%)) !important; transition: border-color 120ms ease-out, box-shadow 120ms ease-out; }
[data-cp-set="field"] { height: 32px !important; min-height: 32px !important; padding: 0 10px !important; }
:is([data-cp-set="field"], [data-cp-set="area"]):hover { border-color: color-mix(in srgb, var(--cp-muted, var(--colors-foreground-muted)) 55%, transparent) !important; }
:is([data-cp-set="field"], [data-cp-set="area"]):focus-within { border-color: var(--cp-accent, var(--colors-accent)) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--cp-accent, var(--colors-accent)) 25%, transparent) !important; }
/* The field draws focus; an input inside a wrapper field stays see-through. */
[data-cp-set-input] { outline: none !important; }
[data-cp-set-input]:not([data-cp-set]) { background-color: transparent !important; }
@supports (corner-shape: squircle) { [data-cp-set="card"] { border-radius: 28px !important; corner-shape: squircle; } }
/* Paseo's keyboard focus ring is its brand green on every theme; follow the theme's accent instead. */
:focus-visible { outline-color: var(--cp-accent, var(--colors-accent)) !important; }
${ROW} > button { padding: 2px 8px 2px 12px !important; }
${ROW} > button > div > div:first-child { width: 20px !important; height: 20px !important; margin-right: 8px !important; }
${ROW} > button > div > div:first-child svg { width: 15px !important; height: 15px !important; }
/* Paseo swaps a row's icon for a chevron on hover and while open. Like the plugin's rows, keep the icon (cached by tagParts) and show the chevron at the row's end. */
${ROW_ICON}[data-cp-chev] { position: static !important; justify-content: flex-start !important; }
${ROW_ICON}[data-cp-chev]::before { content: ""; align-self: flex-start; flex-shrink: 0; width: 15px; height: 15px; margin: 2.5px 0 0 2px; background-color: var(--cp-muted); -webkit-mask: var(--cp-row-icon, ${WRENCH_MASK}) center / 15px no-repeat; mask: var(--cp-row-icon, ${WRENCH_MASK}) center / 15px no-repeat; }
${ROW_ICON}[data-cp-chev] > div { position: absolute !important; right: 4px; top: 50%; width: 12px !important; height: 12px !important; margin-top: -6px; opacity: 0.7; display: flex !important; align-items: center !important; justify-content: center !important; }
${ROW_ICON}[data-cp-chev] svg { width: 9px !important; height: 9px !important; }
${ROW_ICON}[data-cp-chev] + div { padding-right: 18px !important; }
[data-cp-part="row-label"] > [dir]:first-child { color: var(--cp-fg) !important; }
/* Row icons hidden per kind (Paseo's groups count as merged rows, its single calls as tool calls): the slot collapses; an open or hovered row keeps its chevron at the row's end. */
${([["tool-call-group", "steps"], ["tool-call-badge", "tool"]] as const)
  .map(([testid, kind]) => {
    const slot = `:root[data-cp-rt-icon-${kind}="hide"] [data-testid="${testid}"] > button > div > div:first-child`;
    return `${slot} { width: 0 !important; margin-right: 0 !important; }\n${slot}:not([data-cp-chev]) > svg, ${slot}[data-cp-chev]::before { display: none !important; }`;
  })
  .join("\n")}
/* Running rows draw a shimmer from a transparent copy of the labels laid over them: type changes go to both so they stay aligned. */
[data-cp-part="row-label"] [dir]:first-child { font-weight: 500 !important; }
[data-testid="tool-call-badge"] > button > div > [data-cp-part="row-label"] [dir]:nth-child(2) { font-family: var(--cp-mono) !important; font-size: calc(var(--cp-code) + 1px) !important; }
/* Same pitch as the plugin's rows (TIGHT in views.tsx): 36 between rows, 20 to the reply text on either side. */
[data-testid="tool-call-group"] { margin-top: var(--cp-d-row-top) !important; margin-bottom: var(--cp-d-row-bottom) !important; }
/* The open-file button Paseo adds on hover is taller than the label; keep it from growing the row. */
[data-testid="tool-call-open-file"] { margin-top: -4px !important; margin-bottom: -4px !important; }
/* Expanded rows read like the plugin's: no filled header, children behind a 1px rule, details in a sunken block. */
${ROW} > button { background-color: transparent !important; border-color: transparent !important; border-radius: 6px !important; }
:root[data-cp-rt-steps="full"] ${ROW} > button:hover { background-color: var(--cp-raised) !important; }
/* Rows step back so the reply reads first: faded until hovered or opened (an open row's details follow its button), with no hover fill. Plugin rows do the same in views.tsx. */
:root:not([data-cp-rt-steps="full"]) ${ROW} > button:last-child:not(:hover) { opacity: var(--cp-quiet); }
[data-testid="tool-call-badge"] > button > div > [data-cp-part="row-label"] > [dir]:nth-child(2) { color: var(--cp-muted) !important; }
[data-cp-part="group-body"] > div { max-height: none !important; }
[data-cp-part="group-body"] > div > div { padding: 4px 13px 0 41px !important; position: relative !important; }
[data-cp-part="group-body"] > div > div::before { content: ""; position: absolute; left: 22px; top: 6px; bottom: 12px; width: 1px; background: var(--cp-rule); }
[data-testid="tool-call-badge"] > div:nth-child(2) { margin: 6px 13px 4px 41px !important; border: 1px solid var(--cp-rule) !important; border-radius: 8px !important; background-color: var(--cp-sunken) !important; }
[data-cp-part="badge-body"] > div > div > div { background-color: transparent !important; }
/* Paseo nests a horizontal scroller inside the vertical one, so long lines showed their scrollbar only below the last line. One box scrolls both ways instead. */
[data-cp-part="detail-scroll"] { max-height: 320px !important; overflow: auto !important; }
[data-cp-part="detail-scroll"] div { overflow: visible !important; }
[data-testid="tool-call-badge"] { margin-bottom: 10px !important; }

[data-testid="user-message"] > div > div:first-child { padding: 10px 14px !important; border-radius: 16px !important; }
@supports (corner-shape: squircle) { [data-testid="user-message"] > div > div:first-child { border-radius: 28px !important; corner-shape: squircle; } }
/* Prompts take at most 60% of the chat (never under 360px, so they stay readable in a narrow pane). */
[data-testid="user-message"] > div { max-width: max(60%, min(100%, 360px)) !important; }
/* Attachments leave the bubble: thumbnails and file cards stack above it, right-aligned, and the bubble wraps only the text.
   tagParts marks the bubble (data-cp-attach) and each row: att-images (thumbnails) or att-files (issues, PRs, reviews, text). */
[data-cp-attach] { display: flex !important; flex-direction: column !important; align-items: flex-end !important; gap: 6px; padding: 0 !important; border-radius: 0 !important; background-color: transparent !important; }
[data-cp-attach] > [data-message-text] { padding: 10px 14px; border-radius: 16px; background-color: var(--colors-surface3); }
@supports (corner-shape: squircle) { [data-cp-attach] > [data-message-text] { border-radius: 28px; corner-shape: squircle; } }
[data-cp-attach] > :is([data-cp-part="att-images"], [data-cp-part="att-files"]) { justify-content: flex-end !important; gap: 6px !important; margin: 0 !important; }
[data-cp-part="att-images"] > * { width: 104px !important; height: 104px !important; border-radius: 12px !important; border: 1px solid var(--cp-rule) !important; transition: filter 120ms; }
[data-cp-part="att-images"] > :only-child { width: 240px !important; height: 160px !important; }
[data-cp-part="att-images"] > *:hover { filter: brightness(1.08); }
[data-cp-part="att-images"] > * > div, [data-cp-part="att-images"] > * > div > * { width: 100% !important; height: 100% !important; }
[data-cp-part="att-files"] > * { border-radius: 10px !important; border: 1px solid var(--cp-rule) !important; }
[data-cp-part="att-files"] > * > div { height: 48px !important; max-width: 280px !important; padding: 0 14px 0 8px !important; gap: 10px !important; background-color: var(--cp-raised) !important; }
[data-cp-part="att-icon"] { width: 32px !important; height: 32px !important; border-radius: 8px; background-color: var(--cp-control); }
[data-cp-part="att-files"] > * > div > :last-child > :first-child { font-size: 13px !important; font-weight: 500 !important; color: var(--cp-fg) !important; }
[data-cp-part="att-files"] > * > div > :last-child > :last-child { font-size: 12px !important; color: var(--cp-muted) !important; }
/* Density (Prefs.density) and faded row strength (Prefs.steps) as variables the rules below read; views.tsx matches them (TIGHT, QUIET). */
:root { --cp-d-item: 6px; --cp-d-pad: 4px; --cp-d-row-top: 2px; --cp-d-row-bottom: -8px; --cp-d-footer: 16px; --cp-d-prompt: 8px; --cp-d-li: 6px; --cp-quiet: 0.45; }
:root[data-cp-rt-density="compact"] { --cp-d-item: 2px; --cp-d-pad: 2px; --cp-d-row-top: 0px; --cp-d-row-bottom: -12px; --cp-d-footer: 12px; --cp-d-prompt: 0px; --cp-d-li: 3px; }
:root[data-cp-rt-density="spacious"] { --cp-d-item: 12px; --cp-d-pad: 6px; --cp-d-row-top: 5px; --cp-d-row-bottom: -3px; --cp-d-footer: 22px; --cp-d-prompt: 18px; --cp-d-li: 10px; }
:root[data-cp-rt-steps="dim"] { --cp-quiet: 0.3; }
:root[data-cp-rt-steps="soft"] { --cp-quiet: 0.65; }
/* Chat rhythm (15px text): 18 between paragraphs, 20 between text and step rows, ~21 to the turn footer, 28 from a prompt to its
   reply, 46 between turns. Paseo stacks three spacings per reply block (its item's 12/16 margin, 12 padding at a reply's ends,
   12 under each paragraph), which left 28 between paragraphs and pushed rows and prompts apart. */
[data-cp-part="msg-item"] { margin-bottom: var(--cp-d-item) !important; }
[data-testid="assistant-message"] { padding-top: var(--cp-d-pad) !important; padding-bottom: var(--cp-d-pad) !important; }
/* A paragraph alone in its block; consecutive paragraphs (a quote, the plan card) keep Paseo's gap between them. */
[data-testid="assistant-message"] ${md("p")}:last-child { margin-bottom: 0 !important; }
/* The timestamp and rewind row under a prompt only shows on hover; let it overlap the gap below instead of adding 32px to it. */
[data-testid="user-message-trailing-row"] { margin-top: 2px !important; margin-bottom: -5px !important; }
/* The turn footer, and the working line while the agent runs (it has the same fork button): close under reply text, which ends
   with spare padding, and about 20 under a step row, whose -8 bottom margin (TIGHT) would otherwise pull it in. */
[data-cp-part="footer-gap"] { margin-top: var(--cp-d-footer) !important; }
[data-cp-part="footer-gap"][data-cp-tight] { margin-top: 2px !important; }
[data-testid="user-message"] { margin-top: var(--cp-d-prompt) !important; }
[data-testid="user-message"] > div > div:first-child > :last-child { line-height: 1.55 !important; }

${MSG} span { line-height: 1.6 !important; }
${MSG} ${INLINE_CODE} { border-radius: 4px !important; padding: 2px 5px !important; }
${MSG} ${md("strong")}, ${MSG} ${md("strong")} span { font-weight: 600 !important; }
${MSG} ${HEADING(1)} { font-size: 24px !important; line-height: 1.3 !important; }
${MSG} ${HEADING(2)} { font-size: 20px !important; line-height: 1.3 !important; }
${MSG} ${HEADING(3)} { font-size: 16px !important; line-height: 1.3 !important; }
${MSG} ${md("h1")}, ${MSG} ${md("h2")} { border-bottom-width: 0 !important; padding-bottom: 0 !important; }
${MSG} ${md("li")}:not(:last-child) { margin-bottom: var(--cp-d-li) !important; }
${MSG} ${md("li")}:last-child { margin-bottom: 0 !important; }
${MSG} ${MARK} { margin: 0 10px 0 4px !important; line-height: calc(var(--cp-content) * 1.6) !important; }
${MSG} ${MARK_OL} { font-family: var(--cp-mono) !important; font-size: calc(var(--cp-code) + 1px) !important; }
${MSG} ${md("blockquote")} { background: transparent !important; border-left: 2px solid var(--cp-accent) !important; border-radius: 0 !important; padding: 2px 0 2px 14px !important; margin: 4px 0 !important; }
${MSG} ${md("blockquote")} > :last-child { margin-bottom: 0 !important; }
${MSG} ${md("blockquote")} span { font-style: italic !important; color: var(--cp-muted) !important; }
${MSG} ${md("table")} { border-radius: 8px !important; border-color: var(--cp-rule) !important; overflow: hidden !important; }
${MSG} ${md("table")} > div > div { border-color: var(--cp-rule) !important; }
${MSG} ${md("table")} > div:last-child > div:last-child { border-bottom-width: 0 !important; }
${MSG} ${md("table")} > div > div > div { padding: 9px 14px !important; border-right-width: 0 !important; border-bottom-width: 0 !important; background: transparent !important; }
${MSG} ${md("table")} > div:first-child { background: var(--cp-raised) !important; }
${MSG} ${md("table")} span:not(${INLINE_CODE}) { font-size: calc(var(--cp-content) - 1px) !important; }
${MSG} ${md("table")} span { line-height: 1.45 !important; }
${MSG} ${md("table")} > div:first-child span:not(${INLINE_CODE}) { font-size: 12px !important; font-weight: 600 !important; color: var(--cp-muted) !important; }
${CODE_BLOCK} { background: var(--cp-sunken) !important; border-color: var(--cp-rule) !important; border-radius: 8px !important; padding: 12px 14px !important; }
${CODE_BLOCK} :is(div, span) { line-height: 1.5 !important; }
/* Code block A: the language in a header strip, with Paseo's copy button in it. B floats the language instead; C has none. */
:root:not([data-cp-rt-code="b"]):not([data-cp-rt-code="c"]) ${CODE_BLOCK}${LANG} { padding-top: 0 !important; }
:root:not([data-cp-rt-code="b"]):not([data-cp-rt-code="c"]) ${CODE_BLOCK}${LANG}::before { content: attr(data-paseo-markdown-language); margin: 0 -14px 10px; padding: 7px 14px; border-bottom: 1px solid var(--cp-rule); font-family: var(--cp-mono); font-size: 12px; line-height: 18px; color: var(--cp-muted); }
:root:not([data-cp-rt-code="b"]):not([data-cp-rt-code="c"]) ${CODE_BLOCK}${LANG} > button[aria-label="Copy code"] { top: 5px !important; opacity: 0.6 !important; }
:root:not([data-cp-rt-code="b"]):not([data-cp-rt-code="c"]) ${CODE_BLOCK}${LANG} > button[aria-label="Copy code"]:hover { opacity: 1 !important; }
/* Mermaid: the diagram itself is themed inside its frame (themeMermaid); the card matches code blocks, its zoom controls faint until hover. */
[data-testid="mermaid-viewport"] { background-color: var(--cp-sunken) !important; border-color: var(--cp-rule) !important; border-radius: 8px !important; }
[data-testid="mermaid-viewport"] [data-testid="zoomable-viewport-toolbar"] { opacity: 0.6; transition: opacity 0.15s; }
[data-testid="mermaid-viewport"]:hover [data-testid="zoomable-viewport-toolbar"] { opacity: 1; }
/* Images in a reply that also has text (tool screenshots land at the end of the text before them) get the plugin's thumbnail size; Paseo's own button still opens the full image. */
${THUMBS} { width: auto !important; min-height: 0 !important; margin: 6px 8px 2px 0 !important; }
:root:not([data-cp-rt-images="native"]) ${MSG} [data-cp-part="image-text"] > [dir] { flex-basis: 100% !important; }
${THUMBS} > button { width: var(--cp-thumb-w) !important; height: var(--cp-thumb-h) !important; aspect-ratio: auto !important; border: 1px solid var(--cp-rule) !important; border-radius: 8px !important; background-color: var(--cp-raised) !important; }
${THUMBS} > button div { width: 100% !important; height: 100% !important; background-size: cover !important; }
:root { --cp-thumb-w: 200px; --cp-thumb-h: 128px; }
:root[data-cp-rt-images="large"] { --cp-thumb-w: 320px; --cp-thumb-h: 200px; }

/* The same design on Paseo 0.12's renderer. A whole reply is one block now, so the gap between paragraphs is its children's
   margin: the 0.11 spacing (item margin plus padding on both ends), with the 1.6 line height's leading on top. */
${MD} > * { margin-bottom: calc(var(--cp-d-item) + 2 * var(--cp-d-pad)) !important; }
${MD} > :last-child, ${MD} :is(blockquote, .enrm-admonition, li) > p:last-child { margin-bottom: 0 !important; }
${MD} :is(p, li, blockquote) { line-height: 1.6 !important; }
${MD} code { border-radius: 4px !important; padding: 2px 5px !important; }
${MD} strong { font-weight: 600 !important; }
${MD} h1 { font-size: 24px !important; line-height: 1.3 !important; }
${MD} h2 { font-size: 20px !important; line-height: 1.3 !important; }
${MD} h3 { font-size: 16px !important; line-height: 1.3 !important; }
${MD} li { margin-top: 0 !important; }
${MD} li:not(:last-child) { margin-bottom: var(--cp-d-li) !important; }
${MD} ol > li::marker { font-family: var(--cp-mono); font-size: calc(var(--cp-code) + 1px); }
${MD} blockquote { background: transparent !important; border-inline-start: 2px solid var(--cp-accent) !important; border-radius: 0 !important; padding: 2px 0 2px 14px !important; }
${MD} blockquote p { font-style: italic !important; color: var(--cp-muted) !important; }
${MD} table { border-collapse: separate !important; border-spacing: 0 !important; border: 1px solid var(--cp-rule) !important; border-radius: 8px !important; overflow: hidden !important; }
${MD} > div:not(.enrm-admonition) { border-radius: 8px !important; }
${MD} :is(th, td) { padding: 9px 14px !important; border-width: 0 0 1px !important; border-color: var(--cp-rule) !important; line-height: 1.45 !important; }
${MD} tbody > tr:last-child > td { border-bottom-width: 0 !important; }
${MD} tbody > tr { background: transparent !important; }
${MD} td { font-size: calc(var(--cp-content) - 1px) !important; }
${MD} th { background: var(--cp-raised) !important; font-size: 12px !important; font-weight: 600 !important; color: var(--cp-muted) !important; }
${MD} hr { border-top-color: var(--cp-rule) !important; }
:root:not([data-cp-rt-images="native"]) ${MD} img { width: var(--cp-thumb-w) !important; height: var(--cp-thumb-h) !important; object-fit: cover !important; border: 1px solid var(--cp-rule) !important; border-radius: 8px !important; background-color: var(--cp-raised) !important; margin: 6px 8px 2px 0 !important; }
${CHAT_CHROME_CSS}`;

const MONO_FALLBACK = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
const hexAlpha = (hex: string, a: number) => (/^#[0-9a-f]{6}$/i.test(hex) ? hex + Math.round(a * 255).toString(16).padStart(2, "0") : hex);
const darker = (hex: string) =>
  /^#[0-9a-f]{6}$/i.test(hex) ? `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.86).toString(16).padStart(2, "0")).join("")}` : hex;

/** Publishes the app theme's colors and the code font as CSS variables for restyleNative. */
export function setNativeColors(c: { surface0: string; surface1: string; surface2: string; border: string; foreground: string; foregroundMuted: string; accent: string; accentForeground: string; statusSuccess: string; statusWarning: string }) {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  const a = readHostAppearance();
  const vars: Record<string, string> = {
    "--cp-fg": c.foreground,
    "--cp-muted": c.foregroundMuted,
    "--cp-accent": c.accent,
    "--cp-raised": c.surface1,
    "--cp-control": c.surface2,
    "--cp-accent-fg": c.accentForeground,
    "--cp-sunken": darker(c.surface0),
    "--cp-rule": hexAlpha(c.border, 0.6),
    "--cp-mono": a.monoFont ? `${a.monoFont}, ${MONO_FALLBACK}` : MONO_FALLBACK,
    "--cp-code": `${a.codeSize}px`,
    "--cp-content": `${a.contentSize}px`,
    "--cp-ok": c.statusSuccess,
    "--cp-warn": c.statusWarning,
  };
  for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
  const theme = mermaidThemeFrom(c);
  if (theme === mermaidTheme) return;
  mermaidTheme = theme;
  rethemeMermaid?.();
}

// ---- Mermaid ----

// Paseo draws each diagram in a sandboxed iframe from a srcdoc that bundles mermaid, so page CSS can't reach it.
// The theme goes into that srcdoc instead, as React sets it and before the frame loads (changing it later doesn't take).
// Paseo's own theme expression, or one this plugin put there earlier.
const MERMAID_THEME = /theme:(\w+)==="dark"\?"dark":"default"|theme:"base",themeVariables:\{[^}]*\},themeCSS:"(?:[^"\\]|\\.)*"/;
const MERMAID_FRAME = '[data-testid="mermaid-viewport-canvas"] iframe';
const MERMAID_CSS = [
  ".node rect, .actor, rect.note, .labelBox, .statediagram-state rect, .classGroup rect { rx: 6px; ry: 6px; }",
  ".cluster rect { rx: 8px; ry: 8px; stroke-dasharray: 3 3; }",
  ".flowchart-link, .edgePath .path, .transition, .relation, .messageLine0, .messageLine1 { stroke-width: 1.25px; }",
  ".edgeLabel, .edgeLabel p, .edgeLabel rect { border-radius: 4px; }",
].join(" ");
let mermaidTheme = "";
let rethemeMermaid: (() => void) | undefined;

const mix = (a: string, b: string, t: number) =>
  /^#[0-9a-f]{6}$/i.test(a) && /^#[0-9a-f]{6}$/i.test(b)
    ? `#${[1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, "0")).join("")}`
    : a;
const isDark = (hex: string) => /^#[0-9a-f]{6}$/i.test(hex) && [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0) < 384;

/** Mermaid's "base" theme in the app's colors: raised nodes with a 1px border, thin muted edges, accent-tinted notes. */
function mermaidThemeFrom(c: Parameters<typeof setNativeColors>[0]) {
  const sunken = darker(c.surface0);
  // Mermaid derives shades from these, so they stay opaque hex.
  const vars = {
    darkMode: isDark(c.surface0),
    background: sunken,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif',
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
  };
  // ER's "zero" markers are hard-coded white.
  const css = `${MERMAID_CSS} marker[id*="zeroOr"] circle { fill: ${sunken}; }`;
  return `theme:"base",themeVariables:${JSON.stringify(vars)},themeCSS:${JSON.stringify(css)}`;
}

/**
 * Themes mermaid diagrams from now on, and redraws those on screen when the colors change; returns cleanup.
 * Diagrams already on screen when it starts keep Paseo's theme until they remount.
 * ponytail: matches the theme expression in Paseo's minified mermaid bridge and replays its render message;
 * if Paseo rewrites either, diagrams silently fall back to Paseo's own theme.
 */
function themeMermaid() {
  type Frame = { postMessage(message: unknown, targetOrigin: string): void };
  const proto = HTMLIFrameElement.prototype;
  const inherited = proto.setAttribute;
  proto.setAttribute = function (this: unknown, name: string, value: string) {
    if (mermaidTheme && name.toLowerCase() === "srcdoc" && typeof value === "string") value = value.replace(MERMAID_THEME, () => mermaidTheme);
    inherited.call(this, name, value);
  };
  // A reloaded frame waits for a render request that only Paseo sends, so replay the last one it answered.
  const rendered = new WeakMap<object, unknown>();
  const reloading = new WeakSet<object>();
  const onMessage: MessageListener = ({ source, data }) => {
    const d = data as { type?: unknown; revision?: unknown; source?: unknown; colorScheme?: unknown } | null;
    if (!source || typeof source !== "object" || !d) return;
    if (d.type === "rendered") {
      rendered.set(source, { type: "render", revision: d.revision, source: d.source, colorScheme: d.colorScheme, interactive: false });
      // The colors may have changed while this frame was still loading.
      refresh(source);
    } else if (d.type === "bridgeReady" && reloading.delete(source)) (source as Frame).postMessage(rendered.get(source), "*");
  };
  window.addEventListener("message", onMessage);
  const refresh = (only?: object) => {
    for (const frame of Array.from(document.querySelectorAll(MERMAID_FRAME))) {
      const win = (frame as unknown as { contentWindow: object | null }).contentWindow;
      if (!win || (only && win !== only) || !rendered.has(win)) continue;
      const srcdoc = frame.getAttribute("srcdoc");
      if (!srcdoc || srcdoc.includes(mermaidTheme)) continue;
      reloading.add(win);
      frame.setAttribute("srcdoc", srcdoc);
    }
  };
  rethemeMermaid = () => refresh();
  return () => {
    delete (proto as { setAttribute?: unknown }).setAttribute;
    window.removeEventListener("message", onMessage);
    rethemeMermaid = undefined;
  };
}

// [child, parent it marks, part]
const PARTS: Array<[string, (el: DomElement) => DomElement | null | undefined, string]> = [
  ['[data-testid="assistant-fork-menu-trigger"]', (el) => el.parentElement, "fork"],
  ['[data-testid="assistant-fork-menu-trigger"]', (el) => el.parentElement?.parentElement, "footer"],
  // The box that spaces the turn footer (or the working line) from what's above it.
  ['[data-testid="assistant-fork-menu-trigger"]', (el) => el.parentElement?.parentElement?.parentElement?.parentElement, "footer-gap"],
  // The plan card shows the same question; it has its own styles.
  ['[data-testid="permission-request-question"]', (el) => (el.parentElement?.parentElement?.getAttribute("data-testid") === "permission-plan-card" ? null : el.parentElement), "permission"],
  ['[data-paseo-markdown-tag="img"]', (el) => el.parentElement, "image-text"],
  [CHIP, (el) => el, "chip"],
  // A queued message: the card around its text and its edit / send-now buttons.
  ['button[aria-label="Edit queued message"]', (el) => el.parentElement?.parentElement, "queued"],
  // The composer's box: the textarea's nearest ancestor whose last child is the toolbar. Its depth differs by version (0.12 added
  // wrappers above and below it), and the attach button is missing in terminal mode, so neither works as a fixed anchor.
  ['[data-testid="message-input-root"] textarea', (el) => {
    for (let child = el, box = el.parentElement; box && box.getAttribute("data-testid") !== "message-input-root"; child = box, box = box.parentElement) {
      if (box.lastElementChild !== child && box.lastElementChild?.querySelector("button")) return box;
    }
  }, "composer"],
  // The row holding the textarea and, while it's empty and unfocused, the "⌘L to focus" hint.
  ['[data-testid="message-input-root"] textarea', (el) => el.parentElement?.parentElement, "input-row"],
  [PRIMARY, (el) => el, "primary"],
  [SECONDARY, (el) => el, "secondary"],
  [`${PLAN} > button:first-child`, (el) => el, "plan-head"],
  ['[data-testid="chat-outline-preview"]', (el) => el, "outline-preview"],
  ['[data-testid="context-window-details"]', (el) => el, "context"],
  ['[data-testid="workspace-hover-card"]', (el) => el, "ws-card"],
  // The timeline item around each reply block, which holds Paseo's gap between blocks.
  ['[data-testid="assistant-message"]', (el) => el.parentElement, "msg-item"],
  // Paseo's dropdown menus share no marker; the nearest testID above an item is the menu's surface.
  ['[role="menuitem"]', (el) => el.closest('[role="menu"]') ?? el.parentElement?.closest("[data-testid]"), "menu"],
  ['[data-testid="turn-working-indicator"] > div > div:first-child > div > div', (el) => el, "loader"],
  // The vertical scroller of a tool call's details; its depth varies by tool.
  ['[data-testid="tool-call-badge"] > div:nth-child(2) [style*="max-height"]', (el) => el, "detail-scroll"],
  // Parts otherwise picked by position mid-selector (X > div:nth-child(2) > div), which makes the browser restyle whole sibling rows
  // whenever Paseo's virtual list inserts one. Later entries build on tags set by earlier ones.
  [`${ROW} > button > div > div:nth-child(2)`, (el) => el, "row-label"],
  ['[data-testid="tool-call-group"] > div:nth-child(2)', (el) => el, "group-body"],
  ['[data-testid="tool-call-badge"] > div:nth-child(2)', (el) => el, "badge-body"],
  [`${PERMISSION} > div:nth-child(2)`, (el) => el, "permission-body"],
  ['[data-cp-part="input-row"] > div + div', (el) => el, "input-extra"],
  [`${USAGE} > div:first-child > div:nth-child(3)`, (el) => el, "usage-plan"],
  [`${USAGE} > div:nth-child(2)`, (el) => el, "usage-limits"],
  ['[data-cp-part="usage-limits"] > div > div:nth-child(2)', (el) => el, "limit-body"],
  ['[data-testid^="model-row-"] > div > div:nth-child(2)', (el) => el, "model-text"],
];

/** Tags the parts above, for selectors that would otherwise need :has() or a slow "X *". */
const SETTINGS_PANE = '[data-testid="settings-detail-pane"]';
const CLEAR = "rgba(0, 0, 0, 0)";

/** Browser-only card shapes and hover transitions; native clients keep their fallback styles. */
export function stylePluginViews() {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  const style = document.createElement("style");
  style.textContent = `
@supports (corner-shape: squircle) { [data-cp-squircle="card"] { border-radius: 28px !important; corner-shape: squircle; } }
[data-cp-row], ${ROW} > button { transition: opacity 80ms ease-out, background-color 80ms ease-out; }
[data-cp-row] [dir], ${ROW} [data-cp-part="row-label"] > [dir] { transition: color 80ms ease-out; }
/* One scroller for both axes keeps the horizontal bar visible with tall diffs. */
[data-cp-nowrap] { overflow: auto !important; }
[data-cp-nowrap] > div { width: max-content; min-width: 100%; }
[data-cp-nowrap] [data-pmono] { white-space: pre !important; overflow-wrap: normal !important; }
/* A shared light sweep preserves the action/target colors and works when row icons are hidden. */
[data-cp-running-label] {
  --cp-running-mask: linear-gradient(100deg, rgb(0 0 0 / 0.82) 35%, #000 50%, rgb(0 0 0 / 0.82) 65%);
  -webkit-mask-image: var(--cp-running-mask); mask-image: var(--cp-running-mask);
  -webkit-mask-size: 250% 100%; mask-size: 250% 100%;
  animation: cp-running-label 1.8s linear infinite;
}
@keyframes cp-running-label {
  from { -webkit-mask-position: 150% 0; mask-position: 150% 0; }
  to { -webkit-mask-position: -50% 0; mask-position: -50% 0; }
}
/* Animate the grid track instead of guessing a max-height; long and streaming output keep their natural size. */
[data-cp-expand] { display: grid !important; grid-template-rows: 1fr; opacity: 1; transition: grid-template-rows 100ms cubic-bezier(0.23, 1, 0.32, 1), opacity 100ms ease-out; }
[data-cp-expand="closed"] { grid-template-rows: 0fr; opacity: 0; pointer-events: none; }
@starting-style {
  [data-cp-expand="open"] { grid-template-rows: 0fr; opacity: 0.55; }
}
@media (prefers-reduced-motion: reduce) {
  [data-cp-running-label] { animation: none; -webkit-mask-image: none; mask-image: none; }
  [data-cp-expand] { transition: none; }
  [data-cp-row], [data-cp-row] [dir], ${ROW} > button, ${ROW} [data-cp-part="row-label"] > [dir] { transition: none; }
}`;
  document.head.appendChild(style);
  return () => { stopExpansionFollow?.(); style.remove(); };
}

/**
 * Settings pages draw their cards, select triggers and text fields from generated styles, without testIDs. Tag each by what it draws,
 * once, and only inside the Settings pane (a small tree, so reading styles there is cheap): data-cp-set="card" | "control" | "field" | "area".
 * The settings rules in NATIVE_CSS then put them on the chat's radius scale (design: "Settings — Radius & Inputs").
 */
function tagSettings(roots: DomElement[]) {
  const scopes = new Set<DomElement>();
  for (const root of roots) {
    if (root.closest(SETTINGS_PANE)) scopes.add(root);
    else for (const pane of within([root], SETTINGS_PANE)) scopes.add(pane);
  }
  for (const scope of scopes)
    for (const el of [scope, ...Array.from(scope.querySelectorAll("*"))]) {
      if (el.hasAttribute("data-cp-set")) continue;
      if (el.matches("input, textarea")) {
        // The field is the nearest box that draws something: the input itself, or the wrapper around it and its icon.
        let box: DomElement | null = el;
        while (box && !box.matches(SETTINGS_PANE)) {
          const s = getComputedStyle(box);
          if (parseFloat(s.borderTopWidth) > 0 || s.backgroundColor !== CLEAR) break;
          box = box.parentElement;
        }
        if (box && !box.matches(SETTINGS_PANE)) box.setAttribute("data-cp-set", el.matches("textarea") ? "area" : "field");
        el.setAttribute("data-cp-set-input", "");
        continue;
      }
      const s = getComputedStyle(el);
      const radius = parseFloat(s.borderRadius);
      const border = parseFloat(s.borderTopWidth) > 0;
      // Pills (switches, badges) are full by design; boxes that draw nothing aren't shapes.
      if (!radius || radius >= 999 || (!border && s.backgroundColor === CLEAR)) continue;
      const height = el.getBoundingClientRect().height;
      if (el.tagName === "BUTTON" || el.getAttribute("role") === "button") {
        if (radius >= 10 && height >= 24 && height <= 48) el.setAttribute("data-cp-set", "control");
      } else if (el.getAttribute("role") === "alert" || (border && radius >= 8 && height >= 44)) el.setAttribute("data-cp-set", "card");
    }

  // Portaled popovers may omit menu/listbox roles. Inspect changed subtrees and their ancestors, not the whole app.
  if (document.querySelector(SETTINGS_PANE))
    for (const el of new Set(roots.flatMap((root) => {
      const ancestors: DomElement[] = [];
      for (let parent = root.parentElement; parent && parent !== document.body; parent = parent.parentElement) ancestors.push(parent);
      return [root, ...Array.from(root.querySelectorAll("*")), ...ancestors];
    }))) {
      if (el.hasAttribute("data-cp-setting-menu") || (el.hasAttribute("data-cp-part") && !el.matches(SURFACE)) || el.tagName === "BUTTON" || el.getAttribute("role") === "button") continue;
      const style = getComputedStyle(el);
      if (style.position !== "absolute" && style.position !== "fixed") continue;
      if (parseFloat(style.borderTopWidth) < 1 || parseFloat(style.borderRadius) < 8 || style.backgroundColor === CLEAR) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 100 || rect.height < 24) continue;
      if (el.querySelectorAll("button, [role=button], [role=option], [role=menuitem]").length < 1 && el.querySelectorAll("*").length < 4) continue;
      if (!el.hasAttribute("data-cp-part")) el.setAttribute("data-cp-part", "menu");
      el.setAttribute("data-cp-setting-menu", "");
    }
}

function tagParts(roots: DomElement[]) {
  tagSettings(roots);
  for (const [child, parentOf, part] of PARTS) for (const el of within(roots, child)) parentOf(el)?.setAttribute("data-cp-part", part);
  for (const body of within(roots, '[data-testid="permission-plan-card"] > div:nth-child(2)')) body.setAttribute("data-cp-plan-md", "");
  // The turn footer sits close under a reply block. Decided once per pair, not with a sibling combinator: the virtual list mounts and
  // drops rows in either order, and a gap that flips with it makes Paseo re-measure the list.
  const tight = (gap: DomElement | null | undefined) => gap?.getAttribute("data-cp-part") === "footer-gap" && gap.previousElementSibling?.getAttribute("data-cp-part") === "msg-item" && gap.setAttribute("data-cp-tight", "");
  for (const gap of within(roots, '[data-cp-part="footer-gap"]')) tight(gap);
  for (const item of within(roots, '[data-cp-part="msg-item"]')) tight(item.nextElementSibling);
  // A prompt's bubble holds its attachment rows (thumbnails, then labelled pills) above the text, which Paseo marks data-message-text.
  for (const message of within(roots, '[data-testid="user-message"]')) {
    const bubble = message.firstElementChild?.firstElementChild;
    const rows = Array.from(bubble?.children ?? []).filter((row) => !row.hasAttribute("data-message-text"));
    if (!bubble || !rows.length) continue;
    bubble.setAttribute("data-cp-attach", "");
    for (const row of rows) {
      // Thumbnails open the lightbox, so their frames are buttons (their image may still be loading); labelled pills are plain views.
      const images = !!row.querySelector('[role="button"]');
      row.setAttribute("data-cp-part", images ? "att-images" : "att-files");
      if (!images) for (const pill of Array.from(row.children)) {
        const icon = pill.firstElementChild?.firstElementChild;
        if (icon?.querySelector("svg") && icon.nextElementSibling) icon.setAttribute("data-cp-part", "att-icon");
      }
    }
  }
  // The working indicator's box gets an overlay the other loaders draw in; CSS shows it only when one is chosen.
  for (const box of within(roots, WORKING_BOX)) {
    if (box.querySelector(":scope > [data-cp-loader]")) continue;
    const overlay = document.createElement("span");
    overlay.setAttribute("data-cp-loader", "");
    overlay.innerHTML = "<i></i>".repeat(9);
    box.insertAdjacentElement("beforeend", overlay);
  }
  for (const svg of within(roots, `${ROW_ICON} svg`)) {
    const slot = svg.closest(ROW_ICON);
    if (!slot) continue;
    if (svg.querySelector('path[d="m9 18 6-6-6-6"]')) slot.setAttribute("data-cp-chev", "");
    else {
      slot.removeAttribute("data-cp-chev");
      // Some of Paseo's icons (its own logo) omit xmlns, without which an SVG image doesn't render.
      const markup = svg.outerHTML.replace(/^<svg(?![^>]*\sxmlns=)/, '<svg xmlns="http://www.w3.org/2000/svg"');
      slot.style.setProperty("--cp-row-icon", `url("data:image/svg+xml,${encodeURIComponent(markup)}")`);
    }
  }
  // The context card's percent is plain text ("35% used"); the redesign draws it large, with a bar.
  // Also when only its text re-renders, so the card is an ancestor of the root.
  for (const card of new Set([...within(roots, CTX), ...roots.map((root) => root.closest(CTX))])) {
    if (!card) continue;
    const head = card.firstElementChild;
    const used = head?.children[1];
    const pct = /^(\d+(?:\.\d+)?)% /.exec(used?.textContent ?? "")?.[1];
    if (!head || !used || !pct) continue;
    used.setAttribute("data-cp-pct", pct);
    head.style.setProperty("--cp-pct", `${pct}%`);
    head.setAttribute("data-cp-level", Number(pct) >= 80 ? "high" : "normal");
    if (compactHandler) markCompact(card, Number(pct));
    keepCardHeight(card);
  }
}

// Paseo loads the card's account section (usage-report-*) after it opens, so the card grows by ~170px and jumps up a
// frame later. Remember its full height per agent and open at that height next time.
// The min-height is only a loading placeholder: once usage arrives the card sizes naturally, including when it shrinks.
const HEIGHTS_KEY = "chat-polish:context-card-heights";
let cardHeights: Map<string, number> | undefined;
function keepCardHeight(card: DomElement) {
  // Only reached from tagParts, which runs on web; read lazily so importing this module never touches localStorage.
  cardHeights ??= new Map(Object.entries(JSON.parse(localStorage.getItem(HEIGHTS_KEY) ?? "{}") as Record<string, number>));
  const id = activeAgentId() ?? "";
  if (card.querySelector('[data-testid^="usage-report-"]')) {
    if (card.style.getPropertyValue("min-height")) card.style.removeProperty("min-height");
    const height = Math.round(card.getBoundingClientRect().height);
    if (height > 0 && height !== cardHeights.get(id)) {
      cardHeights.delete(id);
      cardHeights.set(id, height);
      if (cardHeights.size > 50) cardHeights.delete(cardHeights.keys().next().value!);
      localStorage.setItem(HEIGHTS_KEY, JSON.stringify(Object.fromEntries(cardHeights)));
    }
    return;
  }
  const height = cardHeights.get(id);
  if (height && card.style.getPropertyValue("min-height") !== `${height}px`) card.style.setProperty("min-height", `${height}px`);
}

// ---- Compact from the context card ----

let compactHandler: ((agentId: string) => Promise<void>) | undefined;

/** Lets the context card's Compact button send /compact to the chat on screen. */
export function setCompactHandler(handler: (agentId: string) => Promise<void>) {
  compactHandler = handler;
  return () => void (compactHandler = undefined);
}

const visible = (el: DomElement) => el.getBoundingClientRect().width > 0;

/** The agent of the selected tab on screen. ponytail: with split panes this takes the first one; the meter's own pane would need Paseo to name its agent. */
/** Agents with a tab in the window: the timelines merged steps follow. */
export function openAgentIds(): string[] {
  if (Platform.OS !== "web") return [];
  return Array.from(document.querySelectorAll('[data-testid^="workspace-tab-agent_"]')).map((tab) => tab.getAttribute("data-testid")!.slice("workspace-tab-agent_".length));
}

function activeAgentId() {
  if (Platform.OS !== "web") return undefined;
  const tab = Array.from(document.querySelectorAll('[data-testid^="workspace-tab-agent_"][aria-selected="true"]')).find(visible);
  return tab?.getAttribute("data-testid")?.slice("workspace-tab-agent_".length);
}

const FOLD_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-6"/><path d="M12 8V2"/><path d="M4 12H2"/><path d="M10 12H8"/><path d="M16 12h-2"/><path d="M22 12h-2"/><path d="m15 19-3-3-3 3"/><path d="m15 5-3 3-3-3"/></svg>';

/** A menu-style "Compact conversation" row under the percent bar; hidden while the agent is working, since /compact would wait behind the turn. */
function markCompact(card: DomElement, pct: number) {
  let row = card.querySelector("[data-cp-compact]");
  if (!row) {
    row = document.createElement("div");
    row.setAttribute("data-cp-compact", "");
    row.innerHTML = `<button type="button">${FOLD_ICON}<span>Compact conversation</span><span></span></button>`;
    const button = row.firstElementChild!;
    const label = button.children[1]!;
    button.addEventListener("click", () => {
      const id = activeAgentId();
      if (!id || !compactHandler || button.hasAttribute("disabled")) return;
      button.setAttribute("disabled", "");
      label.textContent = "Compacting…";
      compactHandler(id).catch((error: unknown) => {
        console.warn("[chat-polish] /compact failed", error);
        button.removeAttribute("disabled");
        label.textContent = "Try again";
      });
    });
    // Right under the usage figures and above Paseo's divider; the account section loads later and goes below.
    card.firstElementChild?.insertAdjacentElement("afterend", row);
  }
  const low = pct >= 60;
  row.setAttribute("data-cp-level", low ? "high" : "normal");
  // Only write text that changed: every write is a DOM mutation that runs this pass again.
  const hint = row.firstElementChild!.lastElementChild!;
  const text = low ? "running low" : "summarize so far";
  if (hint.textContent !== text) hint.textContent = text;
  const working = Array.from(document.querySelectorAll('button[aria-label="Stop agent"]')).some(visible);
  row.style.setProperty("display", working ? "none" : "flex");
}

// ---- Rich text variants ----

const CALLOUT_MARK = /^\[!(note|tip|important|warning|caution)\]$/i;
const CALLOUT_KIND: Record<string, [string, string]> = { note: ["note", "Note"], important: ["note", "Important"], tip: ["tip", "Tip"], warning: ["warning", "Warning"], caution: ["warning", "Caution"] };
const TASK_MARK = /^\[([ xX])\]\s+/;

/**
 * Marks what markdown leaves as plain text: "> [!NOTE]" quotes become callouts, "[x] item" bullets become tasks,
 * ordered list marks keep their number, and code blocks get their line numbers. Runs on added nodes and again once streaming settles.
 */
function markBlocks(roots: DomElement[]) {
  const find = (selector: string) => roots.flatMap((root) => (root === document.documentElement ? Array.from(root.querySelectorAll(selector)) : [root.closest(selector) ?? null, ...within([root], selector)].filter((el): el is DomElement => !!el)));
  for (const quote of find(`${MSG} ${md("blockquote")}:not([data-cp-callout])`)) {
    const mark = quote.querySelector("span");
    const kind = CALLOUT_KIND[CALLOUT_MARK.exec(mark?.textContent?.trim() ?? "")?.[1]?.toLowerCase() ?? ""];
    if (!mark || !kind) continue;
    quote.setAttribute("data-cp-callout", kind[0]);
    mark.setAttribute("data-cp-callout-mark", kind[1]);
  }
  // Paseo 0.12 draws callouts itself (an icon and the kind's name over the text); its kind is only in that name.
  for (const box of find(`${ADMONITION}:not([data-cp-callout])`)) {
    const head = box.firstElementChild;
    const kind = CALLOUT_KIND[head?.textContent?.trim().toLowerCase() ?? ""];
    if (!head || !kind) continue;
    box.setAttribute("data-cp-callout", kind[0]);
    head.setAttribute("data-cp-callout-head", "");
  }
  for (const li of find(`${MSG} ${md("li")}`)) {
    // Paseo may rewrite the text node as the reply streams, so the "[x] " prefix is checked every time.
    const text = li.querySelector(":scope > div:last-child span")?.firstChild;
    const box = TASK_MARK.exec(text?.nodeValue ?? "");
    if (!text || !box) continue;
    li.setAttribute("data-cp-task", box[1] === " " ? "todo" : "done");
    text.nodeValue = text.nodeValue!.slice(box[0].length);
  }
  // Kept for list styles that redraw the number ("1)").
  for (const mark of find(`${MSG} ${MARK_OL}`)) {
    const n = mark.textContent?.trim().replace(".", "") ?? "";
    if (mark.getAttribute("data-cp-n") !== n) mark.setAttribute("data-cp-n", n);
  }
  for (const code of find(`${CODE_BLOCK} > div:first-child`)) {
    const count = (code.textContent ?? "").replace(/\n$/, "").split("\n").length;
    if (code.getAttribute("data-cp-lines")?.split("\n").length !== count) code.setAttribute("data-cp-lines", Array.from({ length: count }, (_, i) => i + 1).join("\n"));
  }
}

/** Shows the chosen variant of each markdown element, and the image size; "a" needs no attribute. */
export function setRichText(choices: Record<string, string>) {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  for (const [element, variant] of Object.entries(choices)) {
    if (variant === "a") document.documentElement.removeAttribute(`data-cp-rt-${element}`);
    else document.documentElement.setAttribute(`data-cp-rt-${element}`, variant);
  }
}

const INFO_MASK = mask('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>');
const ALERT_MASK = mask('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>');
const TIP_MASK = mask('<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>');
const CHECK_MASK = mask('<path d="M20 6 9 17l-5-5"/>');

const RT = (element: string, variant: string) => `:root[data-cp-rt-${element}="${variant}"] ${MSG}`;
const QUOTE = `${md("blockquote")}:not([data-cp-callout])`;
const CALLOUT = `${md("blockquote")}[data-cp-callout]`;
const TASK_ITEM = `${MSG} ${md("li")}[data-cp-task]`;
const TASK = `:root ${TASK_ITEM}`;

const RICH_TEXT_CSS = `
${RT("quote", "b")} ${QUOTE} { border-left-width: 0 !important; border-radius: 8px !important; background: var(--cp-raised) !important; padding: 10px 14px 10px 36px !important; position: relative !important; }
${RT("quote", "b")} ${QUOTE}::before { content: "\\201C"; position: absolute; left: 13px; top: 6px; font-size: 24px; line-height: 1; font-weight: 600; color: var(--cp-accent); }
${RT("quote", "b")} ${QUOTE} span { font-style: normal !important; color: var(--cp-fg) !important; }
${RT("quote", "c")} ${QUOTE} { border-left-width: 0 !important; padding: 0 0 0 20px !important; }

${RT("table", "b")} ${md("table")} { border-width: 0 !important; border-radius: 6px !important; }
${RT("table", "b")} ${md("table")} > div:first-child { background: transparent !important; }
${RT("table", "b")} ${md("table")} > div > div { border-bottom-width: 0 !important; border-radius: 6px !important; }
${RT("table", "b")} ${md("table")} > div:last-child > div:nth-child(odd) { background: var(--cp-raised) !important; }
${RT("table", "c")} ${md("table")} { border-width: 0 !important; border-radius: 0 !important; }
${RT("table", "c")} ${md("table")} > div:first-child { background: transparent !important; }
${RT("table", "c")} ${md("table")} > div:last-child > div { border-bottom-width: 0 !important; }
${RT("table", "c")} ${md("table")} > div > div > div { padding: 7px 12px 7px 0 !important; }
${RT("table", "d")} ${md("table")} > div > div > div:not(:last-child) { border-right: 1px solid var(--cp-rule) !important; }

${RT("code", "b")} ${md("pre")} { border-width: 0 !important; }
${RT("code", "b")} button[aria-label="Copy code"] { opacity: 0.35; transition: opacity 120ms; }
${RT("code", "b")} ${md("pre")}:hover button[aria-label="Copy code"] { opacity: 1; }
${RT("code", "b")} ${md("pre")}${LANG}::before { content: attr(data-paseo-markdown-language); position: absolute; top: 11px; right: 38px; font-family: var(--cp-mono); font-size: 11px; line-height: 16px; color: var(--cp-muted); opacity: 0.6; transition: opacity 120ms; }
${RT("code", "b")} ${md("pre")}${LANG}:hover::before { opacity: 1; }
${RT("code", "c")} ${md("pre")} { background: transparent !important; }
${RT("code", "c")} ${md("pre")} > div:first-child { position: relative !important; padding-left: 32px !important; }
${RT("code", "c")} ${md("pre")} > div:first-child::before { content: attr(data-cp-lines); position: absolute; left: 0; top: 0; width: 18px; text-align: right; white-space: pre; font-family: var(--cp-mono); font-size: var(--cp-code); line-height: 1.5; color: var(--cp-muted); opacity: 0.6; }

${RT("inline", "b")} ${INLINE_CODE} { background: transparent !important; padding: 0 1px !important; color: var(--cp-warn) !important; }
${RT("inline", "c")} ${INLINE_CODE} { background: transparent !important; box-shadow: inset 0 0 0 1px var(--cp-rule) !important; }

${RT("heading", "b")} ${HEADING(1)} { font-size: 18px !important; display: inline-block !important; width: 100% !important; padding-bottom: 6px !important; border-bottom: 1px solid var(--cp-rule) !important; }
${RT("heading", "b")} ${HEADING(2)} { font-size: 15px !important; }
${RT("heading", "b")} ${HEADING(3)} { font-size: 12px !important; text-transform: uppercase !important; letter-spacing: 0.06em !important; color: var(--cp-muted) !important; }
${RT("heading", "c")} ${HEADING(1)}, ${RT("heading", "c")} ${HEADING(2)} { border-left: 3px solid var(--cp-accent) !important; padding-left: 10px !important; }
${RT("heading", "c")} ${HEADING(3)}::before { content: "### "; font-family: var(--cp-mono); font-size: var(--cp-code); font-weight: 400; color: var(--cp-muted); }

${RT("list", "b")} ${MARK} { font-size: 0 !important; }
${RT("list", "b")} ${MARK_UL}::before { content: "\\2013"; font-size: var(--cp-content); color: var(--cp-muted); }
${RT("list", "b")} ${MARK_OL}::before { content: attr(data-cp-n) ")"; font-family: var(--cp-mono); font-size: calc(var(--cp-code) + 1px); color: var(--cp-muted); }
${RT("list", "c")} ${MARK} { font-size: 0 !important; }
${RT("list", "c")} ${MARK}::before { content: "\\00B7"; font-size: var(--cp-content); font-weight: 700; color: var(--cp-muted); }
${RT("list", "c")} ${md("li")} { margin-bottom: 2px !important; }

${TASK} > ${MARK} { position: relative !important; font-size: 0 !important; width: 14px !important; }
${TASK} > ${MARK}::before { content: ""; position: absolute; left: 0; top: calc(var(--cp-content) * 0.8 - 7px); width: 14px; height: 14px; box-sizing: border-box; border: 1.5px solid var(--cp-muted); border-radius: 3px; }
${TASK}[data-cp-task="done"] > ${MARK}::before { background: var(--cp-accent); border-color: var(--cp-accent); }
${TASK}[data-cp-task="done"] > ${MARK}::after { content: ""; position: absolute; left: 2px; top: calc(var(--cp-content) * 0.8 - 5px); width: 10px; height: 10px; background: var(--cp-accent-fg); -webkit-mask: ${CHECK_MASK} center / contain no-repeat; mask: ${CHECK_MASK} center / contain no-repeat; }
:root[data-cp-rt-list="b"] ${TASK_ITEM} > ${MARK}::before { border-radius: 999px; }
:root[data-cp-rt-list="b"] ${TASK_ITEM}[data-cp-task="done"] > ${MARK}::before { background: transparent; border-color: var(--cp-ok); }
:root[data-cp-rt-list="b"] ${TASK_ITEM}[data-cp-task="done"] > ${MARK}::after { background: var(--cp-ok); }
:root[data-cp-rt-list="c"] ${TASK_ITEM} { min-height: 26px !important; align-items: center !important; }
:root[data-cp-rt-list="c"] ${TASK_ITEM}[data-cp-task="done"] span { color: var(--cp-muted) !important; }

${MSG} ${CALLOUT} { --cp-tone: var(--cp-accent); --cp-icon: ${INFO_MASK}; position: relative !important; border-left-width: 0 !important; border-radius: 8px !important; padding: 10px 14px 10px 36px !important; margin: 6px 0 !important; background: color-mix(in srgb, var(--cp-tone) 12%, transparent) !important; }
${MSG} ${CALLOUT}[data-cp-callout="warning"] { --cp-tone: var(--cp-warn); --cp-icon: ${ALERT_MASK}; }
${MSG} ${CALLOUT}[data-cp-callout="tip"] { --cp-tone: var(--cp-ok); --cp-icon: ${TIP_MASK}; }
${MSG} ${CALLOUT}::before { content: ""; position: absolute; left: 13px; top: 13px; width: 14px; height: 14px; background: var(--cp-tone); -webkit-mask: var(--cp-icon) center / contain no-repeat; mask: var(--cp-icon) center / contain no-repeat; }
${MSG} ${CALLOUT} span { font-style: normal !important; color: var(--cp-fg) !important; }
${MSG} ${CALLOUT} [data-cp-callout-mark] { font-size: 0 !important; }
${MSG} ${CALLOUT} [data-cp-callout-mark]::after { content: attr(data-cp-callout-mark); font-size: 13px; font-weight: 600; color: var(--cp-tone); }
${RT("callout", "b")} ${CALLOUT} { background: transparent !important; border-radius: 0 !important; border-left: 2px solid var(--cp-tone) !important; padding: 2px 0 2px 14px !important; }
${RT("callout", "b")} ${CALLOUT}::before { display: none; }
${RT("callout", "b")} ${CALLOUT} [data-cp-callout-mark]::after { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
${RT("callout", "c")} ${CALLOUT} { background: transparent !important; border-radius: 0 !important; padding: 0 0 0 24px !important; }
${RT("callout", "c")} ${CALLOUT}::before { left: 0; top: calc(var(--cp-content) * 0.8 - 7px); }
${RT("callout", "c")} ${CALLOUT} [data-cp-callout-mark] + span { display: none !important; }
${RT("callout", "c")} ${CALLOUT} [data-cp-callout-mark]::after { content: attr(data-cp-callout-mark) " \\2014  "; }

${MSG} ${md("hr")} { margin: 8px 0 !important; background: var(--cp-rule) !important; }
${RT("rule", "b")} ${md("hr")} { height: auto !important; background: transparent !important; text-align: center; }
${RT("rule", "b")} ${md("hr")}::before { content: "\\2022  \\2022  \\2022"; font-size: 12px; letter-spacing: 0.2em; color: var(--cp-muted); }
${RT("rule", "c")} ${md("hr")} { width: 48px !important; background: var(--cp-border, var(--cp-rule)) !important; }

/* The variants on Paseo 0.12's renderer (see MD). Callouts and task boxes are Paseo's own there; markBlocks tags a callout's kind. */
${RT("quote", "b")} .enrm-text blockquote { border-inline-start-width: 0 !important; border-radius: 8px !important; background: var(--cp-raised) !important; padding: 10px 14px 10px 36px !important; position: relative !important; }
${RT("quote", "b")} .enrm-text blockquote::before { content: "\\201C"; position: absolute; left: 13px; top: 6px; font-size: 24px; line-height: 1; font-weight: 600; color: var(--cp-accent); }
${RT("quote", "b")} .enrm-text blockquote p { font-style: normal !important; color: var(--cp-fg) !important; }
${RT("quote", "c")} .enrm-text blockquote { border-inline-start-width: 0 !important; padding: 0 0 0 20px !important; }

${RT("table", "b")} .enrm-text table { border-width: 0 !important; border-radius: 6px !important; }
${RT("table", "b")} .enrm-text th { background: transparent !important; }
${RT("table", "b")} .enrm-text :is(th, td) { border-bottom-width: 0 !important; }
${RT("table", "b")} .enrm-text tbody > tr:nth-child(odd) > td { background: var(--cp-raised) !important; }
${RT("table", "b")} .enrm-text td:first-child { border-radius: 6px 0 0 6px !important; }
${RT("table", "b")} .enrm-text td:last-child { border-radius: 0 6px 6px 0 !important; }
${RT("table", "c")} .enrm-text table { border-width: 0 !important; border-radius: 0 !important; }
${RT("table", "c")} .enrm-text th { background: transparent !important; }
${RT("table", "c")} .enrm-text td { border-bottom-width: 0 !important; }
${RT("table", "c")} .enrm-text :is(th, td) { padding: 7px 12px 7px 0 !important; }
${RT("table", "d")} .enrm-text :is(th, td):not(:last-child) { border-right: 1px solid var(--cp-rule) !important; }

${RT("inline", "b")} .enrm-text code { background: transparent !important; padding: 0 1px !important; color: var(--cp-warn) !important; }
${RT("inline", "c")} .enrm-text code { background: transparent !important; box-shadow: inset 0 0 0 1px var(--cp-rule) !important; }

${RT("heading", "b")} .enrm-text h1 { font-size: 18px !important; padding-bottom: 6px !important; border-bottom: 1px solid var(--cp-rule) !important; }
${RT("heading", "b")} .enrm-text h2 { font-size: 15px !important; }
${RT("heading", "b")} .enrm-text h3 { font-size: 12px !important; text-transform: uppercase !important; letter-spacing: 0.06em !important; color: var(--cp-muted) !important; }
${RT("heading", "c")} .enrm-text :is(h1, h2) { border-left: 3px solid var(--cp-accent) !important; padding-left: 10px !important; }
${RT("heading", "c")} .enrm-text h3::before { content: "### "; font-family: var(--cp-mono); font-size: var(--cp-code); font-weight: 400; color: var(--cp-muted); }

${RT("list", "b")} .enrm-text ul > li::marker { content: "\\2013  "; color: var(--cp-muted); }
${RT("list", "b")} .enrm-text ol > li::marker { content: counter(list-item) ") "; color: var(--cp-muted); }
${RT("list", "c")} .enrm-text li::marker { content: "\\00B7  "; font-weight: 700; color: var(--cp-muted); }
${RT("list", "c")} .enrm-text li:not(:last-child) { margin-bottom: 2px !important; }

${TASK_BOX} { appearance: none !important; position: relative !important; flex: none; box-sizing: border-box !important; border: 1.5px solid var(--cp-muted) !important; border-radius: 3px !important; margin: 0 10px 0 0 !important; vertical-align: -2px !important; }
${TASK_BOX}:checked { background: var(--cp-accent) !important; border-color: var(--cp-accent) !important; }
${TASK_BOX}:checked::after { content: ""; position: absolute; inset: 1px; background: var(--cp-accent-fg); -webkit-mask: ${CHECK_MASK} center / contain no-repeat; mask: ${CHECK_MASK} center / contain no-repeat; }
:root[data-cp-rt-list="b"] ${TASK_BOX} { border-radius: 999px !important; }
:root[data-cp-rt-list="b"] ${TASK_BOX}:checked { background: transparent !important; border-color: var(--cp-ok) !important; }
:root[data-cp-rt-list="b"] ${TASK_BOX}:checked::after { background: var(--cp-ok); }

${ADMONITION} { --cp-tone: var(--cp-accent); position: relative !important; border-inline-start-width: 0 !important; border-radius: 8px !important; padding: 10px 14px 10px 36px !important; background: color-mix(in srgb, var(--cp-tone) 12%, transparent) !important; }
${ADMONITION}[data-cp-callout="warning"] { --cp-tone: var(--cp-warn); }
${ADMONITION}[data-cp-callout="tip"] { --cp-tone: var(--cp-ok); }
${ADMONITION} p { color: var(--cp-fg) !important; }
${ADMONITION} [data-cp-callout-head] { margin-bottom: 2px !important; font-size: 13px !important; font-weight: 600 !important; line-height: 1.6 !important; color: var(--cp-tone) !important; }
${ADMONITION} [data-cp-callout-head] svg { position: absolute; left: 13px; top: 13px; width: 14px; height: 14px; fill: var(--cp-tone); }
${RT("callout", "b")} .enrm-admonition { background: transparent !important; border-radius: 0 !important; border-inline-start: 2px solid var(--cp-tone) !important; padding: 2px 0 2px 14px !important; }
${RT("callout", "b")} .enrm-admonition [data-cp-callout-head] { font-size: 11px !important; text-transform: uppercase; letter-spacing: 0.06em; }
${RT("callout", "b")} .enrm-admonition [data-cp-callout-head] svg { display: none; }
${RT("callout", "c")} .enrm-admonition { background: transparent !important; border-radius: 0 !important; padding: 0 0 0 24px !important; }
${RT("callout", "c")} .enrm-admonition [data-cp-callout-head] { display: inline !important; }
${RT("callout", "c")} .enrm-admonition [data-cp-callout-head] svg { left: 0; top: calc(var(--cp-content) * 0.8 - 7px); }
${RT("callout", "c")} .enrm-admonition [data-cp-callout-head]::after { content: " \\2014  "; }
${RT("callout", "c")} .enrm-admonition p { display: inline !important; }

${RT("rule", "b")} .enrm-text hr { border-top-width: 0 !important; height: auto !important; text-align: center; }
${RT("rule", "b")} .enrm-text hr::before { content: "\\2022  \\2022  \\2022"; font-size: 12px; letter-spacing: 0.2em; color: var(--cp-muted); }
${RT("rule", "c")} .enrm-text hr { width: 48px !important; border-top-color: var(--cp-border, var(--cp-rule)) !important; }
`;

/**
 * Restyles what Paseo still draws itself (tool call groups, user bubbles, markdown) to the Chat Polish design
 * while `enabled()`; desktop/web only. Returns cleanup.
 * ponytail: CSS keyed on Paseo's testIDs, its DOM nesting and the data-paseo-markdown-* marks on its markdown;
 * a Paseo layout change can silently stop parts of it applying. Turn it off from the dashboard if it misfires.
 */
type CssRuleLike = { selectorText?: string; cssRules?: ArrayLike<CssRuleLike> };

function guardRules(rules: ArrayLike<CssRuleLike>) {
  for (const rule of Array.from(rules)) {
    if (rule.cssRules) guardRules(rule.cssRules);
    // An invalid rewrite is ignored by the browser, which keeps the original selector.
    if (rule.selectorText && POSITIONAL.test(rule.selectorText)) rule.selectorText = splitTop(rule.selectorText, (ch) => ch === ",").map((c) => guardPositional(c.trim())).join(", ");
  }
}

export function restyleNative(enabled: () => boolean) {
  let style: DomElement | undefined;
  let unthemeMermaid: (() => void) | undefined;
  const off = () => {
    if (!style) return;
    style.remove();
    style = undefined;
    unthemeMermaid?.();
    unthemeMermaid = undefined;
    document.removeEventListener("click", noteClick, true);
    document.removeEventListener("pointerover", notePointer, true);
    dropGhost(false);
    for (const el of Array.from(document.querySelectorAll("[data-cp-rail], [data-cp-tip], [data-cp-hint]"))) el.remove();
  };
  return watchDom({
    added: (roots) => {
      if (!enabled()) return off();
      if (!style) {
        style = document.createElement("style");
        style.textContent = NATIVE_CSS + RICH_TEXT_CSS + MODEL_SELECTOR_CSS;
        document.head.appendChild(style);
        const sheet = (style as unknown as { sheet?: { cssRules: ArrayLike<CssRuleLike> } }).sheet;
        if (sheet) guardRules(sheet.cssRules);
        document.addEventListener("click", noteClick, true);
        document.addEventListener("pointerover", notePointer, true);
        unthemeMermaid = themeMermaid();
      }
      tagParts(roots);
      markBlocks(roots);
      decoratePopovers(roots);
      markLitRows(roots);
      watchHoverCards(roots);
      swapOutlinePreview(roots);
    },
    removed: (nodes) => {
      if (hoverCards.size) syncHoverCards();
      ghostOutlinePreview(nodes);
    },
    settled: (roots) => {
      if (!style) return;
      noteThinkingFallback();
      markBlocks(roots);
    },
  }, off);
}

// ---- Composer model and thinking selectors ----

/** A provider as the model selector's rail shows it, from Paseo's provider snapshot. */
export interface RailProvider {
  id: string;
  label: string;
  status: "ready" | "loading" | "error" | "unavailable";
  iconSvg?: string;
  models: Array<{ label: string; thinking: Array<{ label: string; description?: string; isDefault: boolean }> }>;
}

const POP = '[data-testid="combobox-desktop-container"]';
const MODEL_POP = `${POP}[${TAG}="models"]`;
const THINKING_POP = `${POP}[${TAG}="thinking"]`;
const BACK = '[data-testid="sheet-header-back"]';
const SETTINGS = '[data-testid^="selector-header-settings-"]';
const MODEL_ROW = '[data-testid^="model-row-"]';
const HEADER = `${MODEL_POP} [data-cp-part="header"]`;

const MODEL_SELECTOR_CSS = `
${MODEL_POP} { width: 440px !important; min-width: 440px !important; max-width: 440px !important; display: grid !important; grid-template-columns: 172px minmax(0, 1fr); grid-template-rows: auto auto minmax(0, 1fr); border-radius: 12px !important; border-color: var(--cp-rule) !important; overflow: hidden !important; }
${MODEL_POP} > div:first-child { display: contents !important; }
${MODEL_POP} [data-cp-part="search"] { grid-column: 1 / -1; grid-row: 1; padding: 4px 12px !important; border-bottom: 1px solid var(--cp-rule) !important; }
${HEADER} { grid-column: 2; grid-row: 2; padding: 10px 12px 6px 14px !important; }
${HEADER} > :is(button, [data-cp-part="icon"]) { display: none !important; }
${HEADER} > [data-cp-part="title"] { font-size: 13px !important; font-weight: 600 !important; color: var(--cp-fg) !important; }
${HEADER} > [data-cp-part="title"]::after { content: attr(data-cp-count); margin-left: 8px; font-size: 12px; font-weight: 400; color: var(--cp-muted); }
${MODEL_POP} > div:nth-child(2) { grid-column: 2; grid-row: 3; min-height: 0 !important; }
${MODEL_POP} [data-cp-part="providers"] { display: none !important; }
${MODEL_POP} :is([data-cp-part="rows"], [data-testid="model-profiles-empty"]) { margin: 0 6px 2px !important; border-radius: 6px !important; overflow: hidden !important; }
${MODEL_POP} :is(${MODEL_ROW}, [data-testid="model-profiles-empty"]) { min-height: 28px !important; padding: 0 !important; justify-content: center !important; }
${MODEL_POP} :is(${MODEL_ROW}, [data-testid="model-profiles-empty"]) > div { padding: 0 8px !important; gap: 8px !important; }
${MODEL_POP} ${MODEL_ROW} > div > div:first-child { display: none !important; }
${MODEL_POP} ${MODEL_ROW} > div > div:nth-child(2) { flex: 1 1 auto !important; min-width: 0 !important; align-items: baseline !important; }
${MODEL_POP} [data-cp-part="model-text"] > div:last-child { min-width: 0 !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
${MODEL_POP} ${MODEL_ROW} > div > div:last-child { display: contents !important; }
${MODEL_POP} ${MODEL_ROW} > div > div:last-child > div:first-child { order: -1; width: 14px !important; }
${MODEL_POP} ${MODEL_ROW} svg { stroke: var(--cp-accent) !important; }

[data-cp-rail] { grid-column: 1; grid-row: 2 / 4; display: flex; flex-direction: column; gap: 2px; padding: 6px; overflow-y: auto; background: rgba(0, 0, 0, 0.14); border-right: 1px solid var(--cp-rule); }
[data-cp-rail] button { all: unset; box-sizing: border-box; position: relative; display: flex; align-items: center; gap: 8px; flex-shrink: 0; height: 28px; padding: 0 8px; border-radius: 6px; font-size: 13px; color: var(--cp-fg); cursor: pointer; }
[data-cp-rail] button:hover { background: var(--cp-control); }
[data-cp-rail] button[aria-current="true"] { background: var(--cp-control); font-weight: 500; }
[data-cp-rail] button[aria-current="true"]::before { content: ""; position: absolute; left: -6px; top: 8px; bottom: 8px; width: 2px; border-radius: 999px; background: var(--cp-accent); }
[data-cp-rail] button[aria-disabled="true"] { opacity: 0.45; cursor: default; }
[data-cp-rail] button[aria-disabled="true"]:hover { background: transparent; }
[data-cp-rail] hr { border: 0; height: 1px; margin: 4px 2px; background: var(--cp-rule); flex-shrink: 0; }
[data-cp-rail] [data-cp-icon] { display: flex; align-items: center; justify-content: center; width: 14px; height: 14px; flex-shrink: 0; color: var(--cp-muted); font-size: 11px; font-weight: 600; }
[data-cp-rail] svg { width: 14px; height: 14px; }
[data-cp-rail] [data-cp-label] { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
[data-cp-rail] [data-cp-status="loading"] svg { color: var(--cp-muted); animation: cp-spin 1s linear infinite; }
@media (prefers-reduced-motion: reduce) { [data-cp-rail] [data-cp-status="loading"] svg { animation: none !important; } }
[data-cp-rail] [data-cp-status="error"] svg { color: #e06c75; }
@keyframes cp-spin { to { transform: rotate(360deg); } }
[data-cp-tip] { position: absolute; z-index: 1; display: none; max-width: 220px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--cp-rule); background: var(--cp-sunken); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4); font-size: 12px; line-height: 1.45; color: var(--cp-muted); pointer-events: none; }
[data-cp-tip] b { display: block; margin-bottom: 2px; font-weight: 600; color: var(--cp-fg); }

${THINKING_POP} { border-radius: 12px !important; border-color: var(--cp-rule) !important; }
${THINKING_POP}[data-cp-described] { width: 420px !important; }
${THINKING_POP} button { min-height: 28px !important; margin: 0 4px !important; padding: 0 8px !important; gap: 8px !important; }
${THINKING_POP} button > div:nth-child(2) > :first-child, ${MODEL_POP} ${MODEL_ROW} > div > div:nth-child(2) > :first-child { font-size: 13px !important; font-weight: 500 !important; }
${THINKING_POP} button > div:first-child { visibility: hidden !important; }
${THINKING_POP} button[data-cp-part="checked"] > div:first-child { display: none !important; }
${THINKING_POP} button > div:nth-child(3) { order: -1; }
${THINKING_POP} button > div:nth-child(3) svg { stroke: var(--cp-accent) !important; }
${THINKING_POP} button > div:nth-child(2) { flex: 1 1 auto !important; min-width: 0 !important; flex-direction: row !important; align-items: center !important; gap: 8px !important; }
[data-cp-default] { flex-shrink: 0; padding: 0 6px; border: 1px solid var(--cp-rule); border-radius: 999px; font-size: 11px; line-height: 16px; color: var(--cp-muted); }
[data-cp-desc] { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; color: var(--cp-muted); }
[data-cp-hint] { position: absolute; right: 12px; bottom: calc(100% + 8px); padding: 3px 10px; border: 1px solid var(--cp-rule); border-radius: 999px; background: var(--cp-raised); font-size: 12px; line-height: 16px; white-space: nowrap; color: var(--cp-muted); pointer-events: none; }
/* Popup surfaces use 20px squircles; nested surfaces keep their own radius scale. */
@supports (corner-shape: squircle) {
  ${SURFACE}, ${THINKING_POP}, ${MODEL_POP}, ${CTX}, [data-testid="chat-outline-preview"], ${PERMISSION}, ${QUESTION} { border-radius: 20px !important; corner-shape: squircle; }
  ${SURFACE} :is(button, [role="button"], [role="menuitem"], [role="option"], a[href]) { border-radius: 16px !important; corner-shape: squircle; }
  ${PLAN} { border-radius: 24px !important; corner-shape: squircle; }
  ${MODEL_POP} :is([data-cp-part="rows"], [data-testid="model-profiles-empty"]) { border-radius: 21px !important; corner-shape: squircle; }
}
`;

let railProviders: RailProvider[] = [];

/** Feeds the model selector the host's providers; call again whenever Paseo's provider snapshot changes. */
export function setRailProviders(list: RailProvider[]) {
  railProviders = list;
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  for (const pop of Array.from(document.querySelectorAll(MODEL_POP))) decorateModels(pop);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
const lucide = (paths: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const BOOKMARK = lucide('<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>');
const LOADER = lucide('<path d="M21 12a9 9 0 1 1-6.219-8.56"/>');
const ALERT = lucide('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>');

const safeSvg = (svg?: string) => (svg && /^<svg[\s>]/.test(svg) && !/<script|\son\w+=/i.test(svg) ? svg : undefined);
const iconFor = (p: RailProvider) => PROVIDER_ICONS[p.id] ?? safeSvg(p.iconSvg) ?? BOT_ICON;

const railHtml = new WeakMap<DomElement, string>();
let clickedThinking: { chip: DomElement; at: number } | undefined;
let pickedModelAt = 0;
/** The composer's picker chips, and the one whose picker is open. */
const CHIPS = '[data-testid="combined-model-selector"], [data-testid="agent-thinking-selector"], [data-testid="mode-control"]';
let openedBy: DomElement | undefined;

function noteClick(event: { target: unknown; clientX: number; clientY: number }) {
  const target = event.target as DomElement | null;
  const picker = target?.closest?.(CHIPS);
  if (picker) openedBy = picker;
  // Paseo closes an open picker through a backdrop over the whole window, so clicking another chip only closed it. Open that one too,
  // once Paseo is done closing; clicking the same chip still just closes its picker.
  else if (openedBy && document.querySelector(POP) && !target?.closest?.(POP)) {
    const under = document.elementsFromPoint(event.clientX, event.clientY).map((el) => el.closest(CHIPS)).find((el) => el);
    if (under && under !== openedBy) setTimeout(() => under.click(), 0);
  }
  const chip = target?.closest?.('[data-testid="agent-thinking-selector"]');
  if (chip) clickedThinking = { chip, at: Date.now() };
  // Any other click (the mode chip, a menu) means the next popover isn't the thinking list; clicks inside an open popover keep it.
  else if (!target?.closest?.(POP)) clickedThinking = undefined;
  if (target?.closest?.(`${MODEL_POP} ${MODEL_ROW}`)) pickedModelAt = Date.now();
}

/**
 * Paseo lights a picker's hovered or keyboard-active row with the raised color, through generated classes CSS can't name.
 * The surfaces are raised now, so tag the lit row (data-cp-lit) whenever a row's class changes; CSS draws it a step up.
 * Only open pickers are watched, a handful of rows each. The plugin's own rail rows keep their CSS hover.
 */
const watchedSurfaces = new WeakSet<DomElement>();
function markLitRows(roots: DomElement[]) {
  for (const surface of within(roots, '[data-testid="combobox-desktop-container"], [data-testid="command-center-panel"]')) {
    if (watchedSurfaces.has(surface)) continue;
    watchedSurfaces.add(surface);
    const mark = () => {
      for (const row of Array.from(surface.querySelectorAll("button"))) {
        if (row.closest("[data-cp-rail]")) continue;
        // Measure Paseo's own color, not the one data-cp-lit paints.
        row.removeAttribute("data-cp-lit");
        if (getComputedStyle(row).backgroundColor !== "rgba(0, 0, 0, 0)") row.setAttribute("data-cp-lit", "");
      }
    };
    new MutationObserver(mark).observe(surface, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    mark();
  }
}

/**
 * Moving between sessions, Paseo keeps each workspace hover card up 100ms after the pointer leaves its row and mounts the next one over
 * it; as cards close it moves their content between elements and drops the spare one as a FadeOut exit copy. Only the card for the
 * hovered row shows, gliding from where the shown card was drawn; exit copies show only once no card is left, so closing still fades.
 */
const WS_CARD = '[data-testid="workspace-hover-card"]';
const WS_ROW = '[data-testid^="sidebar-workspace-row-"]';
const GLIDE_MS = 100;
const hoverCards = new Set<DomElement>();
const placedAt = new WeakMap<DomElement, number>();
let placements = 0;
let hoveredRow: DomElement | undefined;
/** The card on screen: its session, resting top, the offset its glide started from (ease-out cubic), and when. Elements come and go under it. */
let shownCard: { el: DomElement; name: string; top: number; dy: number; at: number } | undefined;
const isExit = (card: DomElement) => card.style.getPropertyValue("animation-name") === "FadeOut";
const cardTop = (card: DomElement) => {
  const top = card.style.getPropertyValue("top");
  return !top || top.startsWith("-9999") || isExit(card) ? undefined : parseFloat(top);
};

function syncHoverCards() {
  const placed: DomElement[] = [];
  for (const card of hoverCards) {
    if (!card.isConnected) hoverCards.delete(card);
    else if (cardTop(card) !== undefined) placed.push(card);
  }
  const name = (card: DomElement) => card.querySelector('[data-testid="hover-card-workspace-name"]')?.textContent;
  const hovered = hoveredRow?.isConnected ? placed.filter((card) => hoveredRow!.textContent?.includes(name(card) ?? "\0")) : [];
  const target = (hovered.length ? hovered : placed).reduce<DomElement | undefined>((a, b) => (a && (placedAt.get(a) ?? 0) > (placedAt.get(b) ?? 0) ? a : b), undefined);
  if (target) {
    const top = cardTop(target)!;
    const session = name(target) ?? "";
    // Another session's card: its icons pop in and its text fades in trailing the glide, as it moves over.
    if (shownCard && shownCard.name !== session) {
      target.style.setProperty("--cp-shift", top > shownCard.top ? "-4px" : top < shownCard.top ? "4px" : "0px");
      target.setAttribute("data-cp-swap", target.getAttribute("data-cp-swap") === "a" ? "b" : "a");
    }
    if (shownCard) shownCard.name = session;
    if (shownCard?.el !== target || shownCard.top !== top) {
      const now = Date.now();
      // Read where the shown card is drawn; once Paseo has dropped its element, work it out from the glide (ease-out cubic).
      const matrix = shownCard?.el.isConnected ? getComputedStyle(shownCard.el).transform : "";
      const drawn = matrix.startsWith("matrix(") ? Number(matrix.slice(7, -1).split(",")[5]) : undefined;
      const left = shownCard ? Math.max(0, 1 - (now - shownCard.at) / GLIDE_MS) : 0;
      const dy = shownCard ? shownCard.top + (drawn ?? shownCard.dy * left ** 3) - top : 0;
      target.style.setProperty("--cp-from", `${dy}px`);
      // Two identical keyframes, so a reused card restarts its glide without a forced reflow.
      if (dy) target.setAttribute("data-cp-glide", target.getAttribute("data-cp-glide") === "a" ? "b" : "a");
      shownCard = { el: target, name: session, top, dy, at: now };
    }
  } else shownCard = undefined;
  for (const card of hoverCards) {
    if (target && card !== target) card.setAttribute("data-cp-gone", "");
    else card.removeAttribute("data-cp-gone");
  }
}

function noteHoverCard(card: DomElement) {
  const top = card.style.getPropertyValue("top");
  if (cardTop(card) !== undefined && card.getAttribute("data-cp-top") !== top) {
    card.setAttribute("data-cp-top", top);
    placedAt.set(card, ++placements);
  }
  syncHoverCards();
}

const notePointer = (event: { target: unknown }) => {
  const target = event.target as DomElement | null;
  const row = target?.closest?.(WS_ROW);
  if (row && row !== hoveredRow) (hoveredRow = row), hoverCards.size && syncHoverCards();
  overTick = target?.closest?.(OUTLINE_TICK) ?? undefined;
  if (ghost) overTick ? moveGhost(overTick) : waitGhost();
};

function watchHoverCards(roots: DomElement[]) {
  for (const card of within(roots, WS_CARD)) {
    if (hoverCards.has(card)) continue;
    hoverCards.add(card);
    if (!isExit(card)) new MutationObserver(() => noteHoverCard(card)).observe(card, { childList: false, subtree: false, attributes: true, attributeFilter: ["style"] });
    noteHoverCard(card);
  }
}

/**
 * Paseo drops the chat outline preview as the pointer leaves a tick and mounts the next one 150ms after it rests on another. Meanwhile
 * a copy of the old preview glides to the tick under the pointer; the new preview takes over from it with its text fading in. If the
 * pointer leaves the rail instead, the copy fades out.
 */
const OUTLINE_PREVIEW = '[data-testid="chat-outline-preview"]';
const OUTLINE_TICK = '[data-testid^="chat-outline-tick-"]';
let overTick: DomElement | undefined;
let ghost: { el: DomElement; tick: DomElement; dy: number; timer?: ReturnType<typeof setTimeout> } | undefined;

function dropGhost(fade: boolean) {
  if (!ghost) return;
  const { el, timer } = ghost;
  clearTimeout(timer);
  ghost = undefined;
  if (!fade) return el.remove();
  el.setAttribute("data-cp-ghost", "out");
  setTimeout(() => el.remove(), 100);
}

/** Waits for Paseo's next preview while the pointer is on a tick (back on its own one too); otherwise it has left the rail. */
const waitGhost = () => {
  if (!ghost) return;
  clearTimeout(ghost.timer);
  ghost.timer = setTimeout(() => dropGhost(true), overTick ? 400 : 60);
};

function moveGhost(tick: DomElement) {
  if (!ghost) return;
  ghost.dy = tick.getBoundingClientRect().top - ghost.tick.getBoundingClientRect().top;
  ghost.el.style.setProperty("transform", `translateY(${ghost.dy}px)`);
  // Its text dims while it stands over another tick, until that tick's preview arrives.
  if (ghost.dy) ghost.el.setAttribute("data-cp-moved", "");
  else ghost.el.removeAttribute("data-cp-moved");
  waitGhost();
}

function ghostOutlinePreview(removed: Array<{ el: DomElement; from: DomElement }>) {
  const old = removed.find(({ el }) => el.matches(`${OUTLINE_PREVIEW}:not([data-cp-ghost])`));
  // The preview sits beside its tick, in a wrapper of the two.
  const tick = old?.from.isConnected ? old.from.querySelector(OUTLINE_TICK) : null;
  if (!old || !tick || document.querySelector(`${OUTLINE_PREVIEW}:not([data-cp-ghost])`)) return;
  dropGhost(false);
  const el = old.el.cloneNode(true);
  el.setAttribute("data-cp-ghost", "");
  el.removeAttribute("data-cp-swap");
  old.from.appendChild(el);
  // Style it in place first, so moving it to another tick transitions.
  el.getBoundingClientRect();
  ghost = { el, tick, dy: 0 };
  if (overTick) moveGhost(overTick);
  else waitGhost();
}

function swapOutlinePreview(roots: DomElement[]) {
  if (!ghost) return;
  for (const el of within(roots, `${OUTLINE_PREVIEW}:not([data-cp-ghost])`)) {
    // Measured at rest: swapping first takes it out of the popover rise-in.
    // Another prompt's text fades in trailing the glide; the same prompt (back on its tick) just stays.
    el.setAttribute("data-cp-swap", el.textContent === ghost.el.textContent ? "same" : "new");
    el.style.setProperty("--cp-shift", ghost.dy > 0 ? "-4px" : ghost.dy < 0 ? "4px" : "0px");
    el.style.setProperty("--cp-from", "0px");
    el.style.setProperty("--cp-from", `${ghost.el.getBoundingClientRect().top - el.getBoundingClientRect().top}px`);
    dropGhost(false);
  }
}

/** Marks and decorates Paseo's model and thinking popovers as they open or change view. */
function decoratePopovers(roots: DomElement[]) {
  const pops = new Set<DomElement>();
  for (const root of roots) {
    const inside = root.closest(POP);
    if (inside) pops.add(inside);
    else for (const pop of within([root], POP)) pops.add(pop);
  }
  for (const pop of pops) {
    if (pop.querySelector('[data-testid="compact-model-list"], [data-testid="compact-provider-list"]')) {
      pop.setAttribute(TAG, "models");
      decorateModels(pop);
    } else if (clickedThinking && Date.now() - clickedThinking.at < 2000) {
      decorateThinking(pop, clickedThinking.chip);
    }
  }
}

/** The left provider rail, the model count and shorter descriptions. Paseo's own list still does the selecting. */
function decorateModels(pop: DomElement) {
  const current = pop.querySelector(SETTINGS)?.getAttribute("data-testid")?.slice("selector-header-settings-".length);
  // Only a new chat can change provider: its selector has a provider list or a back button to one.
  const canSwitch = !!pop.querySelector(`${BACK}, [data-testid="compact-provider-list"]`);

  for (const el of Array.from(pop.firstElementChild?.children ?? [])) el.setAttribute("data-cp-part", el.querySelector("input") ? "search" : "header");
  for (const el of Array.from(pop.querySelectorAll('[data-cp-part="header"] > div'))) if (el.querySelector(":scope > svg")) el.setAttribute("data-cp-part", "icon");
  for (const el of Array.from(pop.querySelectorAll('[data-testid^="model-provider-"]'))) el.parentElement?.parentElement?.parentElement?.setAttribute("data-cp-part", "providers");
  for (const el of Array.from(pop.querySelectorAll(MODEL_ROW))) el.parentElement?.setAttribute("data-cp-part", "rows");
  // Counted while the search is empty, so a filtered list doesn't change the provider's total.
  let title = pop.querySelector(SETTINGS);
  while (title && title.parentElement?.getAttribute("data-cp-part") !== "header") title = title.parentElement;
  title = title?.previousElementSibling ?? null;
  title?.setAttribute("data-cp-part", "title");
  const count = pop.querySelectorAll(MODEL_ROW).length;
  if (title && count && !(pop.querySelector("input") as { value?: string } | null)?.value) title.setAttribute("data-cp-count", `${count} model${count === 1 ? "" : "s"}`);
  // "Opus 5.5 · Latest release" under "Opus 5.5": the name is already on the row.
  for (const text of Array.from(pop.querySelectorAll(`${MODEL_ROW} > div > div:nth-child(2)`))) {
    const [name, description] = Array.from(text.children);
    const node = description?.firstChild;
    const prefix = `${name?.textContent ?? ""} · `;
    if (node?.nodeValue?.startsWith(prefix)) node.nodeValue = node.nodeValue.slice(prefix.length);
  }

  let rail = Array.from(pop.children).find((el) => el.hasAttribute("data-cp-rail"));
  const opening = !rail;
  if (!rail) {
    rail = document.createElement("div");
    rail.setAttribute("data-cp-rail", "");
    const font = pop.querySelector("input");
    if (font) rail.style.setProperty("font-family", getComputedStyle(font).fontFamily);
    wireRail(pop, rail);
    pop.appendChild(rail);
  }
  const item = (id: string, label: string, icon: string, extra = "") =>
    `<button type="button" data-cp-provider="${esc(id)}" aria-current="${id === (current ?? "profiles")}"${!canSwitch && id !== current ? ' aria-disabled="true"' : ""}><span data-cp-icon>${icon}</span><span data-cp-label title="${esc(label)}">${esc(label)}</span>${extra}</button>`;
  const status = (p: RailProvider) =>
    p.status === "loading" ? `<span data-cp-icon data-cp-status="loading">${LOADER}</span>` : p.status === "error" || p.status === "unavailable" ? `<span data-cp-icon data-cp-status="error">${ALERT}</span>` : "";
  const html = [canSwitch ? `${item("profiles", "Profiles", BOOKMARK)}<hr>` : "", ...railProviders.map((p) => item(p.id, p.label, iconFor(p), status(p)))].join("");
  if (railHtml.get(rail) !== html) {
    rail.innerHTML = html;
    railHtml.set(rail, html);
  }
  const active = rail.querySelector('[aria-current="true"]');
  const offset = active ? active.getBoundingClientRect().top - rail.getBoundingClientRect().top : 0;
  if (opening && offset > rail.getBoundingClientRect().height - 36) rail.scrollTop += offset - 120;
}

function wireRail(pop: DomElement, rail: DomElement) {
  const tip = document.createElement("div");
  tip.setAttribute("data-cp-tip", "");
  pop.appendChild(tip);
  const itemOf = (target: unknown) => (target as DomElement | null)?.closest?.("[data-cp-provider]") ?? null;
  rail.addEventListener("click", (event) => {
    const item = itemOf(event.target);
    if (!item || item.getAttribute("aria-disabled") === "true" || item.getAttribute("aria-current") === "true") return;
    const id = item.getAttribute("data-cp-provider")!;
    // Drive Paseo's own drill-down: back to its provider list, then into the provider.
    pop.querySelector(BACK)?.click();
    let tries = 0;
    const open = () => {
      if (id === "profiles") return;
      const row = pop.querySelector(`[data-testid="model-provider-${id}"]`);
      if (row) row.click();
      else if (++tries < 30) requestAnimationFrame(open);
    };
    open();
  });
  rail.addEventListener("mouseover", (event) => {
    const item = itemOf(event.target);
    if (!item || item.getAttribute("aria-disabled") !== "true") return tip.style.setProperty("display", "none");
    const here = railProviders.find((p) => p.id === pop.querySelector('[data-cp-provider][aria-current="true"]')?.getAttribute("data-cp-provider"));
    const there = item.textContent ?? "";
    tip.innerHTML = `<b>New chats only</b>This agent stays on ${esc(here?.label ?? "its provider")}. Start a new chat to use ${esc(there)}.`;
    const box = pop.getBoundingClientRect();
    const at = item.getBoundingClientRect();
    tip.style.setProperty("left", `${at.right - box.left - 24}px`);
    tip.style.setProperty("top", `${at.bottom - box.top + 4}px`);
    tip.style.setProperty("display", "block");
  });
  rail.addEventListener("mouseleave", () => tip.style.setProperty("display", "none"));
}

/** The model a composer's chips show, matched by its label and, when labels repeat across providers, its thinking option count. */
function findModel(label: string | undefined, thinkingCount?: number) {
  const named = railProviders.flatMap((p) => p.models).filter((m) => m.label === label);
  return named.find((m) => thinkingCount === undefined || m.thinking.length === thinkingCount) ?? named[0];
}

// Paseo shows its own wording for thinking levels ("Extra high" for xhigh), so compare loosely.
const level = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^extra/, "x");

const chipText = (scope: DomElement, testId: string) => scope.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim() ?? "";
// Some providers' thinking chip is an icon only; its accessibility label still names the level.
const thinkingText = (scope: DomElement) => /\((.+)\)$/.exec(scope.querySelector('[data-testid="agent-thinking-selector"]')?.getAttribute("aria-label") ?? "")?.[1] ?? chipText(scope, "agent-thinking-selector");

/** Adds what Paseo's thinking list leaves out: the model's default level and, when the provider has them, descriptions. */
function decorateThinking(pop: DomElement, chip: DomElement) {
  const composer = chip.closest('[data-testid="message-input-root"]') ?? document.documentElement;
  const labels = Array.from(pop.querySelectorAll("button > div:nth-child(2)"));
  const model = findModel(chipText(composer, "combined-model-selector"), labels.length);
  if (!model) return;
  pop.setAttribute(TAG, "thinking");
  for (const button of Array.from(pop.querySelectorAll("button"))) if (button.children.length > 2) button.setAttribute("data-cp-part", "checked");
  if (model.thinking.some((t) => t.description)) pop.setAttribute("data-cp-described", "");
  // Paseo lists the model's options in order; a search filter (over six options) breaks that, so match by name then.
  const inOrder = labels.length === model.thinking.length;
  labels.forEach((el, i) => {
    const option = inOrder ? model.thinking[i] : model.thinking.find((t) => level(t.label) === level(el.firstElementChild?.textContent ?? ""));
    if (!option || el.querySelector("[data-cp-default], [data-cp-desc]")) return;
    for (const [attr, value] of [["data-cp-default", option.isDefault ? "Default" : ""], ["data-cp-desc", option.description ?? ""]] as const) {
      if (!value) continue;
      const span = document.createElement("span");
      span.setAttribute(attr, "");
      span.textContent = value;
      el.appendChild(span);
    }
  });
}

const seenChips = new WeakMap<DomElement, { model: string; thinking: string }>();

/** Paseo silently moves thinking to the new model's default when the old level doesn't exist there; say so. */
function noteThinkingFallback() {
  for (const composer of Array.from(document.querySelectorAll('[data-testid="message-input-root"]'))) {
    const now = { model: chipText(composer, "combined-model-selector"), thinking: composer.querySelector('[data-testid="agent-thinking-selector"]') ? thinkingText(composer) : "" };
    const before = seenChips.get(composer);
    seenChips.set(composer, now);
    if (!before || before.model === now.model || !before.thinking || !now.thinking || before.thinking === now.thinking) continue;
    if (Date.now() - pickedModelAt > 3000) continue;
    const model = findModel(now.model);
    if (!model || model.thinking.some((t) => level(t.label) === level(before.thinking))) continue;
    composer.querySelector("[data-cp-hint]")?.remove();
    const hint = document.createElement("div");
    hint.setAttribute("data-cp-hint", "");
    hint.textContent = `${before.thinking} isn't on ${now.model} · using its default, ${now.thinking}`;
    composer.appendChild(hint);
    setTimeout(() => hint.remove(), 6000);
  }
}

// ---- Jump between prompts ----

/** The chat on screen: other tabs keep their scrollers mounted but hidden (zero size). */
function visibleChat() {
  return Array.from(document.querySelectorAll('[data-testid="agent-chat-scroll"]')).find((el) => el.getBoundingClientRect().height > 0);
}

let stopExpansionFollow: (() => void) | undefined;

/** Paseo 0.11.4 follows resized content one frame late. Keep an already pinned chat at the bottom before paint during a disclosure. */
export function followExpansionAtBottom() {
  if (Platform.OS !== "web" || typeof document === "undefined" || typeof ResizeObserver === "undefined") return;
  stopExpansionFollow?.();
  const chat = visibleChat();
  if (!chat || getComputedStyle(chat).overflowAnchor === "none" || Math.abs(chat.scrollHeight - chat.clientHeight - chat.scrollTop) > 1) return;
  const content = chat.firstElementChild;
  if (!content) return;
  const observer = new ResizeObserver(() => {
    if (!chat.isConnected || getComputedStyle(chat).overflowAnchor === "none") return stop();
    chat.scrollTop = Math.max(0, chat.scrollHeight - chat.clientHeight);
  });
  const stop = () => {
    observer.disconnect();
    clearTimeout(timer);
    chat.removeEventListener("wheel", stop, true);
    chat.removeEventListener("touchstart", stop, true);
    chat.removeEventListener("pointerdown", stop, true);
    document.removeEventListener("keydown", stop, true);
    if (stopExpansionFollow === stop) stopExpansionFollow = undefined;
  };
  // Includes the 100ms transition, its first frame, and deferred output removal.
  const timer = setTimeout(stop, 200);
  stopExpansionFollow = stop;
  observer.observe(content);
  chat.addEventListener("wheel", stop, true);
  chat.addEventListener("touchstart", stop, true);
  chat.addEventListener("pointerdown", stop, true);
  document.addEventListener("keydown", stop, true);
}

/**
 * Scrolls the visible chat to your previous (-1) or next (1) message and outlines it briefly. Paseo's list only mounts
 * the messages near the viewport, so when none is mounted in that direction it scrolls a screen at a time until one is.
 */
export function jumpToPrompt(direction: -1 | 1) {
  if (Platform.OS !== "web") return;
  const chat = visibleChat();
  if (!chat) return;
  let tries = 0;
  const step = () => {
    const top = chat.getBoundingClientRect().top;
    const offsets = Array.from(chat.querySelectorAll('[data-testid="user-message"]')).map((el) => ({ el, y: el.getBoundingClientRect().top - top }));
    // A message we landed on sits about 16px down (more at the very top of a chat), so "next" starts below that band.
    const target = direction < 0 ? offsets.filter((m) => m.y < -4).pop() : offsets.find((m) => m.y > 64);
    if (target) {
      chat.scrollBy({ top: target.y - 16 });
      target.el.setAttribute("data-cp-flash", "");
      setTimeout(() => target.el.removeAttribute("data-cp-flash"), 900);
      return;
    }
    const before = chat.scrollTop;
    chat.scrollBy({ top: direction * chat.clientHeight * 0.9 });
    // ponytail: gives up after 40 screens; a jump through a longer gap needs Paseo to expose its message index.
    if (chat.scrollTop !== before && ++tries < 40) requestAnimationFrame(() => requestAnimationFrame(step));
  };
  step();
}

/** ⌥⌘↑ / ⌥⌘↓ jump between your messages in the visible chat. */
export function bindPromptKeys() {
  if (Platform.OS !== "web") return () => {};
  const onKey = (e: KeyEvent) => {
    if (!e.altKey || !e.metaKey || e.ctrlKey || e.shiftKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    jumpToPrompt(e.key === "ArrowUp" ? -1 : 1);
  };
  document.addEventListener("keydown", onKey, true);
  return () => document.removeEventListener("keydown", onKey, true);
}

// The window chrome around the chat (left sidebar, workspace header and tabs, Explorer): its restyle (Prefs.windowStyle) and the tags it keys on.
import { Platform } from "react-native";
import { within, type ComputedStyle, type DomElement, type WebDocument } from "./dom";

declare const document: WebDocument;
declare function getComputedStyle(el: DomElement): ComputedStyle;

const WIN = "data-cp-win";
const CLEAR = "rgba(0, 0, 0, 0)";

// [element found, element it tags, part]. Paseo marks these only through a child or a fixed nesting, so they are tagged rather than
// picked with :has() or descendant selectors keyed on testIDs (see selectors.ts).
const PARTS: Array<[string, (el: DomElement) => DomElement | null | undefined, string]> = [
  ['[data-testid="sidebar-footer"]', (el) => el.parentElement, "left"],
  // Its wrapper, a stacking context below the main area's: raised so the resize handle's half over the gap gets the pointer.
  ['[data-testid="sidebar-footer"]', (el) => el.parentElement?.parentElement, "left-wrap"],
  // The block of New workspace, History, Search… with the rule under it.
  ['[data-testid="sidebar-global-new-workspace"]', (el) => el.parentElement?.parentElement?.parentElement, "nav"],
  ['[data-testid="sidebar-display-preferences-menu"]', (el) => el.parentElement?.parentElement?.parentElement?.firstElementChild, "ws-label"],
  // A workspace row's title, beside its status indicator.
  ['[data-testid^="workspace-status-indicator-"]', (el) => el.nextElementSibling?.firstElementChild?.firstElementChild, "ws-title"],
];

const EXPLORER = '[data-testid="workspace-explorer-sidebar"]';
const REPO = '[data-testid="changes-repository-header"]';
const DECK = '[data-testid^="workspace-deck-entry-"]';

/**
 * Tags the row that takes floating's right inset: the one holding the panel and its workspace's Explorer (the gap to the Explorer
 * lives inside the Explorer, see WINDOW_CSS), or the panel's parent where there is no Explorer (Settings, or before it mounts).
 */
function findRow(panel: DomElement) {
  const explorer = panel.closest(DECK)?.querySelector(EXPLORER);
  let row = panel.parentElement;
  if (explorer) while (row && !row.querySelector(EXPLORER)) row = row.parentElement;
  // A plugin screen (the dashboard) wraps its panel in a display: contents div, which can't take padding.
  else while (row && getComputedStyle(row).display === "contents") row = row.parentElement;
  return row;
}

function setRow(panel: DomElement, row: DomElement | null) {
  const old = (panel.closest(DECK) ?? panel.parentElement?.parentElement)?.querySelector(`[${WIN}="row"]`);
  if (old && old !== row) old.removeAttribute(WIN);
  if (row && row.getAttribute(WIN) !== "row") row.setAttribute(WIN, "row");
}

const set = (el: DomElement, name: string, value: string) => el.getAttribute(name) !== value && el.setAttribute(name, value);

// The window style tagWindow last saw; a switch re-tags the whole page, since the tags are skipped while it is off and the shell layers
// behind the panel are only looked for while floating.
let lastStyle: string | null = null;
// Panels whose shell layers were already looked for.
const walked = new WeakSet<DomElement>();

/**
 * Tags the window chrome inside the added roots (data-cp-win and friends) while the window restyle is on; call with no roots after the
 * window style changes. Styles are read once per main panel, all before any tag is written, so tagging forces one style pass.
 */
export function tagWindow(roots: DomElement[]) {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  const style = document.documentElement.getAttribute("data-cp-rt-window");
  if (style !== lastStyle) roots = style ? [document.body as DomElement] : [];
  lastStyle = style;
  if (!style) return;
  // Reads: the header row, the shell layers behind a new panel (floating only), the rows that take the right inset.
  const writes: Array<() => void> = [];
  // The main area: the header's wrapper and the panes under it, on a workspace and in Settings (both draw composer-dock-header).
  for (const header of within(roots, '[data-testid="composer-dock-header"]')) {
    // The header row is the first descendant with a bottom rule; found by style since its contents differ (no menu button in the desktop app).
    for (let el = header.firstElementChild; el && el.getAttribute(WIN) !== "header"; el = el.firstElementChild)
      if (getComputedStyle(el).borderBottomWidth !== "0px") {
        const row = el;
        writes.push(() => set(row, WIN, "header"));
        break;
      }
    const panel = header.parentElement;
    if (!panel) continue;
    // Floating shows the window color around the panel, so the shell layers that paint behind it are tagged too.
    if (style === "floating" && !walked.has(panel)) {
      walked.add(panel);
      for (let el = panel.parentElement; el && !el.matches('[data-testid="wide-shell"]'); el = el.parentElement)
        if (getComputedStyle(el).backgroundColor !== CLEAR) {
          const layer = el;
          writes.push(() => set(layer, "data-cp-win-bg", ""));
        }
    }
    if (panel.getAttribute(WIN) === "panel") continue;
    const row = findRow(panel);
    writes.push(() => (panel.setAttribute(WIN, "panel"), setRow(panel, row)));
  }
  for (const explorer of within(roots, EXPLORER)) {
    const panel = explorer.closest(DECK)?.querySelector(`[${WIN}="panel"]`);
    if (panel) {
      const row = findRow(panel);
      writes.push(() => setRow(panel, row));
    }
  }
  for (const write of writes) write();
  for (const [selector, target, part] of PARTS)
    for (const el of within(roots, selector)) {
      const t = target(el);
      if (t) set(t, WIN, part);
    }
  // Indent depth of changed-file rows, from Paseo's inline padding (12px a level); dom.ts re-tags a row whose padding changes.
  for (const el of within(roots, INDENTED)) {
    const depth = String(Math.round(parseFloat(el.style.getPropertyValue("padding-left")) / 12) || 0);
    set(el, "data-cp-depth", depth);
  }
  // Paseo draws the Changes branch row empty on a detached HEAD (no branch switcher, PR or git actions); with its rule gone it reads as a gap.
  for (const root of roots) {
    const repo = root.closest(REPO) ?? root.querySelector(REPO);
    const empty = !!repo && !repo.querySelector(":scope > * > *");
    if (repo && empty !== repo.hasAttribute("data-cp-empty")) empty ? repo.setAttribute("data-cp-empty", "") : repo.removeAttribute("data-cp-empty");
  }
  // Changed files' status icon (Paseo labels it New, Modified or Deleted) as a letter. Other locales keep Paseo's icon.
  for (const svg of within(roots, '[data-testid^="diff-tree-file-"] svg[aria-label]')) {
    const letter = FILE_STATUS[svg.getAttribute("aria-label")!];
    if (letter) svg.parentElement?.setAttribute("data-cp-fs", letter);
  }
}

const FILE_STATUS: Record<string, string> = { New: "A", Modified: "M", Deleted: "D" };

// All rules below apply only while <html> has data-cp-rt-window (Prefs.windowStyle flat or floating; "paseo" removes it) and, being
// part of the restyle's stylesheet, only with nativeStyle "design". Colors come from Paseo's theme variables, so any theme works.
const W = ":root[data-cp-rt-window]";
const FLAT = ':root[data-cp-rt-window="flat"]';
const FLOAT = ':root[data-cp-rt-window="floating"]';
const LIGHT = ":is(.light, .pluginLight)";
const TAB = 'button[data-testid^="workspace-tab-"]';
const TAB_LABEL = `${TAB} > div > [dir]`;
const DIFF_FILE = '[data-testid^="diff-tree-file-"]';
const DIFF_FOLDER = '[data-testid^="diff-folder-"]';
const INDENTED = `${DIFF_FILE}[data-testid$="-toggle"][style*="padding-left"], ${DIFF_FOLDER}[data-testid$="-toggle"] > div[style*="padding-left"]`;
// Rules repeat a prefix over a list rather than end in a multi-part :is(), so the browser can file each under its attribute or tag.
const each = (pre: string, list: string[], post = "") => list.map((s) => `${pre} ${s}${post}`).join(", ");
const LEFT_EDGE = [`[${WIN}="left"]`, 'nav[data-testid="settings-sidebar"]'];
const TREE_NAMES = ['[data-testid^="diff-tree-file-"][data-testid$="-name"]', '[data-testid^="diff-folder-"][data-testid$="-name"]', '[data-testid^="file-explorer-row-"][data-testid$="-name"]'];
const ROW_HEIGHTS = ['[data-testid^="diff-tree-file-"][data-testid$="-toggle"]', '[data-testid^="diff-folder-"][data-testid$="-toggle"]', '[data-testid^="file-explorer-row-"][tabindex]:not([data-testid*="-context-menu"])'];
const LEFT_HANDLE = '[data-testid="left-sidebar-resize-handle"]';
const EXPLORER_HANDLE = '[data-testid="workspace-explorer-sidebar-resize-handle"]';
const EXPLORER_HIT = `${EXPLORER_HANDLE} > [role="separator"]`;
const EXPLORER_HIGHLIGHT = '[data-testid="workspace-explorer-sidebar-resize-handle-highlight"]';

// Indent guides: Paseo indents changed-file rows 12px a level with an inline padding (tagged as data-cp-depth); each ancestor level gets a
// 1px line under its chevron.
// Longhands, not the background shorthand, so Paseo's hover fill and the selected fill still show under the lines.
const guides = (depth: number) => {
  const lines = Array.from({ length: depth - 1 }, (_, k) => k);
  return `background-image: ${lines.map(() => "linear-gradient(var(--cp-w-hair), var(--cp-w-hair))").join(", ")}; background-position: ${lines.map((k) => `${12 * (k + 1) + 7}px 0`).join(", ")}; background-size: 1px 100%; background-repeat: no-repeat;`;
};
const INDENT = Array.from({ length: 11 }, (_, i) => i + 2)
  .map((depth) => `${W} [data-cp-depth="${depth}"] { ${guides(depth)} }`)
  .join("\n");

export const WINDOW_CSS = `
${W} {
  --cp-w-strong: color-mix(in srgb, var(--colors-foreground) 50%, #fff);
  --cp-w-faint: color-mix(in srgb, var(--colors-foreground-muted) 58%, var(--colors-surface-sidebar));
  --cp-w-hair: color-mix(in srgb, var(--colors-border) 37%, var(--colors-surface-sidebar));
  --cp-w-edge: var(--cp-w-hair);
}
${W}${LIGHT} {
  --cp-w-strong: var(--colors-foreground);
  /* Faint text at 3:1 reads washed out on a light page (and drops below that on a hovered tab), so light themes use the muted color. */
  --cp-w-faint: var(--colors-foreground-muted);
  --cp-w-hair: var(--colors-border);
  --cp-w-edge: color-mix(in srgb, var(--colors-border) 88%, var(--colors-foreground));
}

/* Left sidebar: lighter rules and smaller type (Paseo's colors and weights stay); the edge to the main area is the background step
   (flat) or the panel's own border (floating). */
${each(W, LEFT_EDGE)} { --colors-border: var(--cp-w-hair); border-right-color: transparent !important; }
${each(FLAT + LIGHT, LEFT_EDGE)} { border-right-color: var(--colors-border) !important; }
${W} [${WIN}="nav"] [role="button"] > [dir] { font-size: 13px !important; }
/* The rules under the nav and above the footer stop 10px short of both sides, so they don't run into the edge. */
${each(W, [`[${WIN}="nav"]`, '[data-testid="sidebar-footer"]'])} { border-color: transparent !important; background-image: linear-gradient(var(--cp-w-hair), var(--cp-w-hair)); background-size: calc(100% - 20px) 1px; background-repeat: no-repeat; }
${W} [${WIN}="nav"] { background-position: center bottom; }
${W} [data-testid="sidebar-footer"] { background-position: center top; }
${W} [${WIN}="ws-label"] { font-size: 11.5px !important; letter-spacing: 0.02em; }
${W} [${WIN}="ws-title"] { font-size: 13px !important; }
${W} [data-testid="sidebar-workspace-timestamp"] { font-size: 11.5px !important; }

/* Header and tabs: medium title, faint project name; the active tab raised, the others faint. */
${W} [${WIN}="header"], ${W} [data-testid="workspace-tabs-row"] { border-bottom-color: var(--cp-w-hair) !important; }
${W} [data-testid="workspace-header-title"] { font-weight: 500 !important; color: var(--cp-w-strong) !important; }
${W} [data-testid="workspace-header-subtitle"] { color: var(--cp-w-faint) !important; }
${W} ${TAB}[aria-selected="true"] { background-color: var(--colors-surface1) !important; }
${W} ${TAB_LABEL} { font-size: 13px !important; color: var(--cp-w-faint) !important; }
${W} ${TAB}[aria-selected="true"] > div > [dir] { color: var(--cp-w-strong) !important; }
/* The fade under the active tab's close button is an SVG Paseo colors with its own active fill (surface2); match the raised tab. */
${W} ${TAB}[aria-selected="true"] + div stop { stop-color: var(--colors-surface1); }

/* Explorer: the sidebar's color and rules; no rules between the branch row, "All changes" and the tree (the one under the tabs and the
   one above Commits stay); a denser tree with indent guides, dimmer folders and status letters. */
${W} [data-testid="workspace-explorer-sidebar"] { --colors-border: var(--cp-w-hair); }
${each(W, ['[data-testid="changes-repository-header"]', '[data-testid="changes-header"]', '[data-testid="files-pane-header"]'])} { border-bottom-color: transparent !important; }
${W} [data-testid="changes-repository-header"][data-cp-empty] { display: none !important; }
${W} [data-testid="workspace-explorer-sidebar"] ${TAB_LABEL} { font-size: 12.5px !important; }
${each(W, TREE_NAMES)} { font-size: 12.5px !important; }
${W} ${DIFF_FOLDER}[data-testid$="-name"] { color: var(--colors-foreground-muted) !important; }
/* Paseo also fades folder names to 76%, which takes light themes' muted text under 4.5:1. */
${W}${LIGHT} ${DIFF_FOLDER}[data-testid$="-name"] { opacity: 1 !important; }
${W} ${DIFF_FOLDER}[data-testid$="-stat"] > [dir] { color: var(--cp-w-faint) !important; }
${each(W, ROW_HEIGHTS)} { height: 26px !important; min-height: 0 !important; padding-top: 0 !important; padding-bottom: 0 !important; }
${W} ${DIFF_FILE}[data-testid$="-toggle"][aria-selected="true"] { background-color: var(--colors-surface-sidebar-selected) !important; border-radius: 6px; }
${W} ${DIFF_FILE}[data-testid$="-toggle"][aria-selected="true"] [data-testid$="-name"] { color: var(--cp-w-strong) !important; }
${INDENT}
${W} [data-cp-fs] > svg { display: none !important; }
${W} [data-cp-fs]::after { content: attr(data-cp-fs); display: flex; align-items: center; justify-content: center; width: 15px; height: 15px; border-radius: 4px;
  font: 600 10px/1 var(--cp-mono, ui-monospace, monospace); color: var(--cp-fs); background-color: color-mix(in srgb, var(--cp-fs) 18%, transparent); }
${W} [data-cp-fs="A"] { --cp-fs: var(--colors-status-success); }
${W} [data-cp-fs="M"] { --cp-fs: var(--colors-status-warning); }
${W} [data-cp-fs="D"] { --cp-fs: var(--colors-status-danger); }

/* No vertical lines between the sidebars and the main area. Light flat themes keep one hairline, since their background step is faint. */
${W} ${EXPLORER_HANDLE} { background-color: transparent !important; }
${FLAT}${LIGHT} ${EXPLORER_HANDLE} { background-color: var(--colors-border) !important; }

/* Floating: the main area (header, tabs, chat) is a panel inset from the window, which takes the sidebar's color. The right inset sits
   on the row of panel and Explorer, and the gap to the Explorer inside the Explorer: its resize handle is clipped to the Explorer's
   column, so that is the only place a hit area across the gap can be. */
/* The insets must paint: the desktop window is transparent wherever Paseo draws nothing. */
${FLOAT}, ${FLOAT} body, ${FLOAT} #root, ${FLOAT} [data-testid="wide-shell"], ${FLOAT} [data-cp-win-bg] { background-color: var(--colors-surface-sidebar) !important; }
${FLOAT} [${WIN}="row"] { padding-right: 8px !important; background-color: var(--colors-surface-sidebar) !important; }
${FLOAT} [${WIN}="panel"] { margin: 8px 0 8px 8px !important; border: 1px solid var(--cp-w-edge); border-radius: 10px; overflow: hidden; }
/* The tab row starts at the panel's top inset plus border, so the rule under it lines up with the one under the header. */
${FLOAT} [data-testid="workspace-explorer-sidebar"] { padding-left: 8px !important; padding-top: 9px !important; }

/* Resize handles keep their place and hit area (Paseo's spans the edge, or the gap when floating); a 2px accent line shows only on
   hover or while dragging. The Explorer's is Paseo's own highlight (3px, on hover and drag), thinned and moved into the gap. */
${W} ${LEFT_HANDLE}::after { content: ""; position: absolute; top: 0; bottom: 0; left: 4px; width: 2px; background-color: var(--colors-accent); opacity: 0; transition: opacity 150ms ease-out; pointer-events: none; }
${W} ${LEFT_HANDLE}:is(:hover, :active)::after { opacity: 1; }
${W} [${WIN}="left-wrap"] { z-index: 1 !important; }
${FLOAT} ${LEFT_HANDLE} { right: -9px !important; width: 10px !important; }
${W} ${EXPLORER_HIGHLIGHT} { width: 2px !important; left: 0 !important; }
${FLOAT} ${EXPLORER_HIT} { left: 0 !important; width: 8px !important; }
${FLOAT} ${EXPLORER_HIGHLIGHT} { left: 3px !important; }
@media (prefers-reduced-motion: reduce) { ${W} ${LEFT_HANDLE}::after { transition: none; } }
`;

import { Platform } from "react-native";
import { watchDom, type WebDocument } from "./dom";

declare const document: WebDocument;

// The fade under a workspace row's hover menu is an SVG whose stop-color Paseo resolves in JS from the same state colors as the row, so
// it could show as a box. Its color follows the row's state through the variables instead (Paseo's order:
// pressed, selected, hovered, rest).
const ROW = '[data-testid^="sidebar-workspace-row-"]';
const STOP = '[data-testid="sidebar-workspace-trailing-scrim"] stop';
const SCRIM = `${STOP} { stop-color: var(--colors-surface-sidebar); }
${ROW}:hover ${STOP} { stop-color: var(--colors-surface-sidebar-hover); }
${ROW}[aria-selected="true"] ${STOP} { stop-color: var(--colors-surface-sidebar-selected); }
${ROW}:active ${STOP} { stop-color: var(--colors-surface2); }`;

/**
 * The sidebar color itself is the theme's `sidebar` token (Paseo 0.16+, which also derives its hover and selected rows). This only
 * fixes what still draws the page color: the explorer's tab row, and the hover menu's fade. `colors()` returns undefined while the
 * plugin theme is off. Repaints on DOM changes and on each `subscribe` call (theme changes don't touch the DOM). Returns cleanup.
 */
export function paintSidebar(colors: () => { sidebar: string } | undefined, subscribe: (repaint: () => void) => () => void) {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  const style = document.createElement("style");
  document.head.appendChild(style);
  const paint = () => {
    const theme = colors();
    const sidebar = theme?.sidebar;
    // The explorer's tab row draws the page color (surface0) rather than the sidebar's.
    const sidebarCss = sidebar ? '[data-testid="workspace-explorer-sidebar"] [data-testid="workspace-tabs-row"] { background-color: var(--colors-surface-sidebar) !important; }' : "";
    const css = theme ? `${sidebarCss}\n${SCRIM}` : "";
    if (style.textContent !== css) style.textContent = css;
  };
  const unsubscribe = subscribe(paint);
  return watchDom({ settled: paint }, () => (unsubscribe(), style.remove()));
}

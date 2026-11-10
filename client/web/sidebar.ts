import { Platform } from "react-native";
import { watchDom, type WebDocument } from "./dom";

declare const document: WebDocument;

// The fade under a workspace row's hover menu is an SVG whose stop-color Paseo resolves in JS from the same state colors as the row, so
// it misses the overrides above and shows as a box. Its color follows the row's state through the variables instead (Paseo's order:
// pressed, selected, hovered, rest).
const ROW = '[data-testid^="sidebar-workspace-row-"]';
const STOP = '[data-testid="sidebar-workspace-trailing-scrim"] stop';
const SCRIM = `${STOP} { stop-color: var(--colors-surface-sidebar); }
${ROW}:hover ${STOP} { stop-color: var(--colors-surface-sidebar-hover); }
${ROW}[aria-selected="true"] ${STOP} { stop-color: var(--colors-surface-sidebar-selected); }
${ROW}:active ${STOP} { stop-color: var(--colors-surface2); }`;

/**
 * Gives Paseo's sidebars (left nav, explorer, Settings) the theme's sidebar color while `colors()` returns one (an empty sidebar
 * leaves Paseo's), and light themes a lighter selected row; `colors()` returns undefined while the plugin theme is off.
 * Plugin themes can't set it: Paseo builds their surfaceSidebar from the background. On web Paseo's styles read
 * the theme from CSS variables (`--colors-surface-sidebar` on `:root.pluginDark` / `.pluginLight`), so overriding
 * the variable recolors every sidebar surface from the first frame, on every screen. Repaints on DOM changes and on each
 * `subscribe` call (theme changes don't touch the DOM). Returns cleanup.
 * ponytail: the variable and class names are Unistyles/Paseo internals; replace with a sidebar theme token once Paseo has one.
 */
export function paintSidebar(colors: () => { sidebar: string } | undefined, subscribe: (repaint: () => void) => () => void) {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  const style = document.createElement("style");
  document.head.appendChild(style);
  const paint = () => {
    const theme = colors();
    const sidebar = theme?.sidebar;
    // The explorer's tab row draws the page color (surface0) rather than the sidebar's.
    const sidebarCss = sidebar
      ? `html:root:is(.pluginDark, .pluginLight) { --colors-surface-sidebar: ${sidebar}; }
[data-testid="workspace-explorer-sidebar"] [data-testid="workspace-tabs-row"] { background-color: var(--colors-surface-sidebar) !important; }`
      : "";
    // Paseo fills a light plugin theme's selected sidebar row with surface4, which it maps to the ring (placeholder) color: a dark grey
    // under dark text. Its own light theme uses a step past the hover color (surface3, the border), so do the same.
    const css = theme
      ? `${sidebarCss}
html:root.pluginLight { --colors-surface-sidebar-selected: color-mix(in srgb, var(--colors-border) 92%, var(--colors-foreground)); }
${SCRIM}`
      : "";
    if (style.textContent !== css) style.textContent = css;
  };
  const unsubscribe = subscribe(paint);
  return watchDom({ settled: paint }, () => (unsubscribe(), style.remove()));
}

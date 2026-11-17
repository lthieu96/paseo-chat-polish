import { Platform } from "react-native";
import { watchDom, type WebDocument } from "./dom";

declare const document: WebDocument;

/**
 * The sidebar color itself is the theme's `sidebar` token (Paseo 0.16+, which also derives its hover and selected rows, and the fade
 * under a row's hover buttons from them). This only fixes what still draws the page color: the explorer's tab row. `colors()` returns
 * undefined while the plugin theme is off. Repaints on DOM changes and on each `subscribe` call (theme changes don't touch the DOM). Returns cleanup.
 */
export function paintSidebar(colors: () => { sidebar: string } | undefined, subscribe: (repaint: () => void) => () => void) {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  const style = document.createElement("style");
  document.head.appendChild(style);
  const paint = () => {
    // The explorer's tab row draws the page color (surface0) rather than the sidebar's.
    const css = colors()?.sidebar ? '[data-testid="workspace-explorer-sidebar"] [data-testid="workspace-tabs-row"] { background-color: var(--colors-surface-sidebar) !important; }' : "";
    if (style.textContent !== css) style.textContent = css;
  };
  const unsubscribe = subscribe(paint);
  return watchDom({ settled: paint }, () => (unsubscribe(), style.remove()));
}

import { Platform } from "react-native";
import { watchDom, type WebDocument } from "./dom";

declare const document: WebDocument;

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

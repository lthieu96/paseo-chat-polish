// Turns the restyle of Paseo's own items on and off, and publishes the app theme's colors it draws with.
import { Platform } from "react-native";
import { guardPositional, POSITIONAL, splitTop } from "../css-guard";
import { darker, hexAlpha } from "./color";
import { watchDom, type DomElement, type WebDocument } from "./dom";
import { readHostAppearance } from "./host";
import { dropGhost, ghostOutlinePreview, hoverCardsRemoved, notePointer, swapOutlinePreview, watchHoverCards } from "./hover-cards";
import { ICON_VARS } from "./icons";
import { redrawDiagrams, setDiagramColors, themeMermaid, type PeleDiagrams } from "./mermaid";
import { decoratePopovers, markLitRows, MODEL_SELECTOR_CSS, noteClick, noteThinkingFallback } from "./model-picker";
import { runningRemoved, tagParts } from "./parts";
import { nativeRestyleCss } from "./restyle-css";
import { currentPrefs, subscribePrefs } from "../prefs";
import { markBlocks, RICH_TEXT_CSS } from "./rich-text";

declare const document: WebDocument;
declare function getComputedStyle(el: DomElement): { getPropertyValue(name: string): string };

const MONO_FALLBACK = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

/** Publishes the app theme's colors and the code font as CSS variables for restyleNative. */
export function setNativeColors(c: { surface0: string; surface1: string; surface2: string; border: string; foreground: string; foregroundMuted: string; accent: string; accentForeground: string; statusSuccess: string; statusWarning: string; statusDanger: string }) {
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
  setDiagramColors(c);
}

const COLOR_VARS = {
  surface0: "--colors-surface0",
  surface1: "--colors-surface1",
  surface2: "--colors-surface2",
  border: "--colors-border",
  foreground: "--colors-foreground",
  foregroundMuted: "--colors-foreground-muted",
  accent: "--colors-accent",
  accentForeground: "--colors-accent-foreground",
  statusSuccess: "--colors-success",
  statusWarning: "--colors-warning",
  statusDanger: "--colors-destructive",
} as const;

/** Reads the app theme without a mounted sidebar item. */
export function syncNativeColors() {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  const style = getComputedStyle(document.documentElement);
  const colors = Object.fromEntries(Object.entries(COLOR_VARS).map(([key, variable]) => [key, style.getPropertyValue(variable).trim()])) as Parameters<typeof setNativeColors>[0];
  setNativeColors(colors);
}

type CssRuleLike = { selectorText?: string; cssRules?: ArrayLike<CssRuleLike> };

function guardRules(rules: ArrayLike<CssRuleLike>) {
  for (const rule of Array.from(rules)) {
    if (rule.cssRules) guardRules(rule.cssRules);
    // An invalid rewrite is ignored by the browser, which keeps the original selector.
    if (rule.selectorText && POSITIONAL.test(rule.selectorText)) rule.selectorText = splitTop(rule.selectorText, (ch) => ch === ",").map((c) => guardPositional(c.trim())).join(", ");
  }
}

// Paseo 0.15 opens menus through element.animate (WEB_CONTENT_ENTERING_KEYFRAMES in menu-overlay.tsx, 150ms), which CSS can't shorten, so
// the call is cut to the 40ms the restyle gives every surface. Matched by its keyframes; if Paseo changes them, menus keep its 150ms.
const MENU_ENTRANCE = "scale(0.97)";
type Animatable = { animate(keyframes: unknown, options?: unknown): unknown };
function quickMenus(enabled: () => boolean) {
  const proto = (globalThis as unknown as { Element?: { prototype: Animatable } }).Element?.prototype;
  if (!proto) return () => {};
  const inherited = proto.animate;
  proto.animate = function (this: Animatable, keyframes: unknown, options?: unknown) {
    const entrance = typeof options === "number" && enabled() && (keyframes as { transform?: unknown[] } | null)?.transform?.[0] === MENU_ENTRANCE;
    return inherited.call(this, keyframes, entrance ? Math.min(options, 40) : options);
  };
  return () => {
    proto.animate = inherited;
  };
}

/**
 * Restyles what Paseo still draws itself (tool call groups, user bubbles, markdown) to the Chat Polish design
 * while `enabled()`; desktop/web only. Returns cleanup.
 * ponytail: CSS keyed on Paseo's testIDs, its DOM nesting and the data-paseo-markdown-* marks on its markdown;
 * a Paseo layout change can silently stop parts of it applying. Turn it off from the dashboard if it misfires.
 */
export function restyleNative(enabled: () => boolean, pele?: PeleDiagrams) {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  let style: DomElement | undefined;
  const unthemeMermaid = themeMermaid(() => !!style, pele);
  const slowMenus = quickMenus(() => !!style);
  syncNativeColors();
  const off = () => {
    if (!style) return;
    style.remove();
    style = undefined;
    // Diagrams drawn by Pele go back to Paseo's mermaid.
    redrawDiagrams();
    document.removeEventListener("click", noteClick, true);
    document.removeEventListener("pointerover", notePointer, true);
    dropGhost(false);
    for (const el of Array.from(document.querySelectorAll("[data-cp-rail], [data-cp-tip], [data-cp-hint], [data-cp-redraw], [data-cp-redraw-card], [data-cp-diagram-full]"))) el.remove();
    for (const el of Array.from(document.querySelectorAll("[data-cp-redrawn]"))) el.removeAttribute("data-cp-redrawn");
  };
  const ensureStyle = () => {
    if (!enabled()) return off();
    const css = nativeRestyleCss(currentPrefs());
    const text = css.prefixCss + css.toolRowsCss + css.userMessagesCss + css.baseCss + css.markdownCss + css.composerCss + (currentPrefs().surfaces.markdown === "show" ? RICH_TEXT_CSS : "") + MODEL_SELECTOR_CSS + ICON_VARS.join("\n");
    if (!style) {
      style = document.createElement("style");
      document.head.appendChild(style);
      document.addEventListener("click", noteClick, true);
      document.addEventListener("pointerover", notePointer, true);
      redrawDiagrams();
    }
    style.textContent = text;
    const sheet = (style as unknown as { sheet?: { cssRules: ArrayLike<CssRuleLike> } }).sheet;
    if (sheet) guardRules(sheet.cssRules);
  };
  const unsubscribePrefs = subscribePrefs(ensureStyle);
  const stop = watchDom({
    added: (roots) => {
      syncNativeColors();
      ensureStyle();
      if (!style) return;
      tagParts(roots);
      markBlocks(roots);
      decoratePopovers(roots);
      markLitRows(roots);
      watchHoverCards(roots);
      swapOutlinePreview(roots);
    },
    removed: (nodes) => {
      if (style) runningRemoved(nodes);
      hoverCardsRemoved();
      ghostOutlinePreview(nodes);
    },
    settled: (roots) => {
      syncNativeColors();
      if (!style) return;
      noteThinkingFallback();
      markBlocks(roots);
    },
  }, off);
  return () => {
    unsubscribePrefs();
    stop();
    unthemeMermaid();
    slowMenus();
  };
}

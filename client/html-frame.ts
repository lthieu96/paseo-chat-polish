import { createElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { openExternalUrl } from "@getpaseo/plugin/client";
import { htmlPage, themeCss, type HtmlColors } from "../shared/page.ts";
import { FRAME_SANDBOX, fitFrame, frameKey, frameLink, frameReport, heightAt } from "./html.ts";
import { readHostAppearance, seriesFrom } from "./web";

// Web only (views.tsx checks Platform.OS); just the DOM this module touches.
declare const navigator: { userAgent: string } | undefined;
type MessageListener = (event: { source: unknown; data: unknown }) => void;
declare const window: { addEventListener(type: "message", listener: MessageListener): void; removeEventListener(type: "message", listener: MessageListener): void };
interface HoverTarget {
  addEventListener(type: "mouseenter" | "mouseleave", listener: () => void): void;
  removeEventListener(type: "mouseenter" | "mouseleave", listener: () => void): void;
}
declare const KeyboardEvent: new (type: "keydown", init: object) => unknown;
interface Frame {
  clientWidth: number;
  contentWindow: { postMessage(message: unknown, target: string): void } | null;
  dispatchEvent(event: unknown): boolean;
}

// Each page's frame size in the chat. The chat's list unmounts rows it scrolls past; a row mounted again starts at this size rather than
// growing from the default under the reader.
const lastSizes = new Map<string, { height: number; width: number }>();
const START_HEIGHT = 160;

// The width a page's measured heights are read at before its frame has one: the chat's column on desktop.
const COLUMN = 700;

/** The height a page's frame last had in the chat, or else its measured height, for a stand-in of the same size while the page gets ready. */
export const lastFrameHeight = (id: string, heights?: ReadonlyArray<readonly [number, number]>) => lastSizes.get(id)?.height ?? (heights ? heightAt(heights, COLUMN) : START_HEIGHT);
// After a width change, a shorter page has to stay shorter this long before the frame follows (see fitFrame).
const SHRINK_AFTER_MS = 400;

const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif';
const MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

/** The CSS variables a page gets from the app's theme and fonts. */
export function useHtmlTheme(colors: HtmlColors) {
  return useMemo(() => {
    const a = readHostAppearance();
    return themeCss(colors, { sans: a.uiFont ? `${a.uiFont}, ${SANS}` : SANS, mono: a.monoFont ? `${a.monoFont}, ${MONO}` : MONO }, seriesFrom(colors.accent));
  }, [colors]);
}

/**
 * An html_render page in a sandboxed frame: scripts run, but with no same-origin access the page can't reach the app's session or storage.
 * `id` names the page across remounts (its source, before images were inlined). The frame fits the page's reported height (or, with `fill`, its container) and follows the app's theme without reloading, so the page keeps its state.
 * `heights`, the daemon's measurements, size a frame the chat hasn't shown yet, so the page arrives at its size instead of growing into it.
 */
export function HtmlFrame({
  html,
  id = html,
  title,
  colors,
  heights,
  fill = false,
  onEscape,
}: {
  html: string;
  id?: string;
  title: string;
  colors: HtmlColors;
  heights?: ReadonlyArray<readonly [number, number]>;
  fill?: boolean;
  onEscape?: () => void;
}) {
  const ref = useRef<Frame | null>(null);
  const escape = useRef(onEscape);
  escape.current = onEscape;
  const css = useHtmlTheme(colors);
  const latest = useRef(css);
  latest.current = css;
  // The page starts in the theme of its first render; later themes are posted, since a new srcdoc would reload it.
  const srcDoc = useMemo(() => htmlPage(html, latest.current), [html]);
  // Width -1 until the page reports one, so its first report always sets the frame: up at once, down after SHRINK_AFTER_MS (fitFrame).
  const shown = useRef(lastSizes.get(id) ?? { height: lastFrameHeight(id, heights), width: -1 });
  const [height, setHeight] = useState(shown.current.height);
  const shrink = useRef<ReturnType<typeof setTimeout>>(undefined);
  const resize = (size: { height: number; width: number }) => {
    shown.current = size;
    if (!fill) lastSizes.set(id, size);
    setHeight(size.height);
  };
  const postTheme = () => ref.current?.contentWindow?.postMessage({ type: "cp-html-theme", css: latest.current }, "*");
  // The frame's width is known from the commit that inserts it, before it's painted: its measured height there.
  useLayoutEffect(() => {
    const width = ref.current?.clientWidth;
    if (!fill && heights && width && !lastSizes.has(id)) resize({ height: heightAt(heights, width), width: -1 });
  }, []);
  // Listen from the commit that inserts the frame: a fast page can report its height before a passive effect runs.
  useLayoutEffect(() => {
    const onMessage: MessageListener = ({ source, data }) => {
      if (source !== ref.current?.contentWindow) return;
      const link = frameLink(data);
      if (link) return void openExternalUrl(link).catch((error: unknown) => console.warn("[chat-polish] Opening a page's link failed", error));
      const key = frameKey(data);
      // Esc only leaves full screen; a shortcut replays on the frame element, so the app's listeners get it as if the chat had focus.
      if (key?.key === "Escape") return escape.current?.();
      if (key) return void ref.current?.dispatchEvent(new KeyboardEvent("keydown", { ...key, bubbles: true, cancelable: true }));
      const report = frameReport(data);
      if (!report) return;
      clearTimeout(shrink.current);
      const next = fitFrame(shown.current, report);
      if (!next) return;
      if (next.later) shrink.current = setTimeout(() => resize(report), SHRINK_AFTER_MS);
      else resize({ height: next.height, width: report.width });
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(shrink.current);
    };
  }, []);
  useEffect(postTheme, [css]);
  return createElement("iframe", {
    ref,
    srcDoc,
    title,
    // No modals, forms or same-origin access; links reach the chat as messages (see BOOT).
    sandbox: FRAME_SANDBOX,
    onLoad: postTheme,
    style: { display: "block", width: "100%", height: fill ? "100%" : height, border: 0, background: "transparent", colorScheme: /color-scheme:light/.test(css) ? "light" : "dark" },
  });
}

/**
 * Whether the pointer is over the element behind `ref`, its frame and buttons included. mouseenter/leave don't fire when the pointer moves
 * between descendants, so moving from the page onto a button keeps it; react-native-web's nested Pressable hover flickered there.
 */
export function useHovered(ref: { current: unknown }) {
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    const el = ref.current as HoverTarget | null;
    if (!el?.addEventListener) return;
    const enter = () => setHovered(true);
    const leave = () => setHovered(false);
    el.addEventListener("mouseenter", enter);
    el.addEventListener("mouseleave", leave);
    return () => {
      el.removeEventListener("mouseenter", enter);
      el.removeEventListener("mouseleave", leave);
    };
  }, [ref]);
  return hovered;
}

/** Room for the macOS window buttons, which Paseo's desktop app draws over its own content, at the start of a full-window header. */
export const windowButtonsInset = () => (typeof navigator !== "undefined" && /Electron/.test(navigator.userAgent) && /Macintosh/.test(navigator.userAgent) ? 80 : 16);

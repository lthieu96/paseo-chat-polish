// Jumping between your prompts (⌥⌘↑/↓), and keeping a pinned chat at the bottom while a row opens.
import { Platform } from "react-native";
import type { ComputedStyle, DomElement, KeyEvent, ResizeObserverClass, WebDocument } from "./dom";

declare const document: WebDocument;
declare function getComputedStyle(el: DomElement): ComputedStyle;
declare const ResizeObserver: ResizeObserverClass;
declare function requestAnimationFrame(cb: () => void): number;
declare function setTimeout(cb: () => void, ms: number): number;

/** The chat on screen: other tabs keep their scrollers mounted but hidden (zero size). */
function visibleChat() {
  return Array.from(document.querySelectorAll('[data-testid="agent-chat-scroll"]')).find((el) => el.getBoundingClientRect().height > 0);
}

let stopExpansionFollow: (() => void) | undefined;

/** Ends a follow started by followExpansionAtBottom, if one is running. */
export const stopFollowingExpansion = () => stopExpansionFollow?.();

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

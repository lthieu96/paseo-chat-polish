import { watchDom, within, type ComputedStyle, type DomElement, type WebDocument } from "./dom";

declare const document: WebDocument;
declare function getComputedStyle(el: DomElement): ComputedStyle;
declare function getSelection(): { toString(): string } | null;

const CLAMP = "data-chat-polish-clamp";
const SHOWN_LINES = 6;
// Clamp only when it hides a real chunk; a 7-line message isn't worth a click.
const CLAMP_FROM_LINES = 9;
const CLAMP_CSS = `
[${CLAMP}] { cursor: pointer; }
[${CLAMP}]:not([data-cp-attach]) > :last-child { overflow: hidden; }
[${CLAMP}="closed"]:not([data-cp-attach]) > :last-child { max-height: var(--chat-polish-max); -webkit-mask-image: linear-gradient(#000 55%, transparent); mask-image: linear-gradient(#000 55%, transparent); }
/* Beside attachments the text is its own bubble: a mask would fade the bubble too, so it ends under a fade to the bubble's color. */
[${CLAMP}="closed"][data-cp-attach] [data-message-text] { max-height: calc(var(--chat-polish-max) + 20px); overflow: hidden; }
[${CLAMP}="closed"][data-cp-attach] [data-message-text]::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 3em; background: linear-gradient(transparent, var(--colors-surface3)); }
[${CLAMP}]::after { content: "Show full message"; margin-top: 8px; font-size: 12px; font-weight: 500; color: var(--chat-polish-muted); opacity: 0.75; }
[${CLAMP}="open"]::after { content: "Show less"; }
:root[data-cp-lang="zh"] [${CLAMP}]::after { content: "显示完整消息"; }
:root[data-cp-lang="zh"] [${CLAMP}="open"]::after { content: "收起"; }
`;

/**
 * Clamps long user messages to six lines with a fade while `enabled()`; clicking the bubble toggles it.
 * Paseo keeps its own bubble, so rewind, copy, timestamps and attachments still work. Returns cleanup.
 * ponytail: the bubble is the grandchild of [data-testid="user-message"] without a testID (from 0.14 a "Sent by" button may
 * precede it) and its text the bubble's last child; breaks if Paseo restructures the message. From Paseo 0.14 a native preview wraps the text and clamps long
 * prompts itself, so bubbles with nested text are left to it, except beside attachments, where restyle-css lifts its clamp.
 */
export function clampUserMessages(enabled: () => boolean) {
  const bound = new Map<DomElement, (event: { target: unknown }) => void>();
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
        const bubble = message.firstElementChild?.querySelector(":scope > div:not([data-testid])");
        const nested = bubble?.querySelector(":scope > * [data-message-text]");
        // Nested text with sibling rows sits beside attachments (see tagParts).
        const text = nested ? (nested.parentElement?.children.length ?? 0) > 1 ? nested : null : bubble?.lastElementChild;
        if (!bubble || !text || bound.has(bubble)) continue;
        const css = getComputedStyle(text);
        const line = parseFloat(css.lineHeight) || parseFloat(css.fontSize) * 1.4;
        if (!line || text.scrollHeight < line * CLAMP_FROM_LINES) continue;
        bubble.style.setProperty("--chat-polish-max", `${Math.round(line * SHOWN_LINES)}px`);
        bubble.style.setProperty("--chat-polish-muted", css.color);
        bubble.setAttribute(CLAMP, "closed");
        // Selecting text inside the bubble shouldn't toggle it.
        const onClick = (event: { target: unknown }) => {
          if (getSelection()?.toString() || (event.target as DomElement).closest?.('[data-cp-part="att-images"], [data-cp-part="att-files"]')) return;
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

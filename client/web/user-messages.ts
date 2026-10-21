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

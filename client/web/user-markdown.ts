import { parseUserMarkdown } from "../../shared/user-markdown";
import { watchDom, within, type DomElement, type WebDocument } from "./dom";

declare const document: WebDocument;

const TEXT = '[data-testid="user-message"] [data-message-text]';
const DONE = "data-cp-md";
const MONO = "var(--cp-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)";
const WELL = "color-mix(in srgb, var(--colors-foreground) 8%, transparent)";
const CSS = `
[${DONE}] > [data-cp-md-text] { display: block; white-space: pre-wrap; }
[${DONE}] > pre { display: block; margin: 8px 0; padding: 8px 10px; border-radius: 8px; background: ${WELL}; font-family: ${MONO}; font-size: var(--cp-code, 12.5px); line-height: 1.5; white-space: pre; overflow-x: auto; tab-size: 2; cursor: text; }
[${DONE}] > :first-child { margin-top: 0; }
[${DONE}] > :last-child { margin-bottom: 0; }
[${DONE}] > pre[data-cp-md-lang]::before { content: attr(data-cp-md-lang); display: block; margin-bottom: 4px; font-size: 11px; line-height: 16px; color: var(--colors-foreground-muted); }
[${DONE}] code[data-cp-md-inline] { font-family: ${MONO}; font-size: 0.88em; padding: 1px 5px; border-radius: 5px; background: ${WELL}; overflow-wrap: anywhere; }
`;

/**
 * Draws fenced code blocks and inline code in the user's own messages, which Paseo shows as plain text, while `enabled()`.
 * Paseo's text element keeps its place (so rewind, copy, the timestamp, attachments and the clamps keep working); only its
 * children are swapped for formatted ones, and the source is kept to put back. Messages without code are left untouched.
 * ponytail: Paseo renders the text as one string child of [data-message-text]; React overwrites it wholesale if the text
 * changes, which `settled` notices and redraws. Returns cleanup.
 */
export function renderUserMarkdown(enabled: () => boolean) {
  const sources = new Map<DomElement, string>();
  let style: DomElement | undefined;
  const restore = (el: DomElement) => {
    const source = sources.get(el);
    sources.delete(el);
    if (source === undefined || !el.hasAttribute(DONE)) return;
    el.removeAttribute(DONE);
    el.textContent = source;
  };
  const release = () => {
    for (const el of [...sources.keys()]) restore(el);
  };
  const draw = (els: DomElement[]) => {
    if (!enabled()) return release();
    for (const [el] of sources) if (!el.isConnected) sources.delete(el);
    for (const el of els) {
      // Still ours: drawn, and React hasn't replaced the children since.
      if (el.hasAttribute(DONE) && el.querySelector(":scope > [data-cp-md-part]")) continue;
      const source = el.textContent ?? "";
      const blocks = parseUserMarkdown(source);
      if (!blocks) continue;
      if (!style) {
        style = document.createElement("style");
        style.textContent = CSS;
        document.head.appendChild(style);
      }
      el.textContent = "";
      for (const block of blocks) {
        if (block.kind === "code") {
          const pre = document.createElement("pre");
          pre.setAttribute("data-cp-md-part", "");
          if (block.lang) pre.setAttribute("data-cp-md-lang", block.lang);
          pre.textContent = block.code;
          el.appendChild(pre);
          continue;
        }
        const text = document.createElement("div");
        text.setAttribute("data-cp-md-part", "");
        text.setAttribute("data-cp-md-text", "");
        for (const part of block.parts) {
          const span = document.createElement(part.code ? "code" : "span");
          if (part.code) span.setAttribute("data-cp-md-inline", "");
          span.textContent = part.text;
          text.appendChild(span);
        }
        el.appendChild(text);
      }
      el.setAttribute(DONE, "");
      sources.set(el, source);
    }
  };
  return watchDom(
    {
      added: (roots) => draw(within(roots, TEXT).concat(roots.flatMap((root) => (root.closest(TEXT) ? [root.closest(TEXT)!] : [])))),
      // React resets the text as plain text nodes, which `added` never sees; a pref switch lands here too.
      settled: () => draw(Array.from(document.querySelectorAll(TEXT))),
      removed: () => {
        for (const [el] of sources) if (!el.isConnected) sources.delete(el);
      },
    },
    () => {
      release();
      style?.remove();
      style = undefined;
    },
  );
}

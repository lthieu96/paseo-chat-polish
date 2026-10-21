import { Platform } from "react-native";
import type { ComputedStyle, DomElement, WebDocument } from "./dom";

declare const document: WebDocument;
declare function getComputedStyle(el: DomElement): ComputedStyle;
declare function setTimeout(cb: () => void, ms: number): number;
declare const innerWidth: number;

const SELECT_CSS = `
[data-cp-select] { position: fixed; z-index: 10000; display: flex; align-items: center; gap: 1px; padding: 3px; border: 1px solid var(--colors-border); border-radius: 8px; background-color: var(--cp-control, var(--colors-surface2)); box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45); animation: cp-pop 40ms ease-out; }
:root:is(.light, .pluginLight) [data-cp-select] { background-color: var(--cp-raised, var(--colors-surface1)); }
[data-cp-select] > span { padding: 0 4px 0 7px; color: var(--cp-muted, var(--colors-foreground-muted)); font-size: 12px; }
[data-cp-select] > button { height: 24px; padding: 0 8px; border: 0; border-radius: 6px; background: transparent; color: var(--cp-fg, var(--colors-foreground)); font-family: inherit; font-size: 12px; font-weight: 500; white-space: nowrap; cursor: pointer; }
[data-cp-select] > button:hover { background-color: color-mix(in srgb, var(--cp-control, var(--colors-surface2)), var(--cp-fg, var(--colors-foreground)) 12%); }
`;
const REPLY = '[data-testid="assistant-message"]';
type SelNode = { nodeType: number; parentElement: DomElement | null };
type Selected = { isCollapsed: boolean; rangeCount: number; toString(): string; getRangeAt(i: 0): { startContainer: SelNode; endContainer: SelNode; getBoundingClientRect(): ReturnType<DomElement["getBoundingClientRect"]> } };
type CopyEvent = { target: unknown; key?: string; shiftKey?: boolean; clipboardData?: { setData(type: string, data: string): void }; preventDefault(): void; stopImmediatePropagation(): void };
const selDoc = document as unknown as {
  getSelection(): Selected | null;
  execCommand(command: "copy"): boolean;
  addEventListener(type: string, listener: (event: CopyEvent) => void, capture?: boolean): void;
  removeEventListener(type: string, listener: (event: CopyEvent) => void, capture?: boolean): void;
  body: DomElement;
};

/**
 * Selecting text in a reply shows "Copy  Text  Markdown" above it. Markdown is what ⌘C already copies (Paseo's
 * copy handler on replies turns the selection into markdown), so that button just runs a copy; plain text
 * swaps in the selection's rendered text. Returns cleanup.
 */
export function selectionCopyMenu(enabled: () => boolean) {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  const style = document.createElement("style");
  style.textContent = SELECT_CSS;
  document.head.appendChild(style);
  let menu: DomElement | undefined;
  const hide = () => (menu?.remove(), (menu = undefined));
  const inMenu = (target: unknown) => !!menu && !!(target as DomElement | null)?.closest?.("[data-cp-select]");
  const copyPlain = (text: string) => {
    const swap = (event: CopyEvent) => {
      event.clipboardData?.setData("text/plain", text);
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    selDoc.addEventListener("copy", swap, true);
    selDoc.execCommand("copy");
    selDoc.removeEventListener("copy", swap, true);
  };
  const el = (n: SelNode) => (n.nodeType === 1 ? (n as unknown as DomElement) : n.parentElement);
  // Above the selection, or below it near the top; hidden once the selection scrolls out of view.
  const place = () => {
    const sel = selDoc.getSelection();
    if (!menu || !sel?.rangeCount) return hide();
    const box = sel.getRangeAt(0).getBoundingClientRect();
    if (box.bottom < 0 || box.height === 0) return hide();
    const { width, height } = menu.getBoundingClientRect();
    const top = box.top - height - 12 < 8 ? box.bottom + 12 : box.top - height - 12;
    menu.style.setProperty("top", `${Math.round(top)}px`);
    menu.style.setProperty("left", `${Math.round(Math.min(Math.max(box.left + box.width / 2 - width / 2, 8), innerWidth - width - 8))}px`);
  };
  const show = () => {
    hide();
    const sel = selDoc.getSelection();
    if (!enabled() || !sel || sel.isCollapsed || !sel.rangeCount || !sel.toString().trim()) return;
    const range = sel.getRangeAt(0);
    const reply = el(range.startContainer)?.closest(REPLY) ?? el(range.endContainer)?.closest(REPLY);
    if (!reply) return;
    const m = (menu = document.createElement("div"));
    m.setAttribute("data-cp-select", "");
    // The menu sits outside #root, where Paseo sets its UI font.
    m.style.setProperty("font-family", getComputedStyle(reply).fontFamily);
    // Pressing a button would otherwise clear the selection before it copies.
    (m as unknown as { addEventListener(type: "mousedown", l: (e: CopyEvent) => void): void }).addEventListener("mousedown", (e) => e.preventDefault());
    const lead = document.createElement("span");
    lead.textContent = "Copy";
    m.appendChild(lead);
    for (const [label, copy] of [
      ["Text", () => copyPlain(sel.toString())],
      ["Markdown", () => selDoc.execCommand("copy")],
    ] as const) {
      const button = document.createElement("button");
      button.textContent = label;
      button.addEventListener("click", () => {
        copy();
        lead.textContent = "Copied";
        setTimeout(() => menu === m && hide(), 700);
      });
      m.appendChild(button);
    }
    selDoc.body.appendChild(m);
    place();
  };
  const onUp = (e: CopyEvent) => void (inMenu(e.target) || setTimeout(show, 0));
  const onDown = (e: CopyEvent) => void (inMenu(e.target) || hide());
  const onKey = (e: CopyEvent) => void (e.key === "Escape" ? hide() : e.shiftKey && setTimeout(show, 0));
  const onSelection = () => void (selDoc.getSelection()?.isCollapsed && hide());
  const events: Array<[string, (e: CopyEvent) => void, boolean]> = [["mouseup", onUp, false], ["mousedown", onDown, false], ["keyup", onKey, false], ["selectionchange", onSelection, false], ["scroll", place, true]];
  for (const [type, l, capture] of events) selDoc.addEventListener(type, l, capture);
  return () => {
    for (const [type, l, capture] of events) selDoc.removeEventListener(type, l, capture);
    hide();
    style.remove();
  };
}

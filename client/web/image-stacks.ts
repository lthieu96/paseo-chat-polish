// Stacks of images in replies Paseo draws itself (a reply with text and images; image-only replies are the plugin's ImagesItem).
import { Platform } from "react-native";
import { t } from "../i18n";
import { openStackViewer, stackViewerHosted, type StackImage } from "../stack-viewer";
import { watchDom, within, type DomElement, type KeyEvent, type MutationObserverClass, type WebDocument } from "./dom";
import { imageRuns, type ImageNode } from "./image-runs";
import { icon } from "./icons";
import { MD } from "./selectors";

declare const document: WebDocument;
declare const MutationObserver: MutationObserverClass;
declare function setTimeout(cb: () => void, ms: number): number;
declare function clearTimeout(id: number): void;

// Only with Image stacks on (index.client.tsx turns it off while Restyle is off: the card sizes and colours are its
// variables), and off with the Inline image choice, like the thumbnails.
const ON = ':root:not([data-cp-rt-images="native"])[data-cp-rt-stacks="on"]';
const CLICK_MODE = `${ON}[data-cp-rt-stackopen="click"]`;
const STACK = "data-cp-stack";
const CARD = "data-cp-card";
const HIDDEN = "data-cp-stacked";
const HOLE = "data-cp-stack-hole";
const OPEN = "data-cp-stack-open";
const BADGE = "data-cp-badge";
// Cards past the third, hidden while the stack is closed.
const FAR = "data-cp-far";
const ACTIVE = "data-cp-active";
// The stack holds a row (the cards, scrolling sideways when open) and a fold button that stays put while the row scrolls.
const ROW = "data-cp-stack-row";
const FOLD = "data-cp-fold";
// Opened an image from the row: the stack stays open until its fold button is pressed.
const PINNED = "data-cp-pinned";
// Cards outside the row's view when it opens: placed at once, no animation nobody would see.
const STILL = "data-cp-still";
const CLOSING = "data-cp-closing";
// Folding, step one: the row is still laid out while its cards (all but the first, which sits where the pile's face
// will) shrink away toward it; step two (CLOSING) fans the two cards behind the face out from under it.
const FOLDING = "data-cp-folding";
const FOLD_MS = 110;
const FOLD_MASK = icon("Minimize2", '<path d="m14 10 7-7"/><path d="M20 10h-6V4"/><path d="m3 21 7-7"/><path d="M4 14h6v6"/>');
const GAP = 8;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
// Hover intent: a pointer crossing a stack while scrolling doesn't spread it.
const HOVER_MS = 150;

// The plugin draws the stack itself as one element before the first image; Paseo's images in the run are only hidden.
// Closed, the cards fan out behind the first one; open (hover or click), every card deals into its own slot in one row that
// scrolls sideways. Cards only ever move a few pixels: nothing flies across the row, which flickered with many images.
const STACK_CSS = `
[${STACK}] { display: none; }
${ON} ${MD} img[${HIDDEN}], ${ON} ${MD} [${HOLE}] { display: none !important; }
/* The box covers the strip the fanned cards stick up into (padding-top), so a pointer resting there stays inside when the
   stack opens; the bottom keeps room for the row's scrollbar, so opening never changes the height. Closed, only the pile
   takes hover; open, the whole row does. One cursor over all of it, gaps included, or it flickers as the pointer crosses. */
${ON} ${MD} [${STACK}] {
  cursor: zoom-in; display: block; position: relative; box-sizing: content-box; width: calc(var(--cp-thumb-w) + 18px); max-width: 100%;
  height: calc(var(--cp-thumb-h) + 12px); padding-top: 16px; margin: 4px 0 2px;
}
/* Open, the box reaches 14px past the scrollbar (padding, taken back by the margin so nothing moves): a pointer that
   overshoots the bar on its way to it or while dragging it stays inside instead of folding the stack. */
${ON} ${MD} [${STACK}][${OPEN}] { width: 100%; padding-bottom: 14px; margin-bottom: -12px; }
${ON} ${MD} [${ROW}] { position: absolute; inset: 0; }
${ON} ${MD} [${OPEN}] > [${ROW}] { bottom: 14px; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; }
/* A thin bar in the bottom room, in the theme's text color. Paseo sets scrollbar-color on the page, which turns off
   ::-webkit-scrollbar styling, so this uses the standard properties. */
${ON} ${MD} [${OPEN}] > [${ROW}] { scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--cp-fg) 32%, transparent) transparent; }
${ON} ${MD} [${CARD}] {
  position: absolute; left: 0; top: 16px; z-index: calc(100 - var(--i)); width: var(--cp-thumb-w); height: var(--cp-thumb-h); box-sizing: border-box;
  border: 1px solid var(--cp-rule); border-radius: 8px; background: var(--cp-raised) center / cover no-repeat; cursor: zoom-in;
  transform: translate(calc(min(var(--i), 2) * 9px), calc(min(var(--i), 2) * -6.5px)) rotate(calc(min(var(--i), 2) * 2.5deg));
  transition: opacity 160ms ease-out, translate 160ms ${EASE}, border-color 160ms ease-out, box-shadow 160ms ease-out;
}
/* Hidden at once on a fold: fading, they'd show through the pile while it fades back in. */
${ON} ${MD} [${STACK}]:not([${OPEN}]) [${CARD}][${FAR}] { opacity: 0; pointer-events: none; transition: none; }
${ON} ${MD} [${CARD}]:focus-visible { outline: 2px solid var(--cp-accent); outline-offset: 2px; }
${ON} ${MD} [${OPEN}] [${CARD}] {
  transform: translateX(calc(var(--i) * (var(--cp-thumb-w) + ${GAP}px)));
  animation: cp-deal 220ms ${EASE} calc((min(var(--i), 8) - 1) * 22ms) backwards;
}
/* The face (the card with the badge) sits in the same spot closed and open, so it stays put; dealing it too made it blink. */
${ON} ${MD} [${OPEN}] [${CARD}][${STILL}], ${ON} ${MD} [${OPEN}] [${CARD}][${BADGE}] { animation: none; }
${ON} ${MD} [${FOLDING}] [${CARD}]:not([${BADGE}]):not([${STILL}]) { animation: cp-fold-out ${FOLD_MS}ms cubic-bezier(0.4, 0, 1, 1) forwards; }
${ON} ${MD} [${CLOSING}] [${CARD}]:not([${FAR}]):not([${BADGE}]) { animation: cp-fan-in 150ms ${EASE} backwards; }
@keyframes cp-deal { from { opacity: 0; scale: 0.88; translate: 0 8px; } }
@keyframes cp-fold-out { to { opacity: 0; scale: 0.92; translate: -16px 0; } }
@keyframes cp-fan-in { from { opacity: 0; transform: none; } }
/* The card under the pointer in the spread row: raised, with one even 2px accent edge (its own border turned accent plus
   a 1px ring outside it; scaling blurred the edges unevenly); the rest dim. */
${ON} ${MD} [${STACK}][${ACTIVE}] [${CARD}] { opacity: 0.62; }
/* Folding, the face (the card with the badge) undims at once: the cards fanning back out behind it would show through. */
${ON} ${MD} [${FOLDING}] [${CARD}][${BADGE}] { opacity: 1; }
${ON} ${MD} [${OPEN}] [${CARD}][${ACTIVE}] { z-index: 200; opacity: 1; translate: 0 -4px; border-color: var(--cp-accent); box-shadow: 0 0 0 1px var(--cp-accent), 0 4px 8px rgba(0, 0, 0, 0.28); }
/* "+N" on the closed pile only; the open row shows every image. */
${ON} ${MD} [${STACK}]:not([${OPEN}]) [${CARD}][${BADGE}]::after {
  content: attr(${BADGE}); position: absolute; right: 8px; bottom: 8px; padding: 3px 8px; border-radius: 999px;
  border: 1px solid var(--cp-rule); background: color-mix(in srgb, var(--cp-raised) 88%, transparent); color: var(--cp-fg);
  font: 600 12px/1.2 -apple-system, BlinkMacSystemFont, system-ui, sans-serif; font-variant-numeric: tabular-nums;
  animation: cp-badge-in 200ms ease-out 120ms both;
}
@keyframes cp-badge-in { from { opacity: 0; transform: translateY(2px); } }
[${FOLD}] { display: none; }
/* Pinned (an image was opened from the row), or open in Click mode, where touch has no pointer leaving to fold it. */
${ON} ${MD} [${PINNED}] > [${FOLD}], ${CLICK_MODE} ${MD} [${OPEN}] > [${FOLD}] {
  display: block; position: absolute; top: 0; right: 4px; z-index: 300; width: 24px; height: 24px; padding: 0; box-sizing: border-box;
  border: 1px solid var(--cp-rule); border-radius: 999px; background: var(--cp-raised); color: var(--cp-muted); cursor: pointer;
  animation: cp-badge-in 160ms ease-out both;
}
${ON} ${MD} [${OPEN}] > [${FOLD}]::before {
  content: ""; position: absolute; inset: 5px; background: currentColor; -webkit-mask: ${FOLD_MASK} center / contain no-repeat; mask: ${FOLD_MASK} center / contain no-repeat;
}
${ON} ${MD} [${OPEN}] > [${FOLD}]:hover { color: var(--cp-fg); border-color: var(--cp-accent); }
@media (prefers-reduced-motion: reduce) { ${MD} [${CARD}], ${MD} [${FOLD}] { transition: none !important; animation: none !important; } ${MD} [${CARD}]::after { animation: none !important; } }
`;

type Placed = DomElement & { insertAdjacentElement(where: "beforebegin", el: DomElement): void };
type PressEvent = { target: unknown; preventDefault(): void; stopImmediatePropagation(): void };
type EventDoc = {
  addEventListener(type: "click" | "keydown", listener: (event: PressEvent & Partial<KeyEvent>) => void, capture?: boolean): void;
  removeEventListener(type: "click" | "keydown", listener: (event: PressEvent & Partial<KeyEvent>) => void, capture?: boolean): void;
};

type Hoverable = DomElement & { addEventListener(type: "mousemove", listener: (event: { target: unknown }) => void): void };
type UpDoc = { addEventListener(type: "mouseup", listener: () => void, options: { once: true }): void };
type Scrollable = DomElement & { scrollLeft: number; scrollTo(options: { left: number; behavior: "smooth" }): void };
type Loadable = DomElement & { addEventListener(type: "load", listener: () => void): void };

// The resolved URL (the property, not the attribute), so a relative source still reads and loads.
const src = (img: DomElement) => (img as DomElement & { src?: string }).src || (img.getAttribute("src") ?? "");
const paint = (card: DomElement, img: DomElement) => {
  const bg = `url("${src(img).replace(/["\\]/g, "\\$&").replace(/[\n\r]/g, "")}")`;
  if (card.style.getPropertyValue("background-image") !== bg) card.style.setProperty("background-image", bg);
};

/**
 * Two or more images in a row in a reply show as a stack. Hovering (or a click, with Spread on: Click) spreads all of them
 * into one row that scrolls sideways; clicking an image there opens the viewer, ← → through this stack only, and keeps
 * the stack open (no longer folding when the pointer leaves) until its fold button, top right, is pressed. In Click mode
 * the fold button shows on any open stack, since touch has no pointer leaving. Without a mounted viewer host (sidebar
 * hidden), Paseo's own viewer opens the one image. Browser only. Returns cleanup.
 * shortcut: relies on Paseo drawing reply images as plain <img> inside .enrm-text (Paseo 0.12+), and the stack element
 * sits inside a paragraph Paseo's renderer owns; revisit if Paseo changes its reply renderer.
 */
export function stackImages() {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  const style = document.createElement("style");
  style.textContent = STACK_CSS;
  document.head.appendChild(style);
  const byClick = () => document.documentElement.getAttribute("data-cp-rt-stackopen") === "click";
  const on = () => document.documentElement.getAttribute("data-cp-rt-images") !== "native" && document.documentElement.getAttribute("data-cp-rt-stacks") === "on";

  // Each stack element and the images it stands for.
  const stacks = new Map<DomElement, DomElement[]>();
  const timers = new Map<DomElement, number>();
  const loading = new WeakSet<DomElement>();
  let warned = false;
  // Just opened: the card under the pointer that opened it isn't lit (lighting it dimmed every card as it dealt in); the
  // highlight starts once the pointer moves to another card. undefined: no move yet since opening.
  const quiet = new Map<DomElement, DomElement | null | undefined>();
  // Folded with its button: the pointer is still over the stack, so hover mustn't reopen it until the pointer leaves.
  const held = new WeakSet<DomElement>();

  // Marks the card under the pointer, and the stack, so the other cards dim.
  const activate = (stack: DomElement, card: DomElement | null) => {
    for (const el of within([stack], `[${ACTIVE}]`)) if (el !== card) el.removeAttribute(ACTIVE);
    if (card) {
      card.setAttribute(ACTIVE, "");
      stack.setAttribute(ACTIVE, "");
    } else stack.removeAttribute(ACTIVE);
  };

  const rowOf = (stack: DomElement) => stack.firstElementChild!;

  /** Folds the stack, unless it's pinned (an image was opened from it) and this isn't its fold button. */
  const close = (stack: DomElement, force = false) => {
    // Already folding: its timer finishes the fold (clearing it here would leave the stack stuck half folded).
    if (stack.hasAttribute(FOLDING)) return;
    clearTimeout(timers.get(stack) ?? 0);
    timers.delete(stack);
    if (!stack.hasAttribute(OPEN) || (stack.hasAttribute(PINNED) && !force)) return;
    // The dimmed cards stay dimmed while they fold away; undimming first made them flash bright before fading out.
    stack.removeAttribute(PINNED);
    quiet.delete(stack);
    stack.setAttribute(FOLDING, "");
    // A scrolled row glides back to the start while its cards fold, so the face is in place when the pile returns.
    const row = rowOf(stack) as Scrollable;
    if (row.scrollLeft) row.scrollTo({ left: 0, behavior: "smooth" });
    timers.set(stack, setTimeout(() => {
      timers.delete(stack);
      activate(stack, null);
      stack.removeAttribute(FOLDING);
      stack.removeAttribute(OPEN);
      Array.from(row.children).forEach((card, i) => {
        card.removeAttribute(STILL);
        if (i >= 3) card.setAttribute("tabindex", "-1");
      });
      // Once: a remounted reply mustn't replay it.
      stack.setAttribute(CLOSING, "");
      setTimeout(() => stack.removeAttribute(CLOSING), 170);
    }, FOLD_MS));
  };

  const open = (stack: DomElement) => {
    clearTimeout(timers.get(stack) ?? 0);
    timers.delete(stack);
    stack.removeAttribute(FOLDING);
    stack.removeAttribute(CLOSING);
    if (stack.hasAttribute(OPEN)) return;
    stack.setAttribute(OPEN, "");
    quiet.set(stack, undefined);
    const row = rowOf(stack);
    const cards = Array.from(row.children);
    const step = (cards[0]?.getBoundingClientRect().width ?? 0) + GAP;
    // Only the cards in view deal in; the rest are placed at once.
    const inView = step > GAP ? Math.ceil(row.clientWidth / step) : cards.length;
    cards.forEach((card, i) => {
      if (i >= inView) card.setAttribute(STILL, "");
      else card.removeAttribute(STILL);
      card.setAttribute("tabindex", "0");
    });
  };

  const makeStack = (face: DomElement) => {
    const stack = document.createElement("div");
    stack.setAttribute(STACK, "");
    const row = document.createElement("div");
    row.setAttribute(ROW, "");
    stack.appendChild(row);
    const fold = document.createElement("button");
    fold.setAttribute(FOLD, "");
    fold.setAttribute("type", "button");
    fold.setAttribute("aria-label", t("web.foldStack"));
    stack.appendChild(fold);
    // mousemove, not mouseover: the card that ends up under a resting pointer as the row deals out lights up on its first move.
    (stack as Hoverable).addEventListener("mousemove", (e) => {
      const card = (e.target as DomElement | null)?.closest?.(`[${CARD}]`) ?? null;
      if (held.has(stack)) return;
      // Back in while it folds (hover mode): it opens again.
      if (stack.hasAttribute(FOLDING) && !byClick()) return open(stack);
      if (stack.hasAttribute(OPEN)) {
        if (quiet.has(stack)) {
          const first = quiet.get(stack);
          if (first === undefined) return void quiet.set(stack, card);
          if (card === first || !card) return;
          quiet.delete(stack);
        }
        return card && !card.hasAttribute(ACTIVE) ? activate(stack, card) : undefined;
      }
      if (!byClick() && !timers.has(stack)) timers.set(stack, setTimeout(() => (timers.delete(stack), open(stack)), HOVER_MS));
    });
    stack.addEventListener("mouseleave", (e) => {
      held.delete(stack);
      if (stack.hasAttribute(PINNED)) return activate(stack, null);
      // Dragging the scrollbar out of the box: fold on release, and only if the pointer is still outside.
      if ((e as { buttons?: number }).buttons) return (document as unknown as UpDoc).addEventListener("mouseup", () => setTimeout(() => stack.matches(":hover") || close(stack), 0), { once: true });
      close(stack);
    });
    (face as Placed).insertAdjacentElement("beforebegin", stack);
    return stack;
  };

  // Shows an image again, unless another stack has it (two runs that merged, or a stack that moved to a new face).
  const release = (img: DomElement, from: DomElement) => {
    for (const [other, run] of stacks) if (other !== from && run.includes(img)) return;
    img.removeAttribute(HIDDEN);
  };

  const drop = (stack: DomElement) => {
    for (const img of stacks.get(stack) ?? []) release(img, stack);
    close(stack, true);
    stack.remove();
    stacks.delete(stack);
  };

  const fill = (stack: DomElement, run: DomElement[]) => {
    const row = rowOf(stack);
    while (row.children.length > run.length) row.lastElementChild?.remove();
    while (row.children.length < run.length) {
      const card = document.createElement("span");
      card.setAttribute(CARD, "");
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      row.appendChild(card);
    }
    run.forEach((img, i) => {
      const card = row.children[i]!;
      paint(card, img);
      // Paseo sets a placeholder src first and swaps in the real image later, an attribute change watchDom doesn't report.
      if (!loading.has(img)) {
        loading.add(img);
        (img as Loadable).addEventListener("load", () => {
          for (const [at, run] of stacks) if (run.includes(img)) paint(rowOf(at).children[run.indexOf(img)]!, img);
        });
      }
      card.style.setProperty("--i", String(i));
      if (i >= 3) card.setAttribute(FAR, "");
      else card.removeAttribute(FAR);
      // Hidden cards of a closed stack are out of the tab order (invisible stops, with an invisible focus ring).
      const tab = i < 3 || stack.hasAttribute(OPEN) ? "0" : "-1";
      if (card.getAttribute("tabindex") !== tab) card.setAttribute("tabindex", tab);
      card.setAttribute("aria-label", t("web.openImage", { alt: img.getAttribute("alt") || t("web.image"), index: i + 1, total: run.length }));
      if (!img.hasAttribute(HIDDEN)) img.setAttribute(HIDDEN, "");
    });
    row.children[0]?.setAttribute(BADGE, `+${run.length - 1}`);
    // Images that left this stack (text streamed in between) show again; one of their own won't stack them a second time.
    const was = stacks.get(stack) ?? [];
    stacks.set(stack, run);
    for (const img of was) if (!run.includes(img)) release(img, stack);
  };

  const mark = (reply: DomElement) => {
    for (const hole of within([reply], `[${HOLE}]`)) hole.removeAttribute(HOLE);
    const kept = new Set<DomElement>();
    for (const run of imageRuns(reply as unknown as ImageNode).map((r) => r as unknown as DomElement[])) {
      if (run.length < 2) continue;
      const face = run[0]!;
      const before = face.previousElementSibling;
      const stack = before?.hasAttribute(STACK) ? before : makeStack(face);
      fill(stack, run);
      kept.add(stack);
      // A paragraph left holding only hidden images would leave its margin as a gap.
      for (const img of run.slice(1)) {
        const p = img.parentElement;
        if (p && p !== reply && !p.querySelector(`[${STACK}]`) && !(p.textContent ?? "").trim() && Array.from(p.querySelectorAll("img")).every((n) => n.hasAttribute(HIDDEN))) p.setAttribute(HOLE, "");
      }
    }
    // Stacks that stopped being one (a reply that streamed text between its images) give their images back.
    for (const stack of [...stacks.keys()]) if (!stack.isConnected || (stack.closest(MD) === reply && !kept.has(stack))) drop(stack);
  };

  const process = (roots: DomElement[]) => {
    if (!on()) return;
    const replies = new Set<DomElement>(within(roots, MD));
    for (const root of roots) {
      const reply = root.closest?.(MD);
      if (reply) replies.add(reply);
    }
    for (const reply of replies) if (reply.isConnected) mark(reply);
  };

  const show = (card: DomElement) => {
    const stack = card.parentElement?.parentElement;
    const run = stack && stacks.get(stack);
    if (!run) return false;
    // Spread on: Click — the first press spreads the stack, the next opens an image.
    if (byClick() && !stack.hasAttribute(OPEN)) return open(stack), true;
    const index = Math.max(0, Array.from(card.parentElement!.children).indexOf(card));
    // shortcut: with no viewer host (the sidebar is hidden), forward to Paseo's handler on the hidden image: one image, no
    // ← →, and nothing opens if Paseo stops handling clicks there; upgrade if a host can be mounted outside the sidebar.
    if (!stackViewerHosted()) {
      const img = run[index];
      if (!img) return false;
      if (!warned) console.warn("[chat-polish] No stack viewer mounted (sidebar hidden); opening the image in Paseo's viewer");
      warned = true;
      img.click();
      return true;
    }
    // Opening an image from the row keeps it open for the next one; the fold button closes it.
    if (stack.hasAttribute(OPEN)) stack.setAttribute(PINNED, "");
    const images: StackImage[] = run.map((img) => ({ alt: img.getAttribute("alt") || t("web.image"), url: src(img) }));
    openStackViewer(images, index);
    return true;
  };

  // Capture phase, so the press never reaches Paseo's own handlers.
  const onPress = (e: PressEvent & Partial<KeyEvent>) => {
    if (!on() || (e.key !== undefined && e.key !== "Enter" && e.key !== " ")) return;
    const fold = (e.target as DomElement | null)?.closest?.(`${MD} [${FOLD}]`);
    if (fold?.parentElement) {
      held.add(fold.parentElement);
      close(fold.parentElement, true);
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    const card = (e.target as DomElement | null)?.closest?.(`${MD} [${CARD}]`);
    if (card && show(card)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  const events = document as unknown as EventDoc;
  events.addEventListener("click", onPress, true);
  events.addEventListener("keydown", onPress, true);

  const unwatch = watchDom({ added: process, settled: process }, () => {});
  // Turning stacks on groups every reply now, not on the next DOM change.
  const prefs = new MutationObserver(() => process([document.documentElement]));
  prefs.observe(document.documentElement, { childList: false, subtree: false, attributes: true, attributeFilter: ["data-cp-rt-stacks", "data-cp-rt-images"] });
  return () => {
    prefs.disconnect();
    unwatch();
    events.removeEventListener("click", onPress, true);
    events.removeEventListener("keydown", onPress, true);
    style.remove();
    for (const stack of [...stacks.keys()]) drop(stack);
    for (const hole of Array.from(document.querySelectorAll(`[${HOLE}]`))) hole.removeAttribute(HOLE);
  };
}

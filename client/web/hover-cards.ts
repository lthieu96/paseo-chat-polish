// Glides between hover surfaces: the sidebar's workspace cards and the chat outline's preview.
import { within, type ComputedStyle, type DomElement, type MutationObserverClass, type WebDocument } from "./dom";

declare const document: WebDocument;
declare function getComputedStyle(el: DomElement): ComputedStyle;
declare const MutationObserver: MutationObserverClass;
declare function setTimeout(cb: () => void, ms: number): number;

/**
 * Moving between sessions, Paseo keeps each workspace hover card up 100ms after the pointer leaves its row and mounts the next one over
 * it; as cards close it moves their content between elements and drops the spare one as a FadeOut exit copy. Only the card for the
 * hovered row shows, gliding from where the shown card was drawn; exit copies show only once no card is left, so closing still fades.
 */
const WS_CARD = '[data-testid="workspace-hover-card"]';
const WS_ROW = '[data-testid^="sidebar-workspace-row-"]';
const GLIDE_MS = 100;
const hoverCards = new Set<DomElement>();
const placedAt = new WeakMap<DomElement, number>();
let placements = 0;
let hoveredRow: DomElement | undefined;
/** The card on screen: its session, resting top, the offset its glide started from (ease-out cubic), and when. Elements come and go under it. */
let shownCard: { el: DomElement; name: string; top: number; dy: number; at: number } | undefined;
const isExit = (card: DomElement) => card.style.getPropertyValue("animation-name") === "FadeOut";
const cardTop = (card: DomElement) => {
  const top = card.style.getPropertyValue("top");
  return !top || top.startsWith("-9999") || isExit(card) ? undefined : parseFloat(top);
};

function syncHoverCards() {
  const placed: DomElement[] = [];
  for (const card of hoverCards) {
    if (!card.isConnected) hoverCards.delete(card);
    else if (cardTop(card) !== undefined) placed.push(card);
  }
  const name = (card: DomElement) => card.querySelector('[data-testid="hover-card-workspace-name"]')?.textContent;
  const hovered = hoveredRow?.isConnected ? placed.filter((card) => hoveredRow!.textContent?.includes(name(card) ?? "\0")) : [];
  const target = (hovered.length ? hovered : placed).reduce<DomElement | undefined>((a, b) => (a && (placedAt.get(a) ?? 0) > (placedAt.get(b) ?? 0) ? a : b), undefined);
  if (target) {
    const top = cardTop(target)!;
    const session = name(target) ?? "";
    // Another session's card: its icons pop in and its text fades in trailing the glide, as it moves over.
    if (shownCard && shownCard.name !== session) {
      target.style.setProperty("--cp-shift", top > shownCard.top ? "-4px" : top < shownCard.top ? "4px" : "0px");
      target.setAttribute("data-cp-swap", target.getAttribute("data-cp-swap") === "a" ? "b" : "a");
    }
    if (shownCard) shownCard.name = session;
    if (shownCard?.el !== target || shownCard.top !== top) {
      const now = Date.now();
      // Read where the shown card is drawn; once Paseo has dropped its element, work it out from the glide (ease-out cubic).
      const matrix = shownCard?.el.isConnected ? getComputedStyle(shownCard.el).transform : "";
      const drawn = matrix.startsWith("matrix(") ? Number(matrix.slice(7, -1).split(",")[5]) : undefined;
      const left = shownCard ? Math.max(0, 1 - (now - shownCard.at) / GLIDE_MS) : 0;
      const dy = shownCard ? shownCard.top + (drawn ?? shownCard.dy * left ** 3) - top : 0;
      target.style.setProperty("--cp-from", `${dy}px`);
      // Two identical keyframes, so a reused card restarts its glide without a forced reflow.
      if (dy) target.setAttribute("data-cp-glide", target.getAttribute("data-cp-glide") === "a" ? "b" : "a");
      shownCard = { el: target, name: session, top, dy, at: now };
    }
  } else shownCard = undefined;
  for (const card of hoverCards) {
    if (target && card !== target) card.setAttribute("data-cp-gone", "");
    else card.removeAttribute("data-cp-gone");
  }
}

function noteHoverCard(card: DomElement) {
  const top = card.style.getPropertyValue("top");
  if (cardTop(card) !== undefined && card.getAttribute("data-cp-top") !== top) {
    card.setAttribute("data-cp-top", top);
    placedAt.set(card, ++placements);
  }
  syncHoverCards();
}

export const notePointer = (event: { target: unknown }) => {
  const target = event.target as DomElement | null;
  const row = target?.closest?.(WS_ROW);
  if (row && row !== hoveredRow) (hoveredRow = row), hoverCards.size && syncHoverCards();
  overTick = target?.closest?.(OUTLINE_TICK) ?? undefined;
  if (ghost) overTick ? moveGhost(overTick) : waitGhost();
};

export function watchHoverCards(roots: DomElement[]) {
  for (const card of within(roots, WS_CARD)) {
    if (hoverCards.has(card)) continue;
    hoverCards.add(card);
    if (!isExit(card)) new MutationObserver(() => noteHoverCard(card)).observe(card, { childList: false, subtree: false, attributes: true, attributeFilter: ["style"] });
    noteHoverCard(card);
  }
}

/**
 * Paseo drops the chat outline preview as the pointer leaves a tick and mounts the next one 150ms after it rests on another. Meanwhile
 * a copy of the old preview glides to the tick under the pointer; the new preview takes over from it with its text fading in. If the
 * pointer leaves the rail instead, the copy fades out.
 */
const OUTLINE_PREVIEW = '[data-testid="chat-outline-preview"]';
const OUTLINE_TICK = '[data-testid^="chat-outline-tick-"]';
let overTick: DomElement | undefined;
let ghost: { el: DomElement; tick: DomElement; dy: number; timer?: ReturnType<typeof setTimeout> } | undefined;

export function dropGhost(fade: boolean) {
  if (!ghost) return;
  const { el, timer } = ghost;
  clearTimeout(timer);
  ghost = undefined;
  if (!fade) return el.remove();
  el.setAttribute("data-cp-ghost", "out");
  setTimeout(() => el.remove(), 100);
}

/** Waits for Paseo's next preview while the pointer is on a tick (back on its own one too); otherwise it has left the rail. */
const waitGhost = () => {
  if (!ghost) return;
  clearTimeout(ghost.timer);
  ghost.timer = setTimeout(() => dropGhost(true), overTick ? 400 : 60);
};

function moveGhost(tick: DomElement) {
  if (!ghost) return;
  ghost.dy = tick.getBoundingClientRect().top - ghost.tick.getBoundingClientRect().top;
  ghost.el.style.setProperty("transform", `translateY(${ghost.dy}px)`);
  // Its text dims while it stands over another tick, until that tick's preview arrives.
  if (ghost.dy) ghost.el.setAttribute("data-cp-moved", "");
  else ghost.el.removeAttribute("data-cp-moved");
  waitGhost();
}

export function ghostOutlinePreview(removed: Array<{ el: DomElement; from: DomElement }>) {
  const old = removed.find(({ el }) => el.matches(`${OUTLINE_PREVIEW}:not([data-cp-ghost])`));
  // The preview sits beside its tick, in a wrapper of the two.
  const tick = old?.from.isConnected ? old.from.querySelector(OUTLINE_TICK) : null;
  if (!old || !tick || document.querySelector(`${OUTLINE_PREVIEW}:not([data-cp-ghost])`)) return;
  dropGhost(false);
  const el = old.el.cloneNode(true);
  el.setAttribute("data-cp-ghost", "");
  el.removeAttribute("data-cp-swap");
  old.from.appendChild(el);
  // Style it in place first, so moving it to another tick transitions.
  el.getBoundingClientRect();
  ghost = { el, tick, dy: 0 };
  if (overTick) moveGhost(overTick);
  else waitGhost();
}

export function swapOutlinePreview(roots: DomElement[]) {
  if (!ghost) return;
  for (const el of within(roots, `${OUTLINE_PREVIEW}:not([data-cp-ghost])`)) {
    // Measured at rest: swapping first takes it out of the popover rise-in.
    // Another prompt's text fades in trailing the glide; the same prompt (back on its tick) just stays.
    el.setAttribute("data-cp-swap", el.textContent === ghost.el.textContent ? "same" : "new");
    el.style.setProperty("--cp-shift", ghost.dy > 0 ? "-4px" : ghost.dy < 0 ? "4px" : "0px");
    el.style.setProperty("--cp-from", "0px");
    el.style.setProperty("--cp-from", `${ghost.el.getBoundingClientRect().top - el.getBoundingClientRect().top}px`);
    dropGhost(false);
  }
}

/** After nodes leave the DOM: the shown hover card may be gone. */
export function hoverCardsRemoved() {
  if (hoverCards.size) syncHoverCards();
}

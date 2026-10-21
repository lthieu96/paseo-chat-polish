// Tags Paseo's parts (data-cp-part and friends) so the restyle's CSS can name them without :has() or positional selectors.
import { tagContextCard } from "./context-card";
import { within, type ComputedStyle, type DomElement, type ResizeObserverClass, type WebDocument } from "./dom";
import { rowIconMask } from "./icons";
import { CHIP, CTX, PERMISSION, PLAN, PRIMARY, ROW, ROW_ICON, SECONDARY, SETTINGS_PANE, SLASH, SLASH_GLIDE_MS, SURFACE, USAGE, WORKING_BOX } from "./selectors";

declare const document: WebDocument;
declare function getComputedStyle(el: DomElement): ComputedStyle;
declare const ResizeObserver: ResizeObserverClass;
declare function matchMedia(query: string): { matches: boolean };
declare function setTimeout(cb: () => void, ms: number): number;

// [child, parent it marks, part]
const PARTS: Array<[string, (el: DomElement) => DomElement | null | undefined, string]> = [
  ['[data-testid="assistant-fork-menu-trigger"]', (el) => el.parentElement, "fork"],
  ['[data-testid="assistant-fork-menu-trigger"]', (el) => el.parentElement?.parentElement, "footer"],
  // The box that spaces the turn footer (or the working line) from what's above it.
  ['[data-testid="assistant-fork-menu-trigger"]', (el) => el.parentElement?.parentElement?.parentElement?.parentElement, "footer-gap"],
  // The plan card shows the same question; it has its own styles.
  ['[data-testid="permission-request-question"]', (el) => (el.parentElement?.parentElement?.getAttribute("data-testid") === "permission-plan-card" ? null : el.parentElement), "permission"],
  ['[data-paseo-markdown-tag="img"]', (el) => el.parentElement, "image-text"],
  // Paseo's "View diagram" button, the sibling after a diagram's source block.
  ['[data-paseo-markdown-language="mermaid"]', (el) => el.nextElementSibling, "diagram-toggle"],
  [CHIP, (el) => el, "chip"],
  // A queued message: the card around its text and its edit / send-now buttons.
  ['button[aria-label="Edit queued message"]', (el) => el.parentElement?.parentElement, "queued"],
  // The composer's box: the textarea's nearest ancestor whose last child is the toolbar. Its depth differs by version (0.12 added
  // wrappers above and below it), and the attach button is missing in terminal mode, so neither works as a fixed anchor.
  ['[data-testid="message-input-root"] textarea', (el) => {
    for (let child = el, box = el.parentElement; box && box.getAttribute("data-testid") !== "message-input-root"; child = box, box = box.parentElement) {
      if (box.lastElementChild !== child && box.lastElementChild?.querySelector("button")) return box;
    }
  }, "composer"],
  // The row holding the textarea and, while it's empty and unfocused, the "⌘L to focus" hint.
  ['[data-testid="message-input-root"] textarea', (el) => el.parentElement?.parentElement, "input-row"],
  [PRIMARY, (el) => el, "primary"],
  [SECONDARY, (el) => el, "secondary"],
  [`${PLAN} > button:first-child`, (el) => el, "plan-head"],
  ['[data-testid="chat-outline-preview"]', (el) => el, "outline-preview"],
  ['[data-testid="context-window-details"]', (el) => el, "context"],
  ['[data-testid="workspace-hover-card"]', (el) => el, "ws-card"],
  // The timeline item around each reply block, which holds Paseo's gap between blocks.
  ['[data-testid="assistant-message"]', (el) => el.parentElement, "msg-item"],
  // Paseo's dropdown menus share no marker; the nearest testID above an item is the menu's surface.
  ['[role="menuitem"]', (el) => el.closest('[role="menu"]') ?? el.parentElement?.closest("[data-testid]"), "menu"],
  ['[data-testid="turn-working-indicator"] > div > div:first-child > div > div', (el) => el, "loader"],
  // The vertical scroller of a tool call's details; its depth varies by tool.
  ['[data-testid="tool-call-badge"] > div:nth-child(2) [style*="max-height"]', (el) => el, "detail-scroll"],
  // Parts otherwise picked by position mid-selector (X > div:nth-child(2) > div), which makes the browser restyle whole sibling rows
  // whenever Paseo's virtual list inserts one. Later entries build on tags set by earlier ones.
  [`${ROW} > button > div > div:nth-child(2)`, (el) => el, "row-label"],
  ['[data-testid="tool-call-group"] > div:nth-child(2)', (el) => el, "group-body"],
  ['[data-testid="tool-call-badge"] > div:nth-child(2)', (el) => el, "badge-body"],
  [`${PERMISSION} > div:nth-child(2)`, (el) => el, "permission-body"],
  ['[data-cp-part="input-row"] > div + div', (el) => el, "input-extra"],
  [`${USAGE} > div:first-child > div:nth-child(3)`, (el) => el, "usage-plan"],
  [`${USAGE} > div:nth-child(2)`, (el) => el, "usage-limits"],
  ['[data-cp-part="usage-limits"] > div > div:nth-child(2)', (el) => el, "limit-body"],
  ['[data-testid^="model-row-"] > div > div:nth-child(2)', (el) => el, "model-text"],
];

const slashCards = new WeakSet<DomElement>();
const boxHeight = (el: DomElement) => (el as unknown as { getBoundingClientRect(): { height: number } }).getBoundingClientRect().height;

/**
 * Tags the / popup's detail card (there while the highlighted command has a description) and its list. Retagged on every change:
 * React reuses these divs when the popup switches to "Loading" or "No results", so a tag set once would stick to the wrong one.
 */
function tagSlash(card: DomElement) {
  const children = Array.from(card.children);
  const detail = children.length > 1 ? children[0] : undefined;
  for (const child of children) {
    const part = child === detail ? "slash-detail" : child === children[children.length - 1] ? "slash-list" : null;
    if (part && child.getAttribute("data-cp-part") !== part) child.setAttribute("data-cp-part", part);
    else if (!part) child.removeAttribute("data-cp-part");
  }
}

/**
 * Keeps the / popup tagged, and eases its height: Paseo resizes it at once whenever the filter or the highlighted command
 * changes, which flickers. The card sits on the input, so it grows and shrinks upward. ResizeObserver runs after layout and before
 * paint, so the jump to the new height is never drawn: the card is put back at the height on screen and transitions from there.
 * Changes that land mid-glide are picked up when it ends and its height returns to auto.
 */
function watchSlash(card: DomElement) {
  if (slashCards.has(card) || typeof ResizeObserver === "undefined") return;
  slashCards.add(card);
  tagSlash(card);
  let shown = boxHeight(card);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const observer = new ResizeObserver(() => {
    if (!card.isConnected) return observer.disconnect();
    tagSlash(card);
    if (card.hasAttribute("data-cp-glide")) return;
    const from = shown;
    shown = boxHeight(card);
    if (Math.abs(shown - from) < 1 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    card.style.setProperty("height", `${from}px`, "important");
    boxHeight(card);
    card.setAttribute("data-cp-glide", "");
    card.style.setProperty("height", `${shown}px`, "important");
    clearTimeout(timer);
    timer = setTimeout(() => {
      card.removeAttribute("data-cp-glide");
      card.style.removeProperty("height");
    }, SLASH_GLIDE_MS + 20);
  });
  observer.observe(card);
}

const CLEAR = "rgba(0, 0, 0, 0)";

/**
 * Settings pages draw their cards, select triggers and text fields from generated styles, without testIDs. Tag each by what it draws,
 * once, and only inside the Settings pane (a small tree, so reading styles there is cheap): data-cp-set="card" | "control" | "field" | "area".
 * The settings rules in NATIVE_CSS then put them on the chat's radius scale (design: "Settings — Radius & Inputs").
 */
function tagSettings(roots: DomElement[]) {
  const scopes = new Set<DomElement>();
  for (const root of roots) {
    if (root.closest(SETTINGS_PANE)) scopes.add(root);
    else for (const pane of within([root], SETTINGS_PANE)) scopes.add(pane);
  }
  for (const scope of scopes)
    for (const el of [scope, ...Array.from(scope.querySelectorAll("*"))]) {
      if (el.hasAttribute("data-cp-set")) continue;
      if (el.matches("input, textarea")) {
        // The field is the nearest box that draws something: the input itself, or the wrapper around it and its icon.
        let box: DomElement | null = el;
        while (box && !box.matches(SETTINGS_PANE)) {
          const s = getComputedStyle(box);
          if (parseFloat(s.borderTopWidth) > 0 || s.backgroundColor !== CLEAR) break;
          box = box.parentElement;
        }
        if (box && !box.matches(SETTINGS_PANE)) box.setAttribute("data-cp-set", el.matches("textarea") ? "area" : "field");
        el.setAttribute("data-cp-set-input", "");
        continue;
      }
      const s = getComputedStyle(el);
      const radius = parseFloat(s.borderRadius);
      const border = parseFloat(s.borderTopWidth) > 0;
      // Pills (switches, badges) are full by design; boxes that draw nothing aren't shapes.
      if (!radius || radius >= 999 || (!border && s.backgroundColor === CLEAR)) continue;
      const height = el.getBoundingClientRect().height;
      if (el.tagName === "BUTTON" || el.getAttribute("role") === "button") {
        if (radius >= 10 && height >= 24 && height <= 48) el.setAttribute("data-cp-set", "control");
      } else if (el.getAttribute("role") === "alert" || (border && radius >= 8 && height >= 44)) el.setAttribute("data-cp-set", "card");
    }

  // Portaled popovers may omit menu/listbox roles. Inspect changed subtrees and their ancestors, not the whole app.
  if (document.querySelector(SETTINGS_PANE))
    for (const el of new Set(roots.flatMap((root) => {
      const ancestors: DomElement[] = [];
      for (let parent = root.parentElement; parent && parent !== document.body; parent = parent.parentElement) ancestors.push(parent);
      return [root, ...Array.from(root.querySelectorAll("*")), ...ancestors];
    }))) {
      if (el.hasAttribute("data-cp-setting-menu") || (el.hasAttribute("data-cp-part") && !el.matches(SURFACE)) || el.tagName === "BUTTON" || el.getAttribute("role") === "button") continue;
      const style = getComputedStyle(el);
      if (style.position !== "absolute" && style.position !== "fixed") continue;
      if (parseFloat(style.borderTopWidth) < 1 || parseFloat(style.borderRadius) < 8 || style.backgroundColor === CLEAR) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 100 || rect.height < 24) continue;
      if (el.querySelectorAll("button, [role=button], [role=option], [role=menuitem]").length < 1 && el.querySelectorAll("*").length < 4) continue;
      if (!el.hasAttribute("data-cp-part")) el.setAttribute("data-cp-part", "menu");
      el.setAttribute("data-cp-setting-menu", "");
    }
}

/** Tags the parts above, for selectors that would otherwise need :has() or a slow "X *". */
export function tagParts(roots: DomElement[]) {
  tagSettings(roots);
  for (const [child, parentOf, part] of PARTS) for (const el of within(roots, child)) parentOf(el)?.setAttribute("data-cp-part", part);
  for (const card of within(roots, `${SLASH} > div`)) watchSlash(card);
  for (const body of within(roots, '[data-testid="permission-plan-card"] > div:nth-child(2)')) body.setAttribute("data-cp-plan-md", "");
  // The turn footer sits close under a reply block. Decided once per pair, not with a sibling combinator: the virtual list mounts and
  // drops rows in either order, and a gap that flips with it makes Paseo re-measure the list.
  const tight = (gap: DomElement | null | undefined) => gap?.getAttribute("data-cp-part") === "footer-gap" && gap.previousElementSibling?.getAttribute("data-cp-part") === "msg-item" && gap.setAttribute("data-cp-tight", "");
  for (const gap of within(roots, '[data-cp-part="footer-gap"]')) tight(gap);
  for (const item of within(roots, '[data-cp-part="msg-item"]')) tight(item.nextElementSibling);
  // A prompt's bubble holds its attachment rows (thumbnails, then labelled pills) above the text, which Paseo marks data-message-text.
  for (const message of within(roots, '[data-testid="user-message"]')) {
    const bubble = message.firstElementChild?.firstElementChild;
    const rows = Array.from(bubble?.children ?? []).filter((row) => !row.hasAttribute("data-message-text"));
    if (!bubble || !rows.length) continue;
    bubble.setAttribute("data-cp-attach", "");
    for (const row of rows) {
      // Thumbnails open the lightbox, so their frames are buttons (their image may still be loading); labelled pills are plain views.
      const images = !!row.querySelector('[role="button"]');
      row.setAttribute("data-cp-part", images ? "att-images" : "att-files");
      if (!images) for (const pill of Array.from(row.children)) {
        const icon = pill.firstElementChild?.firstElementChild;
        if (icon?.querySelector("svg") && icon.nextElementSibling) icon.setAttribute("data-cp-part", "att-icon");
      }
    }
  }
  // The working indicator's box gets an overlay the other loaders draw in; CSS shows it only when one is chosen.
  for (const box of within(roots, WORKING_BOX)) {
    if (box.querySelector(":scope > [data-cp-loader]")) continue;
    const overlay = document.createElement("span");
    overlay.setAttribute("data-cp-loader", "");
    overlay.innerHTML = "<i></i>".repeat(9);
    box.insertAdjacentElement("beforeend", overlay);
  }
  for (const svg of within(roots, `${ROW_ICON} svg`)) {
    const slot = svg.closest(ROW_ICON);
    if (!slot) continue;
    if (svg.querySelector('path[d="m9 18 6-6-6-6"]')) slot.setAttribute("data-cp-chev", "");
    else {
      slot.removeAttribute("data-cp-chev");
      slot.style.setProperty("--cp-row-icon", rowIconMask(svg));
    }
  }
  // Also when only its text re-renders, so the card is an ancestor of the root.
  for (const card of new Set([...within(roots, CTX), ...roots.map((root) => root.closest(CTX))])) if (card) tagContextCard(card);
}

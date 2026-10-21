// The context window card: its percent bar, the Compact row, and a remembered height so it doesn't jump.
import { activeAgentId, visible, type DomElement, type WebDocument } from "./dom";

declare const document: WebDocument;
declare const localStorage: { getItem(key: string): string | null; setItem(key: string, value: string): void };

/** The context card's percent drawn large with a bar (its text is plain "35% used"), the Compact row, and its remembered height. */
export function tagContextCard(card: DomElement) {
  const head = card.firstElementChild;
  const used = head?.children[1];
  const pct = /^(\d+(?:\.\d+)?)% /.exec(used?.textContent ?? "")?.[1];
  if (!head || !used || !pct) return;
  used.setAttribute("data-cp-pct", pct);
  head.style.setProperty("--cp-pct", `${pct}%`);
  head.setAttribute("data-cp-level", Number(pct) >= 80 ? "high" : "normal");
  if (compactHandler) markCompact(card, Number(pct));
  keepCardHeight(card);
}

let compactHandler: ((agentId: string) => Promise<void>) | undefined;

/** Lets the context card's Compact button send /compact to the chat on screen. */
export function setCompactHandler(handler: (agentId: string) => Promise<void>) {
  compactHandler = handler;
  return () => void (compactHandler = undefined);
}

// Paseo loads the card's account section (usage-report-*) after it opens, so the card grows by ~170px and jumps up a
// frame later. Remember its full height per agent and open at that height next time.
// The min-height is only a loading placeholder: once usage arrives the card sizes naturally, including when it shrinks.
const HEIGHTS_KEY = "chat-polish:context-card-heights";
let cardHeights: Map<string, number> | undefined;
function keepCardHeight(card: DomElement) {
  // Only reached from tagParts, which runs on web; read lazily so importing this module never touches localStorage.
  cardHeights ??= new Map(Object.entries(JSON.parse(localStorage.getItem(HEIGHTS_KEY) ?? "{}") as Record<string, number>));
  const id = activeAgentId() ?? "";
  if (card.querySelector('[data-testid^="usage-report-"]')) {
    if (card.style.getPropertyValue("min-height")) card.style.removeProperty("min-height");
    const height = Math.round(card.getBoundingClientRect().height);
    if (height > 0 && height !== cardHeights.get(id)) {
      cardHeights.delete(id);
      cardHeights.set(id, height);
      if (cardHeights.size > 50) cardHeights.delete(cardHeights.keys().next().value!);
      localStorage.setItem(HEIGHTS_KEY, JSON.stringify(Object.fromEntries(cardHeights)));
    }
    return;
  }
  const height = cardHeights.get(id);
  if (height && card.style.getPropertyValue("min-height") !== `${height}px`) card.style.setProperty("min-height", `${height}px`);
}

const FOLD_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-6"/><path d="M12 8V2"/><path d="M4 12H2"/><path d="M10 12H8"/><path d="M16 12h-2"/><path d="M22 12h-2"/><path d="m15 19-3-3-3 3"/><path d="m15 5-3 3-3-3"/></svg>';

/** A menu-style "Compact conversation" row under the percent bar; hidden while the agent is working, since /compact would wait behind the turn. */
function markCompact(card: DomElement, pct: number) {
  let row = card.querySelector("[data-cp-compact]");
  if (!row) {
    row = document.createElement("div");
    row.setAttribute("data-cp-compact", "");
    row.innerHTML = `<button type="button">${FOLD_ICON}<span>Compact conversation</span><span></span></button>`;
    const button = row.firstElementChild!;
    const label = button.children[1]!;
    button.addEventListener("click", () => {
      const id = activeAgentId();
      if (!id || !compactHandler || button.hasAttribute("disabled")) return;
      button.setAttribute("disabled", "");
      label.textContent = "Compacting…";
      compactHandler(id).catch((error: unknown) => {
        console.warn("[chat-polish] /compact failed", error);
        button.removeAttribute("disabled");
        label.textContent = "Try again";
      });
    });
    // Right under the usage figures and above Paseo's divider; the account section loads later and goes below.
    card.firstElementChild?.insertAdjacentElement("afterend", row);
  }
  const low = pct >= 60;
  row.setAttribute("data-cp-level", low ? "high" : "normal");
  // Only write text that changed: every write is a DOM mutation that runs this pass again.
  const hint = row.firstElementChild!.lastElementChild!;
  const text = low ? "running low" : "summarize so far";
  if (hint.textContent !== text) hint.textContent = text;
  const working = Array.from(document.querySelectorAll('button[aria-label="Stop agent"]')).some(visible);
  row.style.setProperty("display", working ? "none" : "flex");
}

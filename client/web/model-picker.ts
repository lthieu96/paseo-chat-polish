// The composer's model and thinking pickers: a provider rail, model counts, default levels and descriptions.
import { Platform } from "react-native";
import { BOT_ICON, PROVIDER_ICONS } from "../provider-icons";
import { within, type ComputedStyle, type DomElement, type MutationObserverClass, type WebDocument } from "./dom";
import { CTX, PERMISSION, PLAN, POP, QUESTION, SURFACE, TAG } from "./selectors";

declare const document: WebDocument;
declare function getComputedStyle(el: DomElement): ComputedStyle;
declare const MutationObserver: MutationObserverClass;
declare function requestAnimationFrame(cb: () => void): number;
declare function setTimeout(cb: () => void, ms: number): number;

/** A provider as the model selector's rail shows it, from Paseo's provider snapshot. */
export interface RailProvider {
  id: string;
  label: string;
  status: "ready" | "loading" | "error" | "unavailable";
  iconSvg?: string;
  models: Array<{ label: string; thinking: Array<{ label: string; description?: string; isDefault: boolean }> }>;
}

const MODEL_POP = `${POP}[${TAG}="models"]`;
const THINKING_POP = `${POP}[${TAG}="thinking"]`;
const BACK = '[data-testid="sheet-header-back"]';
const SETTINGS = '[data-testid^="selector-header-settings-"]';
const MODEL_ROW = '[data-testid^="model-row-"]';
const HEADER = `${MODEL_POP} [data-cp-part="header"]`;

export const MODEL_SELECTOR_CSS = `
${MODEL_POP} { width: 440px !important; min-width: 440px !important; max-width: 440px !important; display: grid !important; grid-template-columns: 172px minmax(0, 1fr); grid-template-rows: auto auto minmax(0, 1fr); border-radius: 12px !important; border-color: var(--cp-rule) !important; overflow: hidden !important; }
${MODEL_POP} > div:first-child { display: contents !important; }
${MODEL_POP} [data-cp-part="search"] { grid-column: 1 / -1; grid-row: 1; padding: 4px 12px !important; border-bottom: 1px solid var(--cp-rule) !important; }
${HEADER} { grid-column: 2; grid-row: 2; padding: 10px 12px 6px 14px !important; }
${HEADER} > :is(button, [data-cp-part="icon"]) { display: none !important; }
${HEADER} > [data-cp-part="title"] { font-size: 13px !important; font-weight: 600 !important; color: var(--cp-fg) !important; }
${HEADER} > [data-cp-part="title"]::after { content: attr(data-cp-count); margin-left: 8px; font-size: 12px; font-weight: 400; color: var(--cp-muted); }
${MODEL_POP} > div:nth-child(2) { grid-column: 2; grid-row: 3; min-height: 0 !important; }
${MODEL_POP} [data-cp-part="providers"] { display: none !important; }
${MODEL_POP} :is([data-cp-part="rows"], [data-testid="model-profiles-empty"]) { margin: 0 6px 2px !important; border-radius: 6px !important; overflow: hidden !important; }
${MODEL_POP} :is(${MODEL_ROW}, [data-testid="model-profiles-empty"]) { min-height: 28px !important; padding: 0 !important; justify-content: center !important; }
${MODEL_POP} :is(${MODEL_ROW}, [data-testid="model-profiles-empty"]) > div { padding: 0 8px !important; gap: 8px !important; }
${MODEL_POP} ${MODEL_ROW} > div > div:first-child { display: none !important; }
${MODEL_POP} ${MODEL_ROW} > div > div:nth-child(2) { flex: 1 1 auto !important; min-width: 0 !important; align-items: baseline !important; }
${MODEL_POP} [data-cp-part="model-text"] > div:last-child { min-width: 0 !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
${MODEL_POP} ${MODEL_ROW} > div > div:last-child { display: contents !important; }
${MODEL_POP} ${MODEL_ROW} > div > div:last-child > div:first-child { order: -1; width: 14px !important; }
${MODEL_POP} ${MODEL_ROW} svg { stroke: var(--cp-accent) !important; }

[data-cp-rail] { grid-column: 1; grid-row: 2 / 4; display: flex; flex-direction: column; gap: 2px; padding: 6px; overflow-y: auto; background: rgba(0, 0, 0, 0.14); border-right: 1px solid var(--cp-rule); }
[data-cp-rail] button { all: unset; box-sizing: border-box; position: relative; display: flex; align-items: center; gap: 8px; flex-shrink: 0; height: 28px; padding: 0 8px; border-radius: 6px; font-size: 13px; color: var(--cp-fg); cursor: pointer; }
[data-cp-rail] button:hover { background: var(--cp-control); }
[data-cp-rail] button[aria-current="true"] { background: var(--cp-control); font-weight: 500; }
[data-cp-rail] button[aria-current="true"]::before { content: ""; position: absolute; left: -6px; top: 8px; bottom: 8px; width: 2px; border-radius: 999px; background: var(--cp-accent); }
[data-cp-rail] button[aria-disabled="true"] { opacity: 0.45; cursor: default; }
[data-cp-rail] button[aria-disabled="true"]:hover { background: transparent; }
[data-cp-rail] hr { border: 0; height: 1px; margin: 4px 2px; background: var(--cp-rule); flex-shrink: 0; }
[data-cp-rail] [data-cp-icon] { display: flex; align-items: center; justify-content: center; width: 14px; height: 14px; flex-shrink: 0; color: var(--cp-muted); font-size: 11px; font-weight: 600; }
[data-cp-rail] svg { width: 14px; height: 14px; }
[data-cp-rail] [data-cp-label] { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
[data-cp-rail] [data-cp-status="loading"] svg { color: var(--cp-muted); animation: cp-spin 1s linear infinite; }
@media (prefers-reduced-motion: reduce) { [data-cp-rail] [data-cp-status="loading"] svg { animation: none !important; } }
[data-cp-rail] [data-cp-status="error"] svg { color: #e06c75; }
@keyframes cp-spin { to { transform: rotate(360deg); } }
[data-cp-tip] { position: absolute; z-index: 1; display: none; max-width: 220px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--cp-rule); background: var(--cp-sunken); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4); font-size: 12px; line-height: 1.45; color: var(--cp-muted); pointer-events: none; }
[data-cp-tip] b { display: block; margin-bottom: 2px; font-weight: 600; color: var(--cp-fg); }

${THINKING_POP} { border-radius: 12px !important; border-color: var(--cp-rule) !important; }
${THINKING_POP}[data-cp-described] { width: 420px !important; }
${THINKING_POP} button { min-height: 28px !important; margin: 0 4px !important; padding: 0 8px !important; gap: 8px !important; }
${THINKING_POP} button > div:nth-child(2) > :first-child, ${MODEL_POP} ${MODEL_ROW} > div > div:nth-child(2) > :first-child { font-size: 13px !important; font-weight: 500 !important; }
${THINKING_POP} button > div:first-child { visibility: hidden !important; }
${THINKING_POP} button[data-cp-part="checked"] > div:first-child { display: none !important; }
${THINKING_POP} button > div:nth-child(3) { order: -1; }
${THINKING_POP} button > div:nth-child(3) svg { stroke: var(--cp-accent) !important; }
${THINKING_POP} button > div:nth-child(2) { flex: 1 1 auto !important; min-width: 0 !important; flex-direction: row !important; align-items: center !important; gap: 8px !important; }
[data-cp-default] { flex-shrink: 0; padding: 0 6px; border: 1px solid var(--cp-rule); border-radius: 999px; font-size: 11px; line-height: 16px; color: var(--cp-muted); }
[data-cp-desc] { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; color: var(--cp-muted); }
[data-cp-hint] { position: absolute; right: 12px; bottom: calc(100% + 8px); padding: 3px 10px; border: 1px solid var(--cp-rule); border-radius: 999px; background: var(--cp-raised); font-size: 12px; line-height: 16px; white-space: nowrap; color: var(--cp-muted); pointer-events: none; }
/* Popup surfaces use 20px squircles; nested surfaces keep their own radius scale. */
@supports (corner-shape: squircle) {
  ${SURFACE}, ${THINKING_POP}, ${MODEL_POP}, ${CTX}, [data-testid="chat-outline-preview"], ${PERMISSION}, ${QUESTION} { border-radius: 20px !important; corner-shape: squircle; }
  ${SURFACE} :is(button, [role="button"], [role="menuitem"], [role="option"], a[href]) { border-radius: 16px !important; corner-shape: squircle; }
  ${PLAN} { border-radius: 24px !important; corner-shape: squircle; }
  ${MODEL_POP} :is([data-cp-part="rows"], [data-testid="model-profiles-empty"]) { border-radius: 21px !important; corner-shape: squircle; }
}
`;

let railProviders: RailProvider[] = [];

/** Feeds the model selector the host's providers; call again whenever Paseo's provider snapshot changes. */
export function setRailProviders(list: RailProvider[]) {
  railProviders = list;
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  for (const pop of Array.from(document.querySelectorAll(MODEL_POP))) decorateModels(pop);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
const lucide = (paths: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const BOOKMARK = lucide('<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>');
const LOADER = lucide('<path d="M21 12a9 9 0 1 1-6.219-8.56"/>');
const ALERT = lucide('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>');

const safeSvg = (svg?: string) => (svg && /^<svg[\s>]/.test(svg) && !/<script|\son\w+=/i.test(svg) ? svg : undefined);
const iconFor = (p: RailProvider) => PROVIDER_ICONS[p.id] ?? safeSvg(p.iconSvg) ?? BOT_ICON;

const railHtml = new WeakMap<DomElement, string>();
let clickedThinking: { chip: DomElement; at: number } | undefined;
let pickedModelAt = 0;
/** The composer's picker chips, and the one whose picker is open. */
const CHIPS = '[data-testid="combined-model-selector"], [data-testid="agent-thinking-selector"], [data-testid="mode-control"]';
let openedBy: DomElement | undefined;

export function noteClick(event: { target: unknown; clientX: number; clientY: number }) {
  const target = event.target as DomElement | null;
  const picker = target?.closest?.(CHIPS);
  if (picker) openedBy = picker;
  // Paseo closes an open picker through a backdrop over the whole window, so clicking another chip only closed it. Open that one too,
  // once Paseo is done closing; clicking the same chip still just closes its picker.
  else if (openedBy && document.querySelector(POP) && !target?.closest?.(POP)) {
    const under = document.elementsFromPoint(event.clientX, event.clientY).map((el) => el.closest(CHIPS)).find((el) => el);
    if (under && under !== openedBy) setTimeout(() => under.click(), 0);
  }
  const chip = target?.closest?.('[data-testid="agent-thinking-selector"]');
  if (chip) clickedThinking = { chip, at: Date.now() };
  // Any other click (the mode chip, a menu) means the next popover isn't the thinking list; clicks inside an open popover keep it.
  else if (!target?.closest?.(POP)) clickedThinking = undefined;
  if (target?.closest?.(`${MODEL_POP} ${MODEL_ROW}`)) pickedModelAt = Date.now();
}

/**
 * Paseo lights a picker's hovered or keyboard-active row with the raised color, through generated classes CSS can't name.
 * The surfaces are raised now, so tag the lit row (data-cp-lit) whenever a row's class changes; CSS draws it a step up.
 * Only open pickers are watched, a handful of rows each. The plugin's own rail rows keep their CSS hover.
 */
const watchedSurfaces = new WeakSet<DomElement>();
export function markLitRows(roots: DomElement[]) {
  for (const surface of within(roots, '[data-testid="combobox-desktop-container"], [data-testid="command-center-panel"]')) {
    if (watchedSurfaces.has(surface)) continue;
    watchedSurfaces.add(surface);
    const mark = () => {
      for (const row of Array.from(surface.querySelectorAll("button"))) {
        if (row.closest("[data-cp-rail]")) continue;
        // Measure Paseo's own color, not the one data-cp-lit paints.
        row.removeAttribute("data-cp-lit");
        if (getComputedStyle(row).backgroundColor !== "rgba(0, 0, 0, 0)") row.setAttribute("data-cp-lit", "");
      }
    };
    new MutationObserver(mark).observe(surface, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    mark();
  }
}

/** Marks and decorates Paseo's model and thinking popovers as they open or change view. */
export function decoratePopovers(roots: DomElement[]) {
  const pops = new Set<DomElement>();
  for (const root of roots) {
    const inside = root.closest(POP);
    if (inside) pops.add(inside);
    else for (const pop of within([root], POP)) pops.add(pop);
  }
  for (const pop of pops) {
    if (pop.querySelector('[data-testid="compact-model-list"], [data-testid="compact-provider-list"]')) {
      pop.setAttribute(TAG, "models");
      decorateModels(pop);
    } else if (clickedThinking && Date.now() - clickedThinking.at < 2000) {
      decorateThinking(pop, clickedThinking.chip);
    }
  }
}

/** The left provider rail, the model count and shorter descriptions. Paseo's own list still does the selecting. */
function decorateModels(pop: DomElement) {
  const current = pop.querySelector(SETTINGS)?.getAttribute("data-testid")?.slice("selector-header-settings-".length);
  // Only a new chat can change provider: its selector has a provider list or a back button to one.
  const canSwitch = !!pop.querySelector(`${BACK}, [data-testid="compact-provider-list"]`);

  for (const el of Array.from(pop.firstElementChild?.children ?? [])) el.setAttribute("data-cp-part", el.querySelector("input") ? "search" : "header");
  for (const el of Array.from(pop.querySelectorAll('[data-cp-part="header"] > div'))) if (el.querySelector(":scope > svg")) el.setAttribute("data-cp-part", "icon");
  for (const el of Array.from(pop.querySelectorAll('[data-testid^="model-provider-"]'))) el.parentElement?.parentElement?.parentElement?.setAttribute("data-cp-part", "providers");
  for (const el of Array.from(pop.querySelectorAll(MODEL_ROW))) el.parentElement?.setAttribute("data-cp-part", "rows");
  // Counted while the search is empty, so a filtered list doesn't change the provider's total.
  let title = pop.querySelector(SETTINGS);
  while (title && title.parentElement?.getAttribute("data-cp-part") !== "header") title = title.parentElement;
  title = title?.previousElementSibling ?? null;
  title?.setAttribute("data-cp-part", "title");
  const count = pop.querySelectorAll(MODEL_ROW).length;
  if (title && count && !(pop.querySelector("input") as { value?: string } | null)?.value) title.setAttribute("data-cp-count", `${count} model${count === 1 ? "" : "s"}`);
  // "Opus 5.5 · Latest release" under "Opus 5.5": the name is already on the row.
  for (const text of Array.from(pop.querySelectorAll(`${MODEL_ROW} > div > div:nth-child(2)`))) {
    const [name, description] = Array.from(text.children);
    const node = description?.firstChild;
    const prefix = `${name?.textContent ?? ""} · `;
    if (node?.nodeValue?.startsWith(prefix)) node.nodeValue = node.nodeValue.slice(prefix.length);
  }

  let rail = Array.from(pop.children).find((el) => el.hasAttribute("data-cp-rail"));
  const opening = !rail;
  if (!rail) {
    rail = document.createElement("div");
    rail.setAttribute("data-cp-rail", "");
    const font = pop.querySelector("input");
    if (font) rail.style.setProperty("font-family", getComputedStyle(font).fontFamily);
    wireRail(pop, rail);
    pop.appendChild(rail);
  }
  const item = (id: string, label: string, icon: string, extra = "") =>
    `<button type="button" data-cp-provider="${esc(id)}" aria-current="${id === (current ?? "profiles")}"${!canSwitch && id !== current ? ' aria-disabled="true"' : ""}><span data-cp-icon>${icon}</span><span data-cp-label title="${esc(label)}">${esc(label)}</span>${extra}</button>`;
  const status = (p: RailProvider) =>
    p.status === "loading" ? `<span data-cp-icon data-cp-status="loading">${LOADER}</span>` : p.status === "error" || p.status === "unavailable" ? `<span data-cp-icon data-cp-status="error">${ALERT}</span>` : "";
  const html = [canSwitch ? `${item("profiles", "Profiles", BOOKMARK)}<hr>` : "", ...railProviders.map((p) => item(p.id, p.label, iconFor(p), status(p)))].join("");
  if (railHtml.get(rail) !== html) {
    rail.innerHTML = html;
    railHtml.set(rail, html);
  }
  const active = rail.querySelector('[aria-current="true"]');
  const offset = active ? active.getBoundingClientRect().top - rail.getBoundingClientRect().top : 0;
  if (opening && offset > rail.getBoundingClientRect().height - 36) rail.scrollTop += offset - 120;
}

function wireRail(pop: DomElement, rail: DomElement) {
  const tip = document.createElement("div");
  tip.setAttribute("data-cp-tip", "");
  pop.appendChild(tip);
  const itemOf = (target: unknown) => (target as DomElement | null)?.closest?.("[data-cp-provider]") ?? null;
  rail.addEventListener("click", (event) => {
    const item = itemOf(event.target);
    if (!item || item.getAttribute("aria-disabled") === "true" || item.getAttribute("aria-current") === "true") return;
    const id = item.getAttribute("data-cp-provider")!;
    // Drive Paseo's own drill-down: back to its provider list, then into the provider.
    pop.querySelector(BACK)?.click();
    let tries = 0;
    const open = () => {
      if (id === "profiles") return;
      const row = pop.querySelector(`[data-testid="model-provider-${id}"]`);
      if (row) row.click();
      else if (++tries < 30) requestAnimationFrame(open);
    };
    open();
  });
  rail.addEventListener("mouseover", (event) => {
    const item = itemOf(event.target);
    if (!item || item.getAttribute("aria-disabled") !== "true") return tip.style.setProperty("display", "none");
    const here = railProviders.find((p) => p.id === pop.querySelector('[data-cp-provider][aria-current="true"]')?.getAttribute("data-cp-provider"));
    const there = item.textContent ?? "";
    tip.innerHTML = `<b>New chats only</b>This agent stays on ${esc(here?.label ?? "its provider")}. Start a new chat to use ${esc(there)}.`;
    const box = pop.getBoundingClientRect();
    const at = item.getBoundingClientRect();
    tip.style.setProperty("left", `${at.right - box.left - 24}px`);
    tip.style.setProperty("top", `${at.bottom - box.top + 4}px`);
    tip.style.setProperty("display", "block");
  });
  rail.addEventListener("mouseleave", () => tip.style.setProperty("display", "none"));
}

/** The model a composer's chips show, matched by its label and, when labels repeat across providers, its thinking option count. */
function findModel(label: string | undefined, thinkingCount?: number) {
  const named = railProviders.flatMap((p) => p.models).filter((m) => m.label === label);
  return named.find((m) => thinkingCount === undefined || m.thinking.length === thinkingCount) ?? named[0];
}

// Paseo shows its own wording for thinking levels ("Extra high" for xhigh), so compare loosely.
const level = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^extra/, "x");

const chipText = (scope: DomElement, testId: string) => scope.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim() ?? "";
// Some providers' thinking chip is an icon only; its accessibility label still names the level.
const thinkingText = (scope: DomElement) => /\((.+)\)$/.exec(scope.querySelector('[data-testid="agent-thinking-selector"]')?.getAttribute("aria-label") ?? "")?.[1] ?? chipText(scope, "agent-thinking-selector");

/** Adds what Paseo's thinking list leaves out: the model's default level and, when the provider has them, descriptions. */
function decorateThinking(pop: DomElement, chip: DomElement) {
  const composer = chip.closest('[data-testid="message-input-root"]') ?? document.documentElement;
  const labels = Array.from(pop.querySelectorAll("button > div:nth-child(2)"));
  const model = findModel(chipText(composer, "combined-model-selector"), labels.length);
  if (!model) return;
  pop.setAttribute(TAG, "thinking");
  for (const button of Array.from(pop.querySelectorAll("button"))) if (button.children.length > 2) button.setAttribute("data-cp-part", "checked");
  if (model.thinking.some((t) => t.description)) pop.setAttribute("data-cp-described", "");
  // Paseo lists the model's options in order; a search filter (over six options) breaks that, so match by name then.
  const inOrder = labels.length === model.thinking.length;
  labels.forEach((el, i) => {
    const option = inOrder ? model.thinking[i] : model.thinking.find((t) => level(t.label) === level(el.firstElementChild?.textContent ?? ""));
    if (!option || el.querySelector("[data-cp-default], [data-cp-desc]")) return;
    for (const [attr, value] of [["data-cp-default", option.isDefault ? "Default" : ""], ["data-cp-desc", option.description ?? ""]] as const) {
      if (!value) continue;
      const span = document.createElement("span");
      span.setAttribute(attr, "");
      span.textContent = value;
      el.appendChild(span);
    }
  });
}

const seenChips = new WeakMap<DomElement, { model: string; thinking: string }>();

/** Paseo silently moves thinking to the new model's default when the old level doesn't exist there; say so. */
export function noteThinkingFallback() {
  for (const composer of Array.from(document.querySelectorAll('[data-testid="message-input-root"]'))) {
    const now = { model: chipText(composer, "combined-model-selector"), thinking: composer.querySelector('[data-testid="agent-thinking-selector"]') ? thinkingText(composer) : "" };
    const before = seenChips.get(composer);
    seenChips.set(composer, now);
    if (!before || before.model === now.model || !before.thinking || !now.thinking || before.thinking === now.thinking) continue;
    if (Date.now() - pickedModelAt > 3000) continue;
    const model = findModel(now.model);
    if (!model || model.thinking.some((t) => level(t.label) === level(before.thinking))) continue;
    composer.querySelector("[data-cp-hint]")?.remove();
    const hint = document.createElement("div");
    hint.setAttribute("data-cp-hint", "");
    hint.textContent = `${before.thinking} isn't on ${now.model} · using its default, ${now.thinking}`;
    composer.appendChild(hint);
    setTimeout(() => hint.remove(), 6000);
  }
}

// The DOM as typed here: the plugin compiles without lib.dom (it also runs on React Native), so each file declares the globals it uses with these types.
import { Platform } from "react-native";
import { MSG, SETTINGS_PANE } from "./selectors";

declare const document: WebDocument;
declare function getComputedStyle(el: DomElement): ComputedStyle;
declare const MutationObserver: MutationObserverClass;
declare function setTimeout(cb: () => void, ms: number): number;

export interface DomElement {
  isConnected: boolean;
  parentElement: DomElement | null;
  firstElementChild: DomElement | null;
  lastElementChild: DomElement | null;
  previousElementSibling: DomElement | null;
  nextElementSibling: DomElement | null;
  scrollHeight: number;
  textContent: string | null;
  querySelector(selector: string): DomElement | null;
  querySelectorAll(selector: string): ArrayLike<DomElement>;
  style: { getPropertyValue(name: string): string; setProperty(name: string, value: string, priority?: string): void; removeProperty(name: string): void };
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  hasAttribute(name: string): boolean;
  matches(selector: string): boolean;
  closest(selector: string): DomElement | null;
  tagName: string;
  removeAttribute(name: string): void;
  addEventListener(type: "click" | "mouseover" | "mouseleave" | "wheel" | "touchstart" | "pointerdown", listener: (event: { target: unknown }) => void, capture?: boolean): void;
  removeEventListener(type: "click" | "mouseover" | "mouseleave" | "wheel" | "touchstart" | "pointerdown", listener: (event: { target: unknown }) => void, capture?: boolean): void;
  remove(): void;
  // Used by the model selector.
  children: ArrayLike<DomElement>;
  firstChild: { nodeValue: string | null } | null;
  innerHTML: string;
  outerHTML: string;
  scrollTop: number;
  clientHeight: number;
  scrollBy(options: { top: number }): void;
  appendChild(el: DomElement): void;
  insertAdjacentElement(where: "afterend" | "beforeend", el: DomElement): void;
  insertAdjacentHTML(where: "beforeend", html: string): void;
  click(): void;
  cloneNode(deep: true): DomElement;
  getBoundingClientRect(): { top: number; left: number; right: number; bottom: number; width: number; height: number };
}
export interface WebDocument {
  documentElement: DomElement;
  querySelector(selector: string): DomElement | null;
  querySelectorAll(selector: string): ArrayLike<DomElement>;
  createElement(tag: "style" | "div" | "span" | "button" | "iframe"): DomElement;
  createElement(tag: "canvas"): { getContext(kind: "2d", options: { willReadFrequently: boolean }): Canvas2d | null };
  addEventListener(type: "click", listener: (event: { target: unknown; clientX: number; clientY: number }) => void, capture?: boolean): void;
  removeEventListener(type: "click", listener: (event: { target: unknown; clientX: number; clientY: number }) => void, capture?: boolean): void;
  addEventListener(type: "pointerover", listener: (event: { target: unknown }) => void, capture?: boolean): void;
  removeEventListener(type: "pointerover", listener: (event: { target: unknown }) => void, capture?: boolean): void;
  elementsFromPoint(x: number, y: number): DomElement[];
  addEventListener(type: "keydown", listener: (event: KeyEvent) => void, capture?: boolean): void;
  removeEventListener(type: "keydown", listener: (event: KeyEvent) => void, capture?: boolean): void;
  body: unknown;
  head: { appendChild(el: DomElement): void };
}
interface Canvas2d {
  fillStyle: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  getImageData(x: number, y: number, w: number, h: number): { data: ArrayLike<number> };
}
export interface KeyEvent {
  key: string;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  preventDefault(): void;
}
export type MessageListener = (event: { source: unknown; data: unknown }) => void;
export interface ComputedStyle {
  transform: string;
  borderRightWidth: string;
  borderRightStyle: string;
  borderLeftWidth: string;
  borderTopWidth: string;
  borderBottomWidth: string;
  borderRadius: string;
  backgroundColor: string;
  lineHeight: string;
  fontSize: string;
  fontWeight: string;
  fontFamily: string;
  marginLeft: string;
  height: string;
  color: string;
  position: string;
  zIndex: string;
  boxShadow: string;
  overflowAnchor: string;
}
export type ResizeObserverClass = new (cb: () => void) => { observe(target: DomElement): void; disconnect(): void };
export type MutationObserverClass = new (cb: (records: Array<{ addedNodes: ArrayLike<unknown>; removedNodes: ArrayLike<unknown>; target: unknown; attributeName?: string | null; type: string }>) => void) => {
  observe(target: unknown, options: { childList: boolean; subtree: boolean; characterData?: boolean; attributes?: boolean; attributeFilter?: string[] }): void;
  disconnect(): void;
};

/** Elements matching `selector` within the added roots, the roots themselves included. */
export const within = (roots: DomElement[], selector: string) => roots.flatMap((root) => [...(root.matches(selector) ? [root] : []), ...Array.from(root.querySelectorAll(selector))]);

/** Process an added subtree once, even when a mutation batch lists its descendants too. */
function distinctRoots(roots: Iterable<DomElement>): DomElement[] {
  const all = new Set(roots);
  return [...all].filter((root) => {
    if (!root.isConnected) return false;
    for (let parent = root.parentElement; parent; parent = parent.parentElement) if (all.has(parent)) return false;
    return true;
  });
}

interface DomWatcher {
  /** Runs before the browser paints, with the elements just added (initially the whole body), so restyled parts never flash. */
  added?: (roots: DomElement[]) => void;
  /** Runs at most every 250ms once mutations settle (they stream in while agents run). */
  settled?: (textRoots: DomElement[]) => void;
  /** Runs before the browser paints, with the elements just removed and the parents they left. */
  removed?: (nodes: Array<{ el: DomElement; from: DomElement }>) => void;
}

// One observer for every watcher: Paseo mutates the DOM on each streamed token.
const watchers = new Set<DomWatcher>();
let observer: InstanceType<MutationObserverClass> | undefined;
let settleTimer: ReturnType<typeof setTimeout> | undefined;
const textRoots = new Set<DomElement>();

function settle() {
  settleTimer = undefined;
  const roots = distinctRoots(textRoots);
  textRoots.clear();
  for (const w of watchers) w.settled?.(roots);
}

/**
 * Watches the DOM for the restyles below; also how the plugin notices host settings that change without
 * telling plugins. Returns cleanup, which runs `cleanup` after the watcher is removed.
 */
export function watchDom(watcher: DomWatcher, cleanup: () => void) {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  watchers.add(watcher);
  if (!observer) {
    observer = new MutationObserver((records) => {
      const roots: DomElement[] = [];
      const settings = records.some((r) => r.attributeName) && document.querySelector(SETTINGS_PANE);
      const removed: Array<{ el: DomElement; from: DomElement }> = [];
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) if ((node as { nodeType?: number }).nodeType === 1) roots.push(node as DomElement);
        for (const node of Array.from(record.removedNodes)) if ((node as { nodeType?: number }).nodeType === 1) removed.push({ el: node as DomElement, from: record.target as DomElement });
        const node = record.target as { nodeType: number; parentElement: DomElement | null };
        const target = node.nodeType === 1 ? record.target as DomElement : node.parentElement;
        if (!target) continue;
        // Text mutations need only revisit their own markdown subtree, rather than every historical reply.
        if (!record.attributeName && target.closest(MSG)) textRoots.add(target);
        if (record.attributeName && settings) {
          if (target.closest(SETTINGS_PANE) || getComputedStyle(target).position === "absolute" || getComputedStyle(target).position === "fixed") roots.push(target);
        }
      }
      const added = distinctRoots(roots);
      if (added.length) for (const w of watchers) w.added?.(added);
      if (removed.length) for (const w of watchers) w.removed?.(removed);
      settleTimer ??= setTimeout(settle, 250);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "style", "hidden", "aria-hidden", "aria-expanded", "data-state"] });
  }
  watcher.added?.([document.body as DomElement]);
  watcher.settled?.([]);
  return () => {
    watchers.delete(watcher);
    if (!watchers.size) {
      observer?.disconnect();
      observer = undefined;
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = undefined;
      textRoots.clear();
    }
    cleanup();
  };
}

export const visible = (el: DomElement) => el.getBoundingClientRect().width > 0;

/** Agents with a tab in the window: the timelines merged steps follow. */
export function openAgentIds(): string[] {
  if (Platform.OS !== "web") return [];
  return Array.from(document.querySelectorAll('[data-testid^="workspace-tab-agent_"]')).map((tab) => tab.getAttribute("data-testid")!.slice("workspace-tab-agent_".length));
}

/** The agent of the selected tab on screen. ponytail: with split panes this takes the first one; the meter's own pane would need Paseo to name its agent. */
export function activeAgentId() {
  if (Platform.OS !== "web") return undefined;
  const tab = Array.from(document.querySelectorAll('[data-testid^="workspace-tab-agent_"][aria-selected="true"]')).find(visible);
  return tab?.getAttribute("data-testid")?.slice("workspace-tab-agent_".length);
}

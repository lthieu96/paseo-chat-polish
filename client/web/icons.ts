// Lucide icon masks for the restyle's CSS, the icon sets the daemon sends, and Paseo's own icons drawn in the chosen set.
import { Platform } from "react-native";
import { watchDom, within, type DomElement, type WebDocument } from "./dom";
import { ROW_ICON } from "./selectors";

declare const document: WebDocument;

const mask = (paths: string) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`)}")`;
// Icon sets the daemon has sent (getIconSet): Lucide name → the twin's 24px SVG markup.
const iconSets: Record<string, Record<string, string>> = {};
const iconSetListeners = new Set<() => void>();
export const iconTwins = (set: string): Record<string, string> | undefined => iconSets[set];
export const subscribeIconSets = (listener: () => void) => (iconSetListeners.add(listener), () => void iconSetListeners.delete(listener));
// A Lucide mask as a CSS var that the Icon set pref (data-cp-rt-icons on <html>) swaps for its twin once the set arrives.
export const ICON_VARS: string[] = [];
const MASK_NAMES: string[] = [];
let iconSetStyle: DomElement | undefined;
export const icon = (name: string, paths: string) => {
  ICON_VARS.push(`:root { --cp-i-${name}: ${mask(paths)}; }`);
  MASK_NAMES.push(name);
  return `var(--cp-i-${name})`;
};

/** Keeps a set the daemon sent: its masks join the CSS vars, and Paseo's icons and the plugin's redraw with it. */
export function addIconSet(set: string, twins: Record<string, string>) {
  iconSets[set] = twins;
  if (Platform.OS === "web" && typeof document !== "undefined") {
    if (!iconSetStyle) {
      iconSetStyle = document.createElement("style");
      document.head.appendChild(iconSetStyle);
    }
    const vars = MASK_NAMES.filter((name) => twins[name]).map((name) => `--cp-i-${name}: ${mask(twins[name]!)};`);
    iconSetStyle.textContent += `:root[data-cp-rt-icons="${set}"] { ${vars.join(" ")} }\n`;
  }
  iconSetListeners.forEach((listener) => listener());
}

/** A row icon as a mask; a swapped icon leaves out the Lucide shapes it hides. */
export function rowIconMask(svg: DomElement) {
  let markup = svg.outerHTML;
  if (svg.hasAttribute(UUI)) {
    const copy = svg.cloneNode(true);
    for (const child of Array.from(copy.children)) if (!child.hasAttribute(UUI)) child.remove();
    markup = copy.outerHTML;
  }
  // Some of Paseo's icons (its own logo) omit xmlns, without which an SVG image doesn't render.
  markup = markup.replace(/^<svg(?![^>]*\sxmlns=)/, '<svg xmlns="http://www.w3.org/2000/svg"');
  return `url("data:image/svg+xml,${encodeURIComponent(markup)}")`;
}

const UUI = "data-cp-uui";
// Lucide's shapes are hidden rather than removed: React still owns them and would fail to remove a missing child.
const UUI_CSS = ["path", "circle", "rect", "line", "polyline", "polygon", "ellipse"].map((tag) => `svg[${UUI}] > ${tag}`).join(", ") + " { display: none; }";
// "lucide-folder-git-2" → "FolderGit2"
const lucideName = (svg: DomElement) => (svg.getAttribute("class") ?? "").match(/\blucide-([a-z0-9-]+)/)?.[1]?.replace(/(?:^|-)([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** Paseo's own Lucide icons (`svg.lucide-<name>`) drawn with their twin in the chosen icon set once it has arrived;
 * icons without one, and "lucide", stay Lucide. */
export function nativeIconSet(chosen: () => string) {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  let style: DomElement | undefined;
  let shown = "lucide";
  const current = () => (iconSets[chosen()] ? chosen() : "lucide");
  const swap = (svg: DomElement, set: string) => {
    const from = svg.getAttribute(UUI) ?? "lucide";
    const paths = iconSets[set]?.[lucideName(svg) ?? ""];
    if (from === (paths ? set : "lucide")) return;
    svg.querySelector(`g[${UUI}]`)?.remove();
    svg.removeAttribute(UUI);
    if (paths) {
      svg.insertAdjacentHTML("beforeend", `<g ${UUI}="">${paths}</g>`);
      svg.setAttribute(UUI, set);
    }
    const slot = svg.closest(ROW_ICON);
    if (slot && !slot.hasAttribute("data-cp-chev")) slot.style.setProperty("--cp-row-icon", rowIconMask(svg));
  };
  const sync = (roots: DomElement[]) => {
    const set = current();
    if (set !== shown) {
      shown = set;
      if (set === "lucide") {
        style?.remove();
        style = undefined;
      } else if (!style) {
        style = document.createElement("style");
        style.textContent = UUI_CSS;
        document.head.appendChild(style);
      }
      roots = [document.body as DomElement];
    }
    if (set !== "lucide" || roots[0] === document.body) for (const svg of within(roots, "svg.lucide")) swap(svg, set);
  };
  // Settled catches a pref change that added nothing new; a set arriving redraws too.
  const unsubscribe = subscribeIconSets(() => sync([]));
  const stop = watchDom({ added: sync, settled: () => current() !== shown && sync([]) }, () => {
    for (const svg of Array.from(document.querySelectorAll(`svg[${UUI}]`))) swap(svg, "lucide");
    style?.remove();
  });
  return () => {
    unsubscribe();
    stop();
  };
}

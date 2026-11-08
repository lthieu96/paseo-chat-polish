// Stacks of images in replies Paseo draws itself (a reply with text and images; image-only replies are the plugin's ImagesItem).
import { Platform } from "react-native";
import { openStackViewer, stackViewerHosted, type StackImage } from "../stack-viewer";
import { watchDom, within, type DomElement, type MutationObserverClass, type WebDocument } from "./dom";
import { imageRuns, type ImageNode, type StackBy } from "./image-runs";
import { MD } from "./selectors";

declare const document: WebDocument;
declare const MutationObserver: MutationObserverClass;

// Only with Image stacks on, and off with the Inline image choice, like the thumbnails.
const ON = ':root:not([data-cp-rt-images="native"])[data-cp-rt-stacks="on"]';
const IMG = "data-cp-stack-i";
const STATE = "data-cp-stack";
const HOLE = "data-cp-stack-hole";
const DECO = "data-cp-stack-deco";
const CLOSE = "data-cp-stack-close";

// The first image of a closed stack, with the next two as cards fanned behind it. The deco anchor sits just before the
// image at the same top, so its cards and badge line up with it without moving Paseo's elements.
const CARD = `position: absolute; left: 0; top: 0; width: var(--cp-thumb-w); height: var(--cp-thumb-h); box-sizing: border-box;
  border: 1px solid var(--cp-rule); border-radius: 8px; background: var(--cp-raised) center / cover no-repeat; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22);`;
const STACK_CSS = `
${ON} ${MD} img[${IMG}] { vertical-align: top; }
${ON} ${MD} img[${STATE}="closed"]:not([${IMG}="0"]) { display: none !important; }
${ON} ${MD} [${HOLE}] { display: none !important; }
${ON} ${MD} img[${STATE}="closed"][${IMG}="0"] { position: relative; z-index: 1; margin-top: 20px !important; margin-right: 26px !important; cursor: pointer; }
${MD} [${DECO}] { display: none; }
${ON} ${MD} [${DECO}][${STATE}="closed"] { display: inline-block; position: relative; width: 0; height: var(--cp-thumb-h); margin-top: 20px; vertical-align: top; pointer-events: none; }
${ON} ${MD} [${DECO}] > [data-cp-card] { ${CARD} z-index: 0; }
${ON} ${MD} [${DECO}] > [data-cp-card="1"] { transform: translate(9px, -7px) rotate(2.5deg); }
${ON} ${MD} [${DECO}] > [data-cp-card="2"] { transform: translate(18px, -13px) rotate(5deg); }
${ON} ${MD} [${DECO}] > [data-cp-more] {
  position: absolute; z-index: 2; top: calc(var(--cp-thumb-h) - 30px); left: calc(var(--cp-thumb-w) - 8px); transform: translateX(-100%);
  padding: 3px 8px; border-radius: 999px; background: rgba(8, 9, 11, 0.72); color: #fff; font: 600 12px/1.2 -apple-system, BlinkMacSystemFont, system-ui, sans-serif; white-space: nowrap;
}
${ON} ${MD} img[${STATE}="open"] { cursor: zoom-in; }
[${CLOSE}] { display: none; }
${ON} ${MD} [${CLOSE}][${STATE}="open"] {
  display: flex; align-items: center; width: fit-content; height: 26px; margin: 6px 0 2px; padding: 0 11px;
  border: 1px solid var(--cp-rule, var(--colors-border)); border-radius: 999px; background: var(--cp-raised, var(--colors-surface1));
  color: var(--cp-muted, var(--colors-foreground-muted)); font: 500 12px/1 -apple-system, BlinkMacSystemFont, system-ui, sans-serif; cursor: pointer;
}
${ON} ${MD} [${CLOSE}][${STATE}="open"]:hover { color: var(--cp-fg, var(--colors-foreground)); }
`;

type Placed = DomElement & { insertAdjacentElement(where: "beforebegin", el: DomElement): void };
type PressEvent = { target: unknown; preventDefault(): void; stopPropagation(): void; stopImmediatePropagation(): void };
type EventDoc = {
  addEventListener(type: string, listener: (event: PressEvent) => void, capture?: boolean): void;
  removeEventListener(type: string, listener: (event: PressEvent) => void, capture?: boolean): void;
};

const src = (img: DomElement) => img.getAttribute("src") ?? "";

/**
 * Two or more images in a row in a reply show as a stack. The first press spreads it; from then on each image opens the
 * viewer (Paseo's own once found) with this stack's images (← → between them), and "Close stack" folds it back. Without a mounted viewer
 * host (sidebar hidden) a press on a spread image is left to Paseo. Browser only. Returns cleanup.
 * shortcut: relies on Paseo drawing reply images as plain <img> inside .enrm-text (Paseo 0.12+); a stack's paragraph gets
 * extra elements (the deco anchor and the close button) that Paseo's renderer doesn't own.
 */
export function stackImages() {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  const style = document.createElement("style");
  style.textContent = STACK_CSS;
  document.head.appendChild(style);
  // Spread stacks, keyed by their first image, so one stays spread when Paseo's virtual list remounts the reply.
  const spread = new Set<string>();
  const off = () =>
    document.documentElement.getAttribute("data-cp-rt-images") === "native" || document.documentElement.getAttribute("data-cp-rt-stacks") !== "on";

  // Each face's stack, so a press finds its images without re-walking the reply.
  const stacks = new Map<DomElement, DomElement[]>();

  const unmark = (img: DomElement) => {
    img.removeAttribute(IMG);
    img.removeAttribute(STATE);
  };

  const stackBy = (): StackBy => {
    const by = document.documentElement.getAttribute("data-cp-rt-stackby");
    return by === "section" || by === "reply" ? by : "row";
  };

  const mark = (reply: DomElement) => {
    // Regrouping can turn a hidden image into a stack's face, so hidden paragraphs are worked out afresh each pass.
    for (const hole of within([reply], `[${HOLE}]`)) hole.removeAttribute(HOLE);
    const runs = imageRuns(reply as unknown as ImageNode, stackBy()).map((run) => run as unknown as DomElement[]);
    const faces = new Set<DomElement>();
    for (const run of runs) {
      if (run.length < 2) {
        for (const img of run) if (img.hasAttribute(IMG)) unmark(img);
        continue;
      }
      const face = run[0]!;
      faces.add(face);
      stacks.set(face, run);
      const state = spread.has(src(face)) ? "open" : "closed";
      run.forEach((img, i) => {
        if (img.getAttribute(IMG) !== String(i)) img.setAttribute(IMG, String(i));
        if (img.getAttribute(STATE) !== state) img.setAttribute(STATE, state);
      });
      // A paragraph holding only images hidden in a closed stack would leave its margin as a gap.
      for (const img of run.slice(1)) {
        const p = img.parentElement;
        if (!p || p === reply) continue;
        const onlyHidden = state === "closed" && !(p.textContent ?? "").trim() && Array.from(p.querySelectorAll("img")).every((n) => run.indexOf(n) > 0);
        if (onlyHidden !== p.hasAttribute(HOLE)) onlyHidden ? p.setAttribute(HOLE, "") : p.removeAttribute(HOLE);
      }
      placeDeco(face, run, state);
      placeClose(face, state);
    }
    // Faces that stopped being one (a reply that streamed text between its images) lose their extras.
    for (const [face] of stacks) {
      if (!face.isConnected || (face.closest(MD) === reply && !faces.has(face))) {
        stacks.delete(face);
        faceExtra(face, DECO)?.remove();
        faceExtra(face, CLOSE)?.remove();
      }
    }
  };

  // The extras sit just before the face, the close button first.
  const faceExtra = (face: DomElement, attr: string): DomElement | null => {
    for (let el = face.previousElementSibling; el && (el.hasAttribute(DECO) || el.hasAttribute(CLOSE)); el = el.previousElementSibling) {
      if (el.hasAttribute(attr)) return el;
    }
    return null;
  };

  const placeDeco = (face: DomElement, run: DomElement[], state: string) => {
    let deco = faceExtra(face, DECO);
    if (!deco) {
      deco = document.createElement("span");
      deco.setAttribute(DECO, "");
      for (const i of ["2", "1"]) {
        const card = document.createElement("span");
        card.setAttribute("data-cp-card", i);
        deco.appendChild(card);
      }
      const more = document.createElement("span");
      more.setAttribute("data-cp-more", "");
      deco.appendChild(more);
      (face as Placed).insertAdjacentElement("beforebegin", deco);
    }
    if (deco.getAttribute(STATE) !== state) deco.setAttribute(STATE, state);
    for (const i of [1, 2]) {
      const card = deco.querySelector(`[data-cp-card="${i}"]`);
      const url = run[i] ? src(run[i]!) : "";
      const value = url ? `url("${url.replace(/"/g, '\\"')}")` : "none";
      if (card && card.style.getPropertyValue("background-image") !== value) card.style.setProperty("background-image", value);
      if (card) card.style.setProperty("display", run[i] ? "block" : "none");
    }
    const more = deco.querySelector("[data-cp-more]");
    const label = `+${run.length - 1}`;
    if (more && more.textContent !== label) more.textContent = label;
  };

  const placeClose = (face: DomElement, state: string) => {
    let close = faceExtra(face, CLOSE);
    if (!close) {
      close = document.createElement("button");
      close.setAttribute(CLOSE, "");
      close.setAttribute("type", "button");
      close.textContent = "Close stack";
      const deco = faceExtra(face, DECO);
      ((deco ?? face) as Placed).insertAdjacentElement("beforebegin", close);
    }
    if (close.getAttribute(STATE) !== state) close.setAttribute(STATE, state);
  };

  const process = (roots: DomElement[]) => {
    const replies = new Set<DomElement>(within(roots, MD));
    for (const root of roots) {
      const reply = root.closest?.(MD);
      if (reply) replies.add(reply);
    }
    for (const reply of replies) if (reply.isConnected) mark(reply);
  };

  const setState = (face: DomElement, open: boolean) => {
    if (open) spread.add(src(face));
    else spread.delete(src(face));
    const reply = face.closest(MD);
    if (reply) mark(reply);
  };

  // Capture phase, so a press on a stack never reaches Paseo's handler for the image.
  const onPress = (e: PressEvent) => {
    if (off()) return;
    const target = e.target as DomElement | null;
    const close = target?.closest?.(`[${CLOSE}]`);
    if (close) {
      e.preventDefault();
      e.stopPropagation();
      let face = close.nextElementSibling;
      while (face && face.hasAttribute(DECO)) face = face.nextElementSibling;
      if (face) setState(face, false);
      return;
    }
    const img = target?.closest?.(`${MD} img[${IMG}]`);
    if (!img) return;
    const face = [...stacks.entries()].find(([, run]) => run.includes(img));
    if (!face) return;
    if (img.getAttribute(STATE) === "closed") {
      e.preventDefault();
      e.stopImmediatePropagation();
      setState(face[0], true);
      return;
    }
    if (!stackViewerHosted()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const images: StackImage[] = face[1].map((el) => ({ alt: el.getAttribute("alt") || "Image", url: src(el) }));
    openStackViewer(images, Math.max(0, face[1].indexOf(img)));
  };
  const events = document as unknown as EventDoc;
  events.addEventListener("click", onPress, true);

  const unwatch = watchDom({ added: process, settled: process }, () => {});
  // Turning stacks on or changing how they group regroups every reply now, not on the next DOM change.
  const prefs = new MutationObserver(() => process([document.documentElement]));
  prefs.observe(document.documentElement, { childList: false, subtree: false, attributes: true, attributeFilter: ["data-cp-rt-stacks", "data-cp-rt-stackby"] });
  return () => {
    prefs.disconnect();
    unwatch();
    events.removeEventListener("click", onPress, true);
    style.remove();
    for (const [face, run] of stacks) {
      faceExtra(face, DECO)?.remove();
      faceExtra(face, CLOSE)?.remove();
      run.forEach(unmark);
    }
    for (const hole of Array.from(document.querySelectorAll(`[${HOLE}]`))) hole.removeAttribute(HOLE);
    stacks.clear();
  };
}

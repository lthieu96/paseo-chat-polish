// A theme's background image, blurred under the theme's color, behind the whole window (web and desktop), and the file picker that makes one.
import { Platform } from "react-native";
import { splitTop } from "../css-guard";
import { backdrop, extremes, meshColors, type Extremes } from "../../shared/palette";
import type { ThemeDraft } from "../../shared/theme";
import { watchDom, type DomElement, type WebDocument } from "./dom";
import { meshImage } from "./mesh";

declare function getComputedStyle(el: DomElement): { backgroundColor: string };
type Rule = { selectorText?: string; style?: { getPropertyValue(name: string): string }; cssRules?: ArrayLike<Rule> };
declare const document: WebDocument & { styleSheets: ArrayLike<{ ownerNode: unknown; cssRules: ArrayLike<Rule> }> };

type FileLike = { name: string };
type Img = { onload: (() => void) | null; onerror: (() => void) | null; src: string; naturalWidth: number; naturalHeight: number };
type Canvas = {
  width: number;
  height: number;
  toDataURL(type: string, quality: number): string;
  getContext(kind: "2d"): { drawImage(img: Img, x: number, y: number, w: number, h: number): void; getImageData(x: number, y: number, w: number, h: number): { data: ArrayLike<number> } } | null;
};
type Input = { type: string; accept: string; files: ArrayLike<FileLike> | null; click(): void; addEventListener(type: "change" | "cancel", listener: () => void): void };
// The plugin compiles without lib.dom (it also runs on React Native), so the browser globals used here are typed by hand.
type Web = {
  document: { createElement(tag: "input"): Input; createElement(tag: "canvas"): Canvas };
  Image: new () => Img;
  URL: { createObjectURL(blob: unknown): string; revokeObjectURL(url: string): void };
  Blob: new (parts: unknown[], options: { type: string }) => unknown;
  atob(data: string): string;
  innerWidth: number;
  innerHeight: number;
};
const web = () => globalThis as unknown as Web;

/** Draws an image `width` pixels wide on a new canvas. */
function draw(img: Img, width: number) {
  const canvas = web().document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * width));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { canvas, pixels: () => ctx.getImageData(0, 0, canvas.width, canvas.height).data };
}

// The colors a 64px-wide copy samples are about as wide as what the window's blur averages.
const SAMPLE = 64;

/**
 * Lets the user pick any image the browser can decode (it is re-encoded here, so the daemon only ever gets a JPEG): returns it
 * downscaled to 1024px as a JPEG data URL (the blur hides any more detail), its pixels at 64px wide, and its name.
 */
export function pickImage(): Promise<{ dataUrl: string; pixels: ArrayLike<number>; name: string } | undefined> {
  const w = web();
  return new Promise((resolve, reject) => {
    const input = w.document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("cancel", () => resolve(undefined));
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return resolve(undefined);
      const url = w.URL.createObjectURL(file);
      const img = new w.Image();
      img.onerror = () => (w.URL.revokeObjectURL(url), reject(new Error("The file isn't an image this browser can read")));
      img.onload = () => {
        try {
          const big = draw(img, Math.min(img.naturalWidth, Math.round(1024 * Math.min(1, img.naturalWidth / Math.max(img.naturalWidth, img.naturalHeight)))));
          resolve({ dataUrl: big.canvas.toDataURL("image/jpeg", 0.88), pixels: draw(img, SAMPLE).pixels(), name: file.name.replace(/\.[^.]+$/, "") });
        } catch (error) {
          reject(error);
        } finally {
          w.URL.revokeObjectURL(url);
        }
      };
      img.src = url;
    });
    input.click();
  });
}

const sampled = new Map<string, Promise<Extremes>>();

/** The extremes (see extremes) of a background image, read once per image id from `src`, a data: or blob: URL of it. */
export function imageExtremes(id: string, src: string) {
  let p = sampled.get(id);
  if (!p) {
    p = new Promise<Extremes>((resolve, reject) => {
      const img = new (web().Image)();
      img.onerror = () => reject(new Error("The background image can't be read"));
      img.onload = () => {
        try {
          resolve(extremes(draw(img, SAMPLE).pixels()));
        } catch (error) {
          reject(error);
        }
      };
      img.src = src;
    });
    sampled.set(id, p);
    p.catch(() => sampled.delete(id));
  }
  return p;
}

/** A blob: URL for a data URL, so the stylesheet holds a short URL rather than megabytes of base64. */
function blobUrl(dataUrl: string) {
  const w = web();
  const [head, body] = dataUrl.split(",", 2);
  const bin = w.atob(body ?? "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return w.URL.createObjectURL(new w.Blob([bytes], { type: /^data:([^;]+)/.exec(head ?? "")?.[1] ?? "image/jpeg" }));
}

/**
 * Selectors of the rules that paint text with a surface variable: clearing the variables in #root would hide that text (Paseo 0.15's
 * light buttons write their label in surface0), so they get the page color back. Unistyles names its classes by hash, hence the scan.
 */
function surfaceText(skip: unknown) {
  const out: string[] = [];
  const walk = (rules: ArrayLike<Rule>) => {
    for (const r of Array.from(rules)) {
      if (r.cssRules) walk(r.cssRules);
      if (r.selectorText && /--colors-surface(0|-sidebar|-workspace)\b/.test(r.style?.getPropertyValue("color") ?? "")) out.push(...splitTop(r.selectorText, (ch) => ch === ",").map((x) => x.trim()));
    }
  };
  for (const sheet of Array.from(document.styleSheets))
    try {
      if (sheet.ownerNode !== skip) walk(sheet.cssRules);
    } catch {
      // A cross-origin sheet can't be read; Paseo's are same-origin.
    }
  return out;
}

const ruleCount = () => Array.from(document.styleSheets).reduce((n, s) => {
  try {
    return n + s.cssRules.length;
  } catch {
    return n;
  }
}, 0);

const ROOT = "data-cp-bg";
const CLEAR = "data-cp-bgclear";
const R = `html:root[${ROOT}]`;

/**
 * What a theme shows behind the window, as a picture: its image (by its id on the daemon) or its mesh gradient (drawn into one, see
 * meshImage), with how much of it shows and how blurred. Undefined when it has neither.
 */
export function pictureOf(t: ThemeDraft | undefined) {
  if (t?.background) return { ...t.background, mesh: undefined };
  if (!t?.mesh) return undefined;
  const colors = meshColors(t);
  const { strength, blur, grain, seed } = t.mesh;
  return { id: `mesh:${JSON.stringify([colors, grain, seed])}`, strength, blur, mesh: { colors, grain, seed } };
}

/**
 * Paints the theme's background behind the window while `theme()` has one (undefined while the plugin theme is off): its image or its
 * mesh gradient drawn as a picture (see pictureOf), in one fixed layer blurred by a CSS `filter` under the theme's color (see
 * backdrop): it's rasterized once, so scrolling costs nothing, unlike a backdrop-filter on each surface. Every screen in #root paints
 * its page, sidebar and workspace through Paseo's surface variables, which are cleared there; layers with a color of their own are
 * found by hit test and cleared too. The content panel (Floating) or the whole content area (Flat) is lifted with the raised color.
 * Menus, dialogs and Command Center render outside #root and keep the theme's solid colors. Returns cleanup.
 */
export function paintBackdrop(theme: () => ThemeDraft | undefined, subscribe: (repaint: () => void) => () => void, load: (id: string) => Promise<string>) {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  const root = document.documentElement;
  const style = document.createElement("style");
  document.head.appendChild(style);
  // Pictures by id; `own` URLs were made here (daemon images) and are revoked on cleanup, mesh pictures belong to meshImage's cache.
  const images = new Map<string, { url: string; ext: Extremes; own: boolean }>();
  const loading = new Set<string>();
  // Rescanned only when the number of rules changes (unistyles adds a class when a new style first renders).
  let scanned = -1;
  let texts: string[] = [];
  // Screens remount on navigation, so this runs whenever the DOM settles: whatever in #root fills most of the window's height under
  // five points across it, and still paints, paints its own color (the navigator's containers inline, the explorer's backdrop).
  const clear = () => {
    const { innerWidth: w, innerHeight: h } = web();
    for (const x of [0.1, 0.3, 0.5, 0.7, 0.9])
      for (const el of document.elementsFromPoint(w * x, h / 2))
        if (!el.hasAttribute(CLEAR) && !el.hasAttribute("data-cp-win") && el.closest("#root") && el.getBoundingClientRect().height >= h * 0.8 && getComputedStyle(el).backgroundColor !== "rgba(0, 0, 0, 0)") el.setAttribute(CLEAR, "");
  };
  const paint = () => {
    const t = theme();
    const pic = pictureOf(t);
    const image = pic && images.get(pic.id);
    if (pic && !image && !loading.has(pic.id)) {
      const { id, mesh } = pic;
      loading.add(id);
      (mesh ? meshImage(mesh.colors, mesh.grain, mesh.seed).then((url) => ({ url, own: false })) : load(id).then((dataUrl) => ({ url: blobUrl(dataUrl), own: true })))
        .then(async ({ url, own }) => {
          images.set(id, { url, own, ext: await imageExtremes(id, url).catch((e: unknown) => (own && web().URL.revokeObjectURL(url), Promise.reject(e))) });
          paint();
        })
        .catch((error: unknown) => console.warn("[chat-polish] Background unavailable", error))
        .finally(() => loading.delete(id));
    }
    const shown = t && pic && image ? t : undefined;
    if (shown && ruleCount() !== scanned) (texts = surfaceText(style)), (scanned = ruleCount());
    const b = shown && pic && image ? backdrop(shown, image.ext, pic.strength) : undefined;
    const css =
      shown && pic && image && b
        ? `${R} { background: ${shown.colors.background} !important; }
${R} body, ${R} [${CLEAR}] { background-color: transparent !important; }
${R}::before { content: ""; position: fixed; inset: -${pic.blur * 2}px; z-index: -1; pointer-events: none; background: linear-gradient(${b.veil}, ${b.veil}), url("${image.url}") center / cover no-repeat; filter: blur(${pic.blur}px); }
${R} #root { --colors-surface0: transparent; --colors-surface-sidebar: transparent; --colors-surface-workspace: transparent; }
${R} [data-cp-win="panel"], ${R}[data-cp-rt-window="flat"] [data-cp-win="row"] { background-color: ${b.lift} !important; }
${texts.length ? `${texts.map((x) => `${R} ${x}`).join(", ")} { color: ${shown.colors.background} !important; }` : ""}`
        : "";
    if (css) root.setAttribute(ROOT, "");
    else root.removeAttribute(ROOT);
    if (style.textContent !== css) style.textContent = css;
    if (css) clear();
  };
  const unsubscribe = subscribe(paint);
  return watchDom({ settled: paint }, () => {
    unsubscribe();
    style.remove();
    root.removeAttribute(ROOT);
    images.forEach(({ url, own }) => own && web().URL.revokeObjectURL(url));
  });
}

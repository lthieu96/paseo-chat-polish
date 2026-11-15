// A theme from an image's pixels: cluster the colors in OKLab, take the image's own hue for the surfaces and its most colorful cluster
// for the accent, then hold the text colors to WCAG contrast on the background. The image then sits behind the window, so `backdrop`
// works out how much of it may show while that text stays readable over it.
import { contrast, type ThemeDraft } from "./theme.ts";

type Rgb = [number, number, number];
/** OKLab [L, a, b] or OKLCH [L, C, h°]. */
type Vec = [number, number, number];

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const toHex = (c: Rgb) => `#${c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("")}`;
/** WCAG relative luminance, 0–1. */
const luminance = ([r, g, b]: Rgb) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

// OKLab (Björn Ottosson, 2020): lightness steps look even across hues, unlike HSL, where yellow at a given L is far brighter than blue.
function oklab([r, g, b]: Rgb): Vec {
  const [lr, lg, lb] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/** OKLCH → #rrggbb; a color outside sRGB keeps its lightness and hue and loses chroma. */
function oklch(L: number, C: number, h: number) {
  const [ca, sa] = [Math.cos((h * Math.PI) / 180), Math.sin((h * Math.PI) / 180)];
  let rgb: Vec = [0, 0, 0];
  for (let c = C; ; c -= 0.002) {
    const [a, b] = [c * ca, c * sa];
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
    if (c <= 0 || rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4)) break;
  }
  return toHex(rgb.map((v) => gam(clamp(v))) as Rgb);
}

const toLch = ([L, a, b]: Vec): Vec => [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];

/** k-means in OKLab, seeded at lightness quantiles so the same image always gives the same clusters. */
function clusters(px: Vec[], k: number) {
  const sorted = [...px].sort((a, b) => a[0] - b[0]);
  let centers = Array.from({ length: k }, (_, i) => sorted[Math.floor(((i + 0.5) / k) * sorted.length)]!);
  let counts: number[] = [];
  for (let round = 0; round < 12; round++) {
    const sums = centers.map(() => [0, 0, 0]);
    counts = centers.map(() => 0);
    for (const p of px) {
      let best = 0;
      let bestD = Infinity;
      centers.forEach((c, i) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bestD) (bestD = d), (best = i);
      });
      sums[best]!.forEach((_, j) => (sums[best]![j]! += p[j]!));
      counts[best]!++;
    }
    centers = centers.map((c, i) => (counts[i] ? (sums[i]!.map((v) => v / counts[i]!) as Vec) : c));
  }
  return centers.map((c, i) => ({ lch: toLch(c), share: counts[i]! / px.length })).filter((c) => c.share > 0);
}

/** Moves a color's lightness away from `bg` until it reaches `ratio` (or the end of the range). */
function reach([L, C, h]: Vec, bg: string, ratio: number, dark: boolean) {
  let hex = oklch(L, C, h);
  while (contrast(hex, bg) < ratio && L > 0 && L < 1) hex = oklch((L = clamp(L + (dark ? 0.01 : -0.01))), C, h);
  return hex;
}

const opaque = (rgba: ArrayLike<number>) => {
  const px: Rgb[] = [];
  for (let i = 0; i + 3 < rgba.length; i += 4) if (rgba[i + 3]! >= 128) px.push([rgba[i]!, rgba[i + 1]!, rgba[i + 2]!]);
  return px;
};

/**
 * A theme from RGBA pixels (a small downscale of the image is plenty): dark or light by the image's mean lightness. Surfaces take the
 * dominant cluster's hue at low chroma, at the OKLab lightness of the plugin's neutral greys; the accent is the most chromatic cluster
 * with a real share, or the image's hue (blue for a grey image) when the image is close to grey. Text is held to 7:1, muted text to
 * 4.5:1 and the accent to 3:1 on the background.
 */
export function themeFromPixels(rgba: ArrayLike<number>): Pick<ThemeDraft, "appearance" | "colors" | "sidebar" | "syntax"> {
  const px = opaque(rgba);
  // A fully transparent image: a dark grey, like the default theme.
  if (!px.length) px.push([40, 40, 40]);
  const all = clusters(px.map(oklab), 6);
  const dark = all.reduce((sum, c) => sum + c.share * c.lch[0], 0) < 0.6;
  const base = all.reduce((a, b) => (b.share > a.share ? b : a)).lch;
  // OKLCH chroma, not HSL saturation: HSL rates dark mud as saturated and gives grey a hue of 0 (red).
  const vivid = all.filter((c) => c.share >= 0.03).reduce((a, b) => (b.lch[1] > a.lch[1] ? b : a)).lch;
  const hue = base[1] >= 0.01 ? base[2] : 250;
  const C = Math.min(base[1], dark ? 0.03 : 0.02);
  const surface = (L: number) => oklch(L, C, hue);
  let accentH = vivid[1] >= 0.05 ? vivid[2] : hue;
  // Dark yellow-green reads as mustard or olive on a light page (Material's DislikeAnalyzer): turn it toward amber.
  if (!dark && accentH > 85 && accentH < 115) accentH = 70;
  const accentC = clamp(vivid[1], 0.08, 0.16);
  const textC = Math.min(C, 0.015);
  const background = surface(dark ? 0.235 : 0.943);
  return {
    appearance: dark ? "dark" : "light",
    colors: {
      background,
      raised: surface(dark ? 0.283 : 0.979),
      control: surface(dark ? 0.311 : 0.901),
      border: surface(dark ? 0.365 : 0.853),
      foreground: reach([dark ? 0.87 : 0.22, textC, hue], background, 7, dark),
      mutedForeground: reach([dark ? 0.72 : 0.42, textC, hue], background, 4.5, dark),
      ring: oklch(dark ? 0.55 : 0.6, textC, hue),
      accent: reach([dark ? 0.78 : 0.55, accentC, accentH], background, 3, dark),
    },
    sidebar: surface(dark ? 0.21 : 0.923),
    syntax: dark ? "one-dark-darker-mariana" : "github-light",
  };
}

/** What text over an image has to read against: its brightest (for a dark theme) and darkest colors that cover a real area. */
export interface Extremes {
  bright: string;
  dark: string;
}

/** The 95th and 5th percentile of the pixels' luminance (WCAG F83: test against the lightest part of the image behind light text). */
export function extremes(rgba: ArrayLike<number>): Extremes {
  const px = opaque(rgba).sort((a, b) => luminance(a) - luminance(b));
  if (!px.length) return { bright: "#808080", dark: "#808080" };
  const at = (q: number) => toHex(px[Math.min(px.length - 1, Math.floor(q * px.length))]!);
  return { bright: at(0.95), dark: at(0.05) };
}

const over = (top: Rgb, a: number, under: Rgb) => top.map((t, i) => a * t + (1 - a) * under[i]!) as Rgb;

// Alphas go out as one byte, rounded up so the layers drawn are never thinner than the ones checked.
const byte = (a: number) => Math.ceil(clamp(a) * 255 - 1e-9) / 255;
const hex8 = (hex: string, a: number) => hex + Math.round(byte(a) * 255).toString(16).padStart(2, "0");

/** How much of the raised color lifts the content panel off the window's background. */
export const LIFT = 0.35;

/** The raised color at LIFT, over the content panel. */
export const lift = (t: Pick<ThemeDraft, "colors">) => hex8(t.colors.raised, LIFT);

// Text, muted text and accent: the ratio held over the window's background, and the WCAG AA floor.
const RULES = [
  ["foreground", 7, 4.5],
  ["mutedForeground", 4.5, 4.5],
  ["accent", 3, 3],
] as const;

/**
 * Whether the theme's text keeps its ratios (RULES) over `under`, on the sidebar (as is) and the panel (lifted). A theme already under
 * a ratio on its own background (Mariana's text is 7.03:1) may lose up to 10% of its contrast there, never going under AA.
 */
function readable(c: ThemeDraft["colors"], under: Rgb) {
  const surfaces = (u: Rgb) => [u, over(toRgb(c.raised), byte(LIFT), u)].map(toHex);
  const own = surfaces(toRgb(c.background));
  const mine = surfaces(under);
  return RULES.every(([k, ratio, floor]) => {
    const target = Math.max(floor, Math.min(ratio, 0.9 * Math.min(...own.map((s) => contrast(c[k], s)))));
    return mine.every((s) => contrast(c[k], s) >= target);
  });
}

/**
 * The layers over the background image, as #rrggbbaa (React Native, which draws the dashboard preview, drops color-mix()):
 * - `veil`: the theme's background color laid flat over the image, so the whole window keeps the theme's one tone (a luminosity
 *   layer that kept the image's hue was tried: a cream moon on a navy theme turned into a brown patch);
 * - `lift`: the raised color over the content panel.
 * `strength` is the most of the image that shows, in percent; the veil gets thicker when text over the image's worst patch (its
 * brightest for a dark theme, darkest for a light one) would fall under the theme's own ratios on the sidebar (veil only) or the panel
 * (the lift on top): 7:1 text, 4.5:1 muted text, 3:1 accent.
 */
export function backdrop(t: Pick<ThemeDraft, "appearance" | "colors">, ext: Extremes, strength: number) {
  const c = t.colors;
  const [bg, pixel] = [toRgb(c.background), toRgb(t.appearance === "dark" ? ext.bright : ext.dark)];
  const ok = (a: number) => readable(c, over(bg, byte(a), pixel));
  // The thinnest veil from 1 − strength up that passes: contrast grows with its opacity, up to the theme's own background.
  let [lo, hi] = [1 - strength / 100, 1];
  if (ok(lo)) hi = lo;
  else
    for (let i = 0; i < 16; i++) {
      const m = (lo + hi) / 2;
      if (ok(m)) hi = m;
      else lo = m;
    }
  return { veil: hex8(c.background, hi), lift: lift(t) };
}

/** The veil a mesh is made for: its spots are as vivid as text allows under it (Strength's default, 35%, shows 65% less). */
const MESH_VEIL = 0.65;

/**
 * The color spots of a mesh gradient drawn as the window's background picture, from the theme alone: its background, a deeper (or, on a
 * light theme, paler) shade of it, then its accent, surface and a neighboring hue, each as far toward a wallpaper tone as text still
 * reads over it under MESH_VEIL. The picture then goes the background image's way (backdrop), whose veil needn't get any thicker.
 */
export function meshColors(t: Pick<ThemeDraft, "appearance" | "colors">) {
  const c = t.colors;
  const dark = t.appearance === "dark";
  const bg = toRgb(c.background);
  const [L, bgC, bgH] = toLch(oklab(bg));
  const [, , accH] = toLch(oklab(toRgb(c.accent)));
  const fits = (hex: string) => readable(c, over(bg, byte(MESH_VEIL), toRgb(hex)));
  // The furthest lightness from the background's toward `far` that fits (contrast only falls further out); the background if none.
  const spot = (C: number, h: number, far: number) => {
    let [ok, bad] = [L, far];
    if (fits(oklch(far, C, h))) ok = far;
    else
      for (let i = 0; i < 16; i++) {
        const m = (ok + bad) / 2;
        if (fits(oklch(m, C, h))) ok = m;
        else bad = m;
      }
    const hex = oklch(ok, C, h);
    return fits(hex) ? hex : c.background;
  };
  const near = (accH + 40) % 360;
  return dark
    ? [c.background, oklch(clamp(L - 0.06), bgC, bgH), spot(0.14, accH, 0.85), spot(0.12, bgH, 0.75), spot(0.1, near, 0.7)]
    : [c.background, oklch(0.985, 0.01, bgH), spot(0.12, accH, 0.55), spot(0.08, bgH, 0.6), spot(0.08, near, 0.6)];
}

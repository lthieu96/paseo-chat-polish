// The mesh gradient a theme can have behind the window instead of a picture: drawn once by Paper Shaders (WebGL) into an image, which
// then goes the background image's way (blurred under the theme's veil, see paintBackdrop).
import {
  getShaderColorFromString,
  getShaderNoiseTexture,
  GrainGradientShapes,
  grainGradientFragmentShader,
  meshGradientFragmentShader,
  ShaderFitOptions,
  ShaderMount,
  staticMeshGradientFragmentShader,
  staticRadialGradientFragmentShader,
  warpFragmentShader,
  WarpPatterns,
} from "@paper-design/shaders";
import type { DomElement } from "./dom";

type Canvas = { toBlob(done: (blob: unknown) => void, type: string, quality: number): void };
declare const document: { createElement(tag: "div"): DomElement; body: { appendChild(el: DomElement): void } };
declare function requestAnimationFrame(cb: () => void): number;
declare const URL: { createObjectURL(blob: unknown): string };

/** The animation frame drawn: one still composition, the same on every load. */
const FRAME = 400;
/** The image's size; the window's blur hides any more detail, and `cover` fits it to any window. */
const [WIDTH, HEIGHT] = [1600, 1000];
// shortcut: never revoked (the window may still show one the preview made), a few hundred KB per color edit in the dashboard; add
// eviction if editing sessions get long.
const made = new Map<string, Promise<string>>();
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** A seeded random number generator (mulberry32): the same seed always gives the same picture. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Which of Paper's gradients draws the picture, and how. No seed: the mesh gradient's one composition (themes saved before Shuffle).
 * A seed picks a mesh (moving or static), a radial, a grain gradient (wave, corners, ripple, blob or sphere) or a warp, with its own
 * layout, rotation and distortion. All of them only blend `colors` (the first as the back where a shader has one), so the veil fitted
 * to those colors holds whatever comes out.
 */
async function style(colors: string[], grain: number, seed?: number) {
  const r = seed === undefined ? undefined : random(seed);
  const between = (lo: number, hi: number) => lo + (r ? r() : 0.5) * (hi - lo);
  const pick = <T,>(items: readonly T[]) => items[Math.floor((r ? r() : 0) * items.length)]!;
  const all = colors.map(getShaderColorFromString);
  const [back, ...spots] = all;
  const g = grain / 100;
  const sizing = { u_fit: ShaderFitOptions.cover, u_scale: 1, u_rotation: r ? between(0, 360) : 0, u_offsetX: 0, u_offsetY: 0, u_originX: 0.5, u_originY: 0.5, u_worldWidth: 0, u_worldHeight: 0 };
  const noise = async () => {
    const img = getShaderNoiseTexture();
    await (img as unknown as { decode(): Promise<void> } | undefined)?.decode();
    return img;
  };
  const kind = r ? pick(["mesh", "static", "radial", "grain", "warp"] as const) : "mesh";
  if (kind === "mesh")
    return { shader: meshGradientFragmentShader, uniforms: { ...sizing, u_colors: all, u_colorsCount: all.length, u_distortion: r ? between(0.5, 1) : 0.8, u_swirl: r ? between(0, 0.6) : 0.15, u_grainMixer: g * 0.4, u_grainOverlay: g * 0.15 }, frame: r ? between(0, 5000) : FRAME };
  if (kind === "static")
    return { shader: staticMeshGradientFragmentShader, uniforms: { ...sizing, u_colors: all, u_colorsCount: all.length, u_positions: between(0, 100), u_waveX: between(0, 1), u_waveXShift: between(0, 1), u_waveY: between(0, 1), u_waveYShift: between(0, 1), u_mixing: between(0.5, 1), u_grainMixer: g * 0.4, u_grainOverlay: g * 0.15 } };
  if (kind === "radial")
    return { shader: staticRadialGradientFragmentShader, uniforms: { ...sizing, u_colorBack: back, u_colors: spots, u_colorsCount: spots.length, u_radius: between(1, 2.5), u_focalDistance: between(0, 1.5), u_focalAngle: between(0, 360), u_falloff: between(-0.4, 0.4), u_mixing: between(0.6, 1), u_distortion: between(0, 0.6), u_distortionShift: between(-1, 1), u_distortionFreq: between(2, 10), u_grainMixer: g * 0.4, u_grainOverlay: g * 0.15 } };
  if (kind === "grain")
    return { shader: grainGradientFragmentShader, uniforms: { ...sizing, u_colorBack: back, u_colors: spots, u_colorsCount: spots.length, u_softness: between(0.6, 1), u_intensity: between(0.15, 0.5), u_noise: g * 0.5, u_shape: GrainGradientShapes[pick(["wave", "corners", "ripple", "blob", "sphere"] as const)], u_noiseTexture: await noise() } };
  return { shader: warpFragmentShader, uniforms: { ...sizing, u_colors: all, u_colorsCount: all.length, u_proportion: between(0.35, 0.65), u_softness: between(0.8, 1), u_shape: WarpPatterns[pick(["stripes", "edge"] as const)], u_shapeScale: between(0.05, 0.3), u_distortion: between(0.2, 0.6), u_swirl: between(0.3, 0.9), u_swirlIterations: Math.round(between(4, 12)), u_noiseTexture: await noise() } };
}

/**
 * A blob: URL of a still gradient of `colors` (see style for which, by `seed`), with `grain` percent of the shader's own grain. Drawn
 * offscreen once per colors, grain and seed; rejects without WebGL.
 */
export function meshImage(colors: string[], grain: number, seed?: number) {
  const key = JSON.stringify([colors, grain, seed]);
  const known = made.get(key);
  if (known) return known;
  const url = (async () => {
    const host = document.createElement("div");
    for (const [k, v] of Object.entries({ position: "fixed", left: "-100000px", top: "0", width: `${WIDTH}px`, height: `${HEIGHT}px`, "pointer-events": "none" })) host.style.setProperty(k, v);
    document.body.appendChild(host);
    let mount: ShaderMount | undefined;
    try {
      const { shader, uniforms, frame: at = FRAME } = await style(colors, grain, seed);
      // preserveDrawingBuffer so the frame can still be read after it's shown; pixel ratio 1, the image is blurred anyway.
      mount = new ShaderMount(host as never, shader, uniforms as never, { preserveDrawingBuffer: true }, 0, at, 1);
      // It draws on a frame after it has measured its host.
      for (let i = 0; i < 3; i++) await frame();
      const canvas = host.querySelector("canvas") as unknown as Canvas | null;
      if (!canvas) throw new Error("The mesh canvas is missing");
      const blob = await new Promise<unknown>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The mesh couldn't be encoded"))), "image/webp", 0.92));
      return URL.createObjectURL(blob);
    } finally {
      mount?.dispose();
      host.remove();
    }
  })();
  made.set(key, url);
  url.catch(() => made.delete(key));
  return url;
}

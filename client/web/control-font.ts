// Lifts text on Paseo's buttons, tabs and menu rows when the UI font's own metrics sit it low in its line box.
import { Platform } from "react-native";
import type { WebDocument } from "./dom";
import { readHostAppearance } from "./host";

declare const document: WebDocument;

const FAMILY = "cp-centered-ui";
const CONTROLS = "button, [role=button], [role=tab], [role=menuitem], [role=menuitemradio], [role=menuitemcheckbox], [role=option], [role=switch], [role=checkbox], [role=radio], [role=combobox]";
// Where SF, Paseo's default, puts capitals: 0.026em below the middle of the line box. Fonts lower than that by more than SLACK are lifted to it.
const TARGET = -0.026;
const SLACK = 0.02;
const WEIGHTS: [number, string][] = [[300, "Light"], [400, "Regular"], [500, "Medium"], [600, "SemiBold"], [700, "Bold"]];

/**
 * Ascent and descent (em) that put capitals at TARGET without changing the line box's height, or undefined
 * when the font doesn't sit low. Capitals sit capHeight/2 above the baseline; the box's middle sits (ascent - descent)/2.
 */
export function centeredMetrics(m: { ascent: number; descent: number; capHeight: number }) {
  const offset = m.capHeight / 2 - (m.ascent - m.descent) / 2;
  // Only low-sitting fonts: one that already sits higher (SF Pro, -0.003em) would be pulled down.
  if (!(m.capHeight > 0) || offset >= TARGET - SLACK) return undefined;
  const ascent = (m.ascent + m.descent + m.capHeight - 2 * TARGET) / 2;
  return { ascent, descent: m.ascent + m.descent - ascent };
}

/**
 * Berkeley Mono puts capitals 0.061em below the middle (1.2px off on a 28px sidebar row). Re-declares the UI font under FAMILY
 * with ascent/descent overrides, and points Paseo's --paseo-ui-font at it only inside controls, so replies and code keep the font as is.
 * Desktop/web only; Paseo reloads when its fonts change, so this runs once. Returns cleanup.
 * ponytail: local() needs each face's full name ("<font> Medium") or PostScript name ("<Font>-Medium"); a weight that matches
 * neither falls back to the uncorrected font. Every weight gets the regular face's metrics. --paseo-ui-font is a Paseo internal.
 */
export function centerControlText() {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  const font = readHostAppearance().uiFont;
  const name = font?.split(",")[0].trim().replace(/^["']|["']$/g, "");
  const ctx = name ? document.createElement("canvas").getContext("2d", { willReadFrequently: false }) : null;
  if (!font || !name || !ctx) return () => {};
  ctx.font = `100px "${name}"`;
  const m = ctx.measureText("H");
  const fix = centeredMetrics({ ascent: m.fontBoundingBoxAscent / 100, descent: m.fontBoundingBoxDescent / 100, capHeight: m.actualBoundingBoxAscent / 100 });
  if (!fix) return () => {};
  const ps = name.replace(/\s+/g, "");
  const faces = WEIGHTS.map(([weight, style]) => {
    const src = [`local("${name} ${style}")`, `local("${ps}-${style}")`, ...(weight === 400 ? [`local("${name}")`] : [])].join(", ");
    return `@font-face { font-family: "${FAMILY}"; src: ${src}; font-weight: ${weight}; ascent-override: ${(fix.ascent * 100).toFixed(1)}%; descent-override: ${(fix.descent * 100).toFixed(1)}%; }`;
  });
  const style = document.createElement("style");
  style.textContent = `${faces.join("\n")}\n:is(${CONTROLS}) { --paseo-ui-font: "${FAMILY}", ${font}; }`;
  document.head.appendChild(style);
  return () => style.remove();
}

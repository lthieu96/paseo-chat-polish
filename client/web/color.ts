/** Hex color math for the restyle's derived colors; non-hex input passes through unchanged. */

export const hexAlpha = (hex: string, a: number) => (/^#[0-9a-f]{6}$/i.test(hex) ? hex + Math.round(a * 255).toString(16).padStart(2, "0") : hex);
export const darker = (hex: string) =>
  /^#[0-9a-f]{6}$/i.test(hex) ? `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.86).toString(16).padStart(2, "0")).join("")}` : hex;
export const mix = (a: string, b: string, t: number) =>
  /^#[0-9a-f]{6}$/i.test(a) && /^#[0-9a-f]{6}$/i.test(b)
    ? `#${[1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, "0")).join("")}`
    : a;
export const isDark = (hex: string) => /^#[0-9a-f]{6}$/i.test(hex) && [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0) < 384;

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { backdrop, extremes, LIFT, meshColors, themeFromPixels } from "../shared/palette.ts";
import { contrast, PRESETS, themeSchema } from "../shared/theme.ts";

const image = (...parts) => {
  // parts: [[r, g, b], share]; 1000 pixels in total.
  const out = [];
  for (const [[r, g, b], share] of parts) for (let i = 0; i < Math.round(share * 1000); i++) out.push(r, g, b, 255);
  return out;
};

const checkContrast = (t) => {
  assert.ok(contrast(t.colors.foreground, t.colors.background) >= 7, "foreground");
  assert.ok(contrast(t.colors.mutedForeground, t.colors.background) >= 4.5, "muted");
  assert.ok(contrast(t.colors.accent, t.colors.background) >= 3, "accent");
};

test("a dark, near-grey image gives a dark theme with readable text and an accent from its own hue", () => {
  // The moon picture: navy greys with a cream moon.
  const t = themeFromPixels(image([[27, 31, 39], 0.28], [[35, 40, 49], 0.24], [[49, 54, 64], 0.15], [[74, 82, 92], 0.14], [[136, 142, 147], 0.08], [[214, 212, 206], 0.11]));
  assert.equal(t.appearance, "dark");
  checkContrast(t);
  assert.ok(contrast(t.colors.background, "#000000") < 1.6, "background stays dark");
  // Grey image: the accent takes the dominant (blue) hue rather than a muddy grey.
  const [r, , b] = [1, 3, 5].map((i) => parseInt(t.colors.accent.slice(i, i + 2), 16));
  assert.ok(b > r + 30, `accent ${t.colors.accent} should be blue`);
  assert.ok(themeSchema.safeParse({ ...t, name: "Moon" }).success);
});

test("a light image gives a light theme; a colorful cluster becomes the accent", () => {
  const t = themeFromPixels(image([[240, 236, 226], 0.6], [[220, 214, 200], 0.3], [[200, 60, 40], 0.1]));
  assert.equal(t.appearance, "light");
  checkContrast(t);
  const [r, g] = [1, 3].map((i) => parseInt(t.colors.accent.slice(i, i + 2), 16));
  assert.ok(r > g + 40, `accent ${t.colors.accent} should be red`);
});

test("the same pixels always give the same theme; transparent pixels are ignored", () => {
  const px = image([[10, 80, 60], 0.5], [[200, 220, 210], 0.5]);
  assert.deepEqual(themeFromPixels(px), themeFromPixels(px));
  assert.deepEqual(themeFromPixels([...px, 255, 0, 0, 0]), themeFromPixels(px));
  assert.equal(themeFromPixels([]).appearance, "dark");
});

test("a grey image gets a blue accent, not HSL's red; a light theme's yellow-green accent turns amber", () => {
  const fog = themeFromPixels(image([[128, 128, 128], 0.5], [[150, 150, 152], 0.3], [[100, 100, 98], 0.2]));
  const [r, , b] = [1, 3, 5].map((i) => parseInt(fog.colors.accent.slice(i, i + 2), 16));
  assert.ok(b > r + 30, `fog accent ${fog.colors.accent} should be blue`);
  const olive = themeFromPixels(image([[240, 238, 225], 0.8], [[140, 140, 30], 0.2]));
  assert.equal(olive.appearance, "light");
  checkContrast(olive);
  const [or, og] = [1, 3].map((i) => parseInt(olive.colors.accent.slice(i, i + 2), 16));
  assert.ok(or > og + 25, `accent ${olive.colors.accent} should lean orange`);
});

test("extremes: the 95th and 5th percentile of luminance, so a few stray pixels don't count", () => {
  assert.deepEqual(extremes(image([[0, 0, 0], 0.01], [[60, 60, 60], 0.97], [[255, 255, 255], 0.02])), { bright: "#3c3c3c", dark: "#3c3c3c" });
  assert.deepEqual(extremes(image([[10, 10, 10], 0.5], [[250, 240, 230], 0.5])), { bright: "#faf0e6", dark: "#0a0a0a" });
});

// The layers composited as the browser does (source-over in sRGB), independently of palette.ts.
const rgb = (h) => [1, 3, 5, 7].map((i) => parseInt(h.slice(i, i + 2) || "ff", 16));
const hex = (c) => "#" + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
const over = (top, a, under) => top.map((t, i) => a * t + (1 - a) * under[i]);
const behind = (b, pixel) => {
  const [veil, lift] = [rgb(b.veil), rgb(b.lift)];
  const side = over(veil.slice(0, 3), veil[3] / 255, pixel);
  return [hex(side), hex(over(lift.slice(0, 3), lift[3] / 255, side))];
};

test("backdrop: text keeps its ratios over the image's worst patch on the sidebar and the panel, at any strength", () => {
  const cases = [
    image([[16, 20, 24], 0.8], [[255, 255, 255], 0.2]),
    image([[15, 25, 45], 0.7], [[60, 150, 240], 0.3]),
    image([[27, 31, 39], 0.28], [[35, 40, 49], 0.24], [[49, 54, 64], 0.15], [[74, 82, 92], 0.14], [[136, 142, 147], 0.08], [[214, 212, 206], 0.11]),
    image([[240, 236, 226], 0.7], [[0, 0, 0], 0.3]),
    image([[230, 190, 40], 0.6], [[90, 150, 220], 0.3], [[60, 120, 40], 0.1]),
    image([[250, 250, 250], 0.4], [[0, 0, 255], 0.6]),
  ];
  for (const px of cases) {
    const t = themeFromPixels(px);
    const ext = extremes(px);
    for (const strength of [10, 35, 60]) {
      const b = backdrop(t, ext, strength);
      assert.ok(rgb(b.veil)[3] >= Math.round((1 - strength / 100) * 255), "never shows more than the strength");
      assert.equal(rgb(b.lift)[3], Math.ceil(LIFT * 255));
      for (const surface of behind(b, rgb(t.appearance === "dark" ? ext.bright : ext.dark).slice(0, 3))) {
        const where = `${t.appearance} theme, strength ${strength}, behind ${surface}`;
        assert.ok(contrast(t.colors.foreground, surface) >= 7, `text, ${where}`);
        assert.ok(contrast(t.colors.mutedForeground, surface) >= 4.5, `muted, ${where}`);
        assert.ok(contrast(t.colors.accent, surface) >= 3, `accent, ${where}`);
      }
    }
  }
});

test("backdrop: a calm dark image shows as much as the strength allows; a bright patch makes it show less", () => {
  const calm = image([[20, 25, 35], 0.7], [[35, 45, 60], 0.3]);
  const t = themeFromPixels(calm);
  assert.equal(backdrop(t, extremes(calm), 35).veil, t.colors.background + "a6");
  const bright = backdrop(t, { bright: "#ffffff", dark: "#000000" }, 35);
  assert.ok(rgb(bright.veil)[3] > 0xa6);
});

test("mesh: the theme's own colors turned up like a wallpaper, then veiled like an image so text keeps its ratios", () => {
  const moon = themeFromPixels(image([[27, 31, 39], 0.28], [[35, 40, 49], 0.24], [[49, 54, 64], 0.15], [[74, 82, 92], 0.14], [[136, 142, 147], 0.08], [[214, 212, 206], 0.11]));
  for (const t of [...PRESETS, moon]) {
    const spots = meshColors(t);
    assert.equal(spots[0], t.colors.background);
    assert.equal(new Set(spots).size, 5, `${t.name ?? "moon"}: five distinct spots`);
    // The picture's worst patch is one of its spots at worst; the veil chosen over it keeps text readable.
    const ext = extremes(spots.flatMap((h) => [...rgb(h).slice(0, 3), 255]));
    const b = backdrop(t, ext, 35);
    for (const surface of behind(b, rgb(t.appearance === "dark" ? ext.bright : ext.dark).slice(0, 3))) {
      assert.ok(contrast(t.colors.mutedForeground, surface) >= 4.5, `${t.name ?? "moon"}: muted over ${surface}`);
      assert.ok(contrast(t.colors.accent, surface) >= 3, `${t.name ?? "moon"}: accent over ${surface}`);
    }
  }
  const parsed = themeSchema.parse({ ...moon, mesh: {} }).mesh;
  assert.deepEqual(parsed, { strength: 35, blur: 30, grain: 0 });
  assert.equal(themeSchema.safeParse({ ...moon, mesh: { grain: 130 } }).success, false);
});

test("background images are stored by hash and read back; anything but an image data URL is refused", async () => {
  const home = mkdtempSync(join(tmpdir(), "cp-bg-"));
  const before = process.env.PASEO_HOME;
  process.env.PASEO_HOME = home;
  try {
    const { saveBackgroundImage, readBackgroundImage } = await import("../server/background.ts");
    const dataUrl = `data:image/png;base64,${Buffer.from("not really a png").toString("base64")}`;
    const { id } = await saveBackgroundImage({ dataUrl });
    assert.match(id, /^[0-9a-f]{64}$/);
    assert.deepEqual(await saveBackgroundImage({ dataUrl }), { id });
    assert.equal((await readBackgroundImage({ id })).dataUrl, dataUrl);
    await assert.rejects(saveBackgroundImage({ dataUrl: "data:text/html;base64,PGI+" }), /JPEG, PNG or WebP/);
    await assert.rejects(readBackgroundImage({ id: "0".repeat(64) }), /not found/);
  } finally {
    if (before === undefined) delete process.env.PASEO_HOME;
    else process.env.PASEO_HOME = before;
    rmSync(home, { recursive: true, force: true });
  }
});

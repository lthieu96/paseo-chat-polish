import assert from "node:assert/strict";
import { mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import sharp from "sharp";
import { readImageFile } from "../server/image.ts";
import { clearImageCache, loadImage } from "../client/images.ts";

test("image RPC sends a small preview and retains the original for the lightbox", async () => {
  const temp = await mkdtemp(join(tmpdir(), "chat-polish-image-test-"));
  try {
    const file = join(temp, "large.png");
    const original = await sharp({ create: { width: 2000, height: 1000, channels: 4, background: "#2878e0" } }).png().toBuffer();
    await writeFile(file, original);
    const preview = await readImageFile({ path: pathToFileURL(file).href, variant: "thumbnail" });
    const decoded = Buffer.from(preview.dataUrl.split(",")[1], "base64");
    const metadata = await sharp(decoded).metadata();
    assert.equal(metadata.width, 640);
    assert.equal(metadata.height, 320);
    assert.match(preview.dataUrl, /^data:image\/webp;base64,/);
    const full = await readImageFile({ path: file });
    assert.deepEqual(Buffer.from(full.dataUrl.split(",")[1], "base64"), original);
    const small = join(temp, "small.gif");
    await sharp({ create: { width: 20, height: 10, channels: 3, background: "red" } }).gif().toFile(small);
    const smallPreview = await readImageFile({ path: small, variant: "thumbnail" });
    assert.equal((await sharp(Buffer.from(smallPreview.dataUrl.split(",")[1], "base64")).metadata()).width, 20);
    await assert.rejects(readImageFile({ path: join(temp, "not-image.txt") }), /Not an image/);
    const large = join(temp, "oversize.png");
    await writeFile(large, "");
    await truncate(large, 12 * 1024 * 1024 + 1);
    await assert.rejects(readImageFile({ path: large, variant: "thumbnail" }), /larger than/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("image reads share requests, separate previews, and limit concurrency even after failure", async () => {
  clearImageCache();
  let calls = 0;
  let active = 0;
  let peak = 0;
  const variants = [];
  const read = async ({ path, variant }) => {
    calls++;
    variants.push(variant);
    peak = Math.max(peak, ++active);
    try {
      await new Promise(setImmediate);
      if (path === "bad") throw new Error("unavailable");
      return { dataUrl: `data:image/webp;base64,${path}-${variant}` };
    } finally {
      active--;
    }
  };
  const a = loadImage("same", "thumbnail", read);
  assert.equal(loadImage("same", "thumbnail", read), a);
  await a;
  assert.equal(await loadImage("same", "thumbnail", read), await a);
  assert.equal(calls, 1);
  await loadImage("same", "original", read);
  assert.deepEqual(variants, ["thumbnail", "original"]);
  const results = await Promise.allSettled([loadImage("bad", "thumbnail", read), ...Array.from({ length: 12 }, (_, i) => loadImage(`image-${i}`, "thumbnail", read))]);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  assert.equal(peak, 3);
  const beforeRetry = calls;
  await assert.rejects(loadImage("bad", "thumbnail", read), /unavailable/);
  assert.equal(calls, beforeRetry + 1);
  assert.equal(await loadImage("https://example.test/image.png", "thumbnail", read), "https://example.test/image.png");
  assert.equal(calls, beforeRetry + 1);
  clearImageCache();
});

test("image cache evicts by bytes and recency, and skips oversized strings", async () => {
  clearImageCache();
  const calls = new Map();
  const uri = "x".repeat(4 * 1024 * 1024); // 8 MiB under the conservative UTF-16 budget.
  const read = async ({ path }) => {
    calls.set(path, (calls.get(path) ?? 0) + 1);
    return { dataUrl: path === "oversized" ? uri.repeat(4) : uri };
  };
  for (const path of ["a", "b", "c", "a", "d", "a"]) await loadImage(path, "original", read);
  assert.equal(calls.get("a"), 1, "a cache hit refreshes recency");
  await loadImage("b", "original", read);
  assert.equal(calls.get("b"), 2, "evict by bytes before reaching 24 entries");
  await loadImage("oversized", "original", read);
  await loadImage("oversized", "original", read);
  assert.equal(calls.get("oversized"), 2);
  clearImageCache();
});

test("file: URLs and paths are read through the server; http, data and blob URLs load directly", async () => {
  clearImageCache();
  const asked = [];
  const read = async ({ path }) => (asked.push(path), { dataUrl: `data:image/png;base64,${Buffer.from(path).toString("base64")}` });
  // Agents link screenshots as file:// URLs; the renderer can't load those, so the server reads them.
  const fromFile = await loadImage("file:///tmp/shot.png", "thumbnail", read);
  const fromPath = await loadImage("/tmp/other.png", "thumbnail", read);
  const fromDrive = await loadImage("C:\\shots\\win.png", "thumbnail", read);
  assert.deepEqual(asked, ["file:///tmp/shot.png", "/tmp/other.png", "C:\\shots\\win.png"]);
  assert.match(fromFile, /^data:image\/png;base64,/);
  assert.match(fromPath, /^data:image\/png;base64,/);
  assert.match(fromDrive, /^data:image\/png;base64,/);
  for (const direct of ["https://example.com/a.png", "http://localhost:8080/b.png", "data:image/png;base64,AAAA", "blob:http://localhost/123"]) {
    assert.equal(await loadImage(direct, "thumbnail", read), direct);
  }
  assert.equal(asked.length, 3);
});

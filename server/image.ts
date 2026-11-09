import type { RpcInput } from "@getpaseo/plugin";
import { readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import type sharpType from "sharp";
import type { readImage } from "../shared/image";

// Paseo evaluates the server bundle from a string, so import.meta.url is empty there and a bare require resolves
// from Paseo's own folder. This plugin's folder is the one Paseo records for it in $PASEO_HOME/config.json.
function pluginRequire() {
  try {
    return createRequire(import.meta.url);
  } catch {
    const home = process.env.PASEO_HOME || join(homedir(), ".paseo");
    const { plugins } = JSON.parse(readFileSync(join(home, "config.json"), "utf8")) as { plugins: Record<string, { path?: string }> };
    const mine = Object.values(plugins).find(({ path }) => {
      try {
        return path && JSON.parse(readFileSync(join(path, "package.json"), "utf8")).name === "paseo-chat-polish";
      } catch {
        return false;
      }
    });
    if (!mine?.path) throw new Error("Chat Polish is not in Paseo's plugin config");
    return createRequire(join(mine.path, "package.json"));
  }
}

// Loaded on first use, so an unloadable sharp only costs thumbnails. In the macOS app it can't load its native
// binary (signed by another team) and falls back to its WebAssembly build.
let sharp: typeof sharpType | null | undefined;
function loadSharp() {
  if (sharp === undefined) {
    try {
      sharp = pluginRequire()("sharp") as typeof sharpType;
    } catch (error) {
      console.error("[chat-polish] sharp unavailable, thumbnails send the original image", error);
      sharp = null;
    }
  }
  return sharp;
}

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};
const MAX_BYTES = 12 * 1024 * 1024;

// Only image files are served: this RPC must not become a general file reader for the client.
export async function readImageFile({ path, variant = "original" }: RpcInput<typeof readImage>) {
  const file = path.startsWith("file://") ? fileURLToPath(path) : path;
  const mime = MIME[extname(file).toLowerCase()];
  if (!mime) throw new Error(`Not an image: ${file}`);
  if ((await stat(file)).size > MAX_BYTES) throw new Error(`Image larger than ${MAX_BYTES / 1024 / 1024} MB: ${file}`);
  const sharp = variant === "thumbnail" ? loadSharp() : null;
  if (sharp) {
    // Twice the largest tile size (Extra large, 480 × 300), without decoding unbounded pixel counts or sending the original.
    const preview = await sharp(file, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 960, height: 600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
    return { dataUrl: `data:image/webp;base64,${preview.toString("base64")}` };
  }
  return { dataUrl: `data:${mime};base64,${(await readFile(file)).toString("base64")}` };
}

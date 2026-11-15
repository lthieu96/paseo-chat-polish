// Theme background images, kept in the plugin cache under the SHA-256 of their bytes (so the same image is stored once).
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cacheDir } from "./icons.ts";

const TYPES = { jpeg: "jpg", png: "png", webp: "webp" } as const;
const MAX_BYTES = 16 * 1024 * 1024;
const dir = () => join(cacheDir(), "backgrounds");

export async function saveBackgroundImage({ dataUrl }: { dataUrl: string }) {
  const m = /^data:image\/(jpeg|png|webp);base64,([a-z0-9+/=]+)$/i.exec(dataUrl);
  if (!m) throw new Error("Expected a JPEG, PNG or WebP image");
  const bytes = Buffer.from(m[2]!, "base64");
  if (bytes.length > MAX_BYTES) throw new Error("The image is over 16 MiB");
  const id = createHash("sha256").update(bytes).digest("hex");
  await mkdir(dir(), { recursive: true });
  await writeFile(join(dir(), `${id}.${TYPES[m[1]!.toLowerCase() as keyof typeof TYPES]}`), bytes);
  return { id };
}

export async function readBackgroundImage({ id }: { id: string }) {
  // The id is checked as 64 hex digits by the RPC schema, so it can't leave the directory.
  const name = (await readdir(dir()).catch(() => [] as string[])).find((f) => f.startsWith(`${id}.`));
  if (!name) throw new Error("Background image not found");
  const ext = name.slice(id.length + 1);
  const type = ext === "jpg" ? "jpeg" : ext;
  return { dataUrl: `data:image/${type};base64,${(await readFile(join(dir(), name))).toString("base64")}` };
}

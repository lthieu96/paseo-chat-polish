import { createHash } from "node:crypto";
import type { EventEmitter } from "node:events";
import { createWriteStream, existsSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, open, readdir, rename, rm } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createInflateRaw } from "node:zlib";
import { cacheDir } from "./icons.ts";

// Chrome for Testing's headless shell, the only browser pages are laid out in: lighter than a full Chrome and the same build on every
// machine, so a page checks the same everywhere, and none of the user's own browsers is ever started.
// Pinned with each zip's hash; bump them together (https://googlechromelabs.github.io/chrome-for-testing/).
const VERSION = "156.0.8078.47";
const SHA256: Record<string, string> = {
  "linux-arm64": "955059fa7020d7be85eb503e21339fd4d718f51f5996d3b60633fbf908bda132",
  linux64: "0d5acc62c3e213f8c87d3c298d66ffcf9a236d12ea4b9f85318bf85dbc279daa",
  "mac-arm64": "2fd1c09a3e1ebde9e69e6aba92f1dd3f21ad247b55d9bf66e39213ff4205436d",
  "mac-x64": "5e230044c6ac989597f4a4e301a0a710d257e07d6f7754754da2bf62ea3d272c",
  win32: "bbc3841ec1a7c6ac3929e76af69558b143f3f55791f426d20c08d999c0d496ce",
  win64: "e0af9b23f8051cca4f37ca49cd425e8055701bfc0383c198d67f8d5cc5884249",
};
const PLATFORM = (
  { "darwin-arm64": "mac-arm64", "darwin-x64": "mac-x64", "linux-arm64": "linux-arm64", "linux-x64": "linux64", "win32-ia32": "win32", "win32-x64": "win64" } as Record<string, string>
)[`${process.platform}-${process.arch}`];

const root = () => join(cacheDir(), "chrome-headless-shell");
const executable = () => join(root(), VERSION, `chrome-headless-shell-${PLATFORM}`, `chrome-headless-shell${process.platform === "win32" ? ".exe" : ""}`);
// The download under way, its progress, and why the last one failed.
let installing: Promise<void> | undefined;
let progress: { received: number; total?: number } | undefined;
let failure: string | undefined;

/** The pinned headless shell, if it's installed. */
export const headlessShell = () => (PLATFORM && existsSync(executable()) ? executable() : undefined);

/** Whether only another version is installed: the user already chose to download it, so a version bump fetches the new one without asking again. */
export function staleShell() {
  try {
    return !!PLATFORM && !headlessShell() && existsSync(root()) && readdirSync(root()).some((name) => name !== VERSION && !name.startsWith("download-"));
  } catch {
    // An unreadable cache can't hold an install to update; the plugin still loads.
    return false;
  }
}

/** Where the headless shell stands, for the dashboard (shared/html.ts browserStatus). */
export function shellStatus() {
  const version = VERSION;
  if (!PLATFORM) return { state: "unsupported" as const, version };
  if (headlessShell()) return { state: "installed" as const, version };
  if (progress) return { state: "downloading" as const, version, ...progress };
  return failure ? { state: "failed" as const, version, error: failure } : { state: "missing" as const, version };
}

/**
 * Downloads the pinned headless shell into the plugin's cache (about 100 MB): from the dashboard when the user asks, or on start when only
 * an older version is there (staleShell). Until it's there pages show unchecked and agents don't get html_preview. Never rejects; a
 * failure is kept for shellStatus.
 */
export function installHeadlessShell() {
  if (!PLATFORM || headlessShell()) return Promise.resolve();
  if (!installing) {
    progress = { received: 0 };
    failure = undefined;
    installing = install()
      .catch((error: unknown) => {
        // fetch puts the network's reason (ENOTFOUND, a certificate, a proxy) in its cause.
        failure = error instanceof Error ? [error.message, (error.cause as Error | undefined)?.message].filter(Boolean).join(": ") : String(error);
        console.warn("[chat-polish] couldn't install chrome-headless-shell", error);
      })
      .finally(() => {
        progress = undefined;
        installing = undefined;
      });
  }
  return installing;
}

/** Deletes the headless shell, every version of it; not while it downloads. Pages show unchecked from then on, and new agents don't get html_preview. */
export async function removeHeadlessShell() {
  if (installing) throw new Error("The headless shell is still downloading");
  await rm(root(), { recursive: true, force: true });
}

async function install() {
  await mkdir(root(), { recursive: true });
  // Half-done downloads, and this version's folder, broken if it's there without the shell (a remove that stopped halfway).
  for (const name of await readdir(root())) if (name === VERSION || name.startsWith("download-")) await rm(join(root(), name), { recursive: true, force: true });
  const url = `https://storage.googleapis.com/chrome-for-testing-public/${VERSION}/${PLATFORM}/chrome-headless-shell-${PLATFORM}.zip`;
  // React Native's global AbortSignal type shadows Node's here; at runtime it's Node's.
  const response = await fetch(url, { signal: AbortSignal.timeout(10 * 60_000) as RequestInit["signal"] });
  if (!response.ok || !response.body) throw new Error(`Downloading ${url} failed: HTTP ${response.status}`);
  progress!.total = Number(response.headers.get("content-length")) || undefined;
  const temp = await mkdtemp(join(root(), "download-"));
  try {
    const zip = join(temp, "shell.zip");
    const hash = createHash("sha256");
    await pipeline(
      Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
      async function* (chunks: AsyncIterable<Buffer>) {
        for await (const chunk of chunks) {
          hash.update(chunk);
          progress!.received += chunk.length;
          yield chunk;
        }
      },
      createWriteStream(zip),
    );
    if (hash.digest("hex") !== SHA256[PLATFORM!]) throw new Error(`${url} doesn't match its pinned hash`);
    await unzip(zip, temp);
    await rm(zip);
    // Moved in whole, so a half-unpacked shell is never found. On Windows, Defender holds a folder it's scanning for a few seconds; npm's
    // installs retry their renames the same way.
    for (let attempt = 1; ; attempt++) {
      try {
        await rename(temp, join(root(), VERSION));
        break;
      } catch (error) {
        const busy = ["EPERM", "EACCES", "EBUSY"].includes((error as NodeJS.ErrnoException).code ?? "");
        if (process.platform !== "win32" || !busy || attempt === 20) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  } catch (error) {
    await rm(temp, { recursive: true, force: true });
    throw error;
  }
  // Older versions go once this one is in place, so a failed download leaves them for staleShell to retry next start.
  for (const name of await readdir(root())) if (name !== VERSION) await rm(join(root(), name), { recursive: true, force: true });
}

/**
 * Unpacks a zip with Node alone, since slim Linux images have no unzip (and Windows no zip tool before tar): stored and deflated files,
 * their Unix modes kept so the shell stays executable. The pinned zips have nothing else (no Zip64, no symlinks).
 */
async function unzip(file: string, dest: string) {
  const zip = await open(file);
  // Every entry's stream listens on the one handle; a few hundred is expected, not a leak.
  (zip as unknown as EventEmitter).setMaxListeners(0);
  try {
    const { size } = await zip.stat();
    const read = async (length: number, position: number) => {
      const buffer = Buffer.alloc(length);
      await zip.read(buffer, 0, length, position);
      return buffer;
    };
    // The end-of-central-directory record, in the last 64 KB with its comment.
    const tail = await read(Math.min(size, 65_557), Math.max(0, size - 65_557));
    const end = tail.lastIndexOf(Buffer.from("PK\x05\x06", "latin1"));
    if (end < 0) throw new Error("The headless shell's zip has no central directory");
    const entries = tail.readUInt16LE(end + 10);
    const central = await read(tail.readUInt32LE(end + 12), tail.readUInt32LE(end + 16));
    for (let at = 0, i = 0; i < entries; i++) {
      const method = central.readUInt16LE(at + 10);
      const length = central.readUInt32LE(at + 20);
      const nameLength = central.readUInt16LE(at + 28);
      const mode = (central.readUInt32LE(at + 38) >>> 16) & 0o777;
      const local = central.readUInt32LE(at + 42);
      const name = central.toString("utf8", at + 46, at + 46 + nameLength);
      at += 46 + nameLength + central.readUInt16LE(at + 30) + central.readUInt16LE(at + 32);
      const path = resolve(dest, name);
      if (!path.startsWith(resolve(dest) + sep)) throw new Error(`${name} would unpack outside its folder`);
      if (name.endsWith("/")) {
        await mkdir(path, { recursive: true });
        continue;
      }
      if (method !== 0 && method !== 8) throw new Error(`${name} uses zip method ${method}`);
      await mkdir(dirname(path), { recursive: true });
      const header = await read(30, local);
      const start = local + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
      const data = length ? zip.createReadStream({ start, end: start + length - 1, autoClose: false }) : Readable.from([]);
      const out = createWriteStream(path, { mode: mode || 0o644 });
      if (method === 8) await pipeline(data, createInflateRaw(), out);
      else await pipeline(data, out);
    }
  } finally {
    await zip.close();
  }
}

import type { RpcInput } from "@getpaseo/plugin";
import type { readImage } from "../shared/image";

type Read = (input: RpcInput<typeof readImage>) => Promise<{ dataUrl: string }>;
type Variant = NonNullable<RpcInput<typeof readImage>["variant"]>;
const MAX_BYTES = 24 * 1024 * 1024;
const MAX_ENTRIES = 24;
const MAX_REQUESTS = 3;
const cache = new Map<string, { uri: string; bytes: number }>();
const pending = new Map<string, Promise<string>>();
const waiting: Array<() => void> = [];
let bytes = 0;
let active = 0;
let generation = 0;

async function request(read: Read, input: RpcInput<typeof readImage>) {
  if (active < MAX_REQUESTS) active++;
  else await new Promise<void>((resolve) => waiting.push(resolve));
  try {
    return await read(input);
  } finally {
    // Hand the occupied slot directly to the next request so newcomers cannot jump the queue.
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

export function clearImageCache() {
  generation++;
  cache.clear();
  bytes = 0;
}

/** Share in-flight reads, bound retained strings by bytes, and load originals only for the viewer. */
export function loadImage(url: string, variant: Variant, read: Read): Promise<string> {
  // blob: too, for the sources of images Paseo draws itself. file: URLs and paths go to the server, which can read them.
  if (/^(https?:|data:|blob:)/.test(url)) return Promise.resolve(url);
  const key = `${variant}:${url}`;
  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
    return Promise.resolve(cached.uri);
  }
  const existing = pending.get(key);
  if (existing) return existing;
  const epoch = generation;
  const promise = request(read, { path: url, variant }).then(({ dataUrl: uri }) => {
    const size = uri.length * 2; // Conservatively budget UTF-16 strings, regardless of engine compression.
    if (epoch === generation && size <= MAX_BYTES) {
      cache.set(key, { uri, bytes: size });
      bytes += size;
      while (bytes > MAX_BYTES || cache.size > MAX_ENTRIES) {
        const oldest = cache.keys().next().value!;
        bytes -= cache.get(oldest)!.bytes;
        cache.delete(oldest);
      }
    }
    return uri;
  }).finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}

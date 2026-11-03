// Paseo's own image viewer, the one that opens a prompt's attached images, for the plugin's reply images on desktop and web.
import type { ComponentType } from "react";
import { Platform } from "react-native";
import { findInAppScripts } from "./app-script";
import type { WebDocument } from "./dom";

declare const document: WebDocument;

export type PaseoLightbox = ComponentType<{ source: { type: "uri"; uri: string } | null; onClose(): void }>;

let lightbox: Promise<PaseoLightbox | undefined> | undefined;

/** Metro's module id of the module that exports AttachmentLightbox: the id closing its define call. */
function lightboxModuleIn(text: string) {
  const at = text.indexOf("e.AttachmentLightbox=function");
  const end = at < 0 ? null : /\},(\d+),\[[\d,]*\]\);/.exec(text.slice(at, at + 20000));
  return end ? Number(end[1]) : undefined;
}

/**
 * Paseo's AttachmentLightbox (zoom, pan, its close button and Esc), or undefined where it can't be found; the plugin's
 * viewer stays then. Looked up once.
 * shortcut: the plugin API doesn't export it, so this finds its module in Paseo's minified bundle and loads it through
 * Metro's global __r. If Paseo renames it, changes its props or drops __r, this resolves to nothing (or the wrong export,
 * which isn't a function); ask for it in the plugin API if Paseo adds one.
 */
export function loadPaseoLightbox(): Promise<PaseoLightbox | undefined> {
  if (Platform.OS !== "web" || typeof document === "undefined") return Promise.resolve(undefined);
  lightbox ??= findInAppScripts(lightboxModuleIn, "Paseo's image viewer").then((id) => {
    const metro = (globalThis as { __r?: (id: number) => unknown }).__r;
    const component = id !== undefined && typeof metro === "function" ? (metro(id) as { AttachmentLightbox?: unknown } | undefined)?.AttachmentLightbox : undefined;
    return typeof component === "function" ? (component as PaseoLightbox) : undefined;
  }).catch((error: unknown) => {
    console.warn("[chat-polish] Paseo's image viewer is unavailable; using the plugin's", error);
    return undefined;
  });
  return lightbox;
}

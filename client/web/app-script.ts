// Reads Paseo's own web bundle, for parts of the app the plugin API doesn't expose.
import type { WebDocument } from "./dom";

declare const document: WebDocument;
declare const location: { href: string; origin: string };

/** The first value `pick` finds in the app's scripts (the browser has them cached), or undefined. */
export async function findInAppScripts<T>(pick: (text: string) => T | undefined, what: string): Promise<T | undefined> {
  for (const script of Array.from(document.querySelectorAll("script[src]"))) {
    const src = new URL(script.getAttribute("src") ?? "", location.href);
    // Paseo's own chunks; another origin's script (app.paseo.sh's analytics beacon) would only fail on CORS.
    if (src.origin !== location.origin) continue;
    try {
      const response = await fetch(src.href);
      const found = response.ok ? pick(await response.text()) : undefined;
      if (found !== undefined) return found;
    } catch (error) {
      console.warn(`[chat-polish] Couldn't read a script for ${what}`, error);
    }
  }
}

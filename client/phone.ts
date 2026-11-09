// Whether this window is a phone, for the "Chat on phones" pref. Kept free of react-native so tests can import it.
import type { Prefs } from "../shared/timeline";

/** Paseo's own compact layout (one pane, drawer sidebar) starts below its `md` breakpoint, 720pt; narrower web windows count as phones too. */
export const PHONE_WIDTH = 720;

/** The iOS and Android apps at any size, and web windows narrower than Paseo's compact layout breakpoint (mobile browsers). */
export const isPhone = (os: string, width: number) => os === "ios" || os === "android" || width < PHONE_WIDTH;

/** Whether the plugin's timeline rows (transformers and the timelines they follow) run here; off only on a phone with the pref off. */
export const polishesChat = (prefs: Pick<Prefs, "phoneChat">, phone: boolean) => !phone || prefs.phoneChat === "on";

declare const localStorage: { getItem(key: string): string | null; setItem(key: string, value: string): void } | undefined;
const KEY = "chat-polish.phoneChat";

/**
 * The last saved choice in this browser, so a phone-width window skips the transformers from the start instead of dropping them when the
 * daemon's prefs arrive mid-load (which makes Paseo transform the chat twice). The native apps have no synchronous storage, so there the
 * saved choice applies once it arrives, a moment after launch.
 */
export function rememberedPhoneChat(): Prefs["phoneChat"] | undefined {
  try {
    const v = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
    return v === "on" || v === "off" ? v : undefined;
  } catch {
    return undefined;
  }
}

export function rememberPhoneChat(value: Prefs["phoneChat"]) {
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem(KEY) !== value) localStorage.setItem(KEY, value);
  } catch {
    // Storage blocked: the next launch waits for the daemon's prefs, as on native.
  }
}

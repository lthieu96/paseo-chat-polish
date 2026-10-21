// Paseo's own app settings (Settings → Appearance), read and written where the plugin API has no way in.
import { Platform } from "react-native";

declare const localStorage: { getItem(key: string): string | null; setItem(key: string, value: string): void };
declare const location: { reload(): void };

const SETTINGS_KEY = "@paseo:app-settings";

export interface HostAppearance {
  uiFont?: string;
  monoFont?: string;
  contentSize: number;
  codeSize: number;
  pluginThemeId?: string;
  /** Settings → Appearance → Theme: a Paseo theme id, or "plugin" for one a plugin contributes. */
  theme?: string;
  /** Settings → Appearance → Always expand reasoning. */
  autoExpandReasoning: boolean;
  /** Settings → Tool call display: "overview" (Summary) groups consecutive calls, "detailed" lists each one. */
  toolCallDetail: "overview" | "detailed";
}

export const DEFAULTS: HostAppearance = { contentSize: 15, codeSize: 12, autoExpandReasoning: false, toolCallDetail: "detailed" };
let cache: { at: number; value: HostAppearance } | undefined;

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const size = (v: unknown, fallback: number) => (typeof v === "number" && v >= 8 && v <= 32 ? v : fallback);

/**
 * Settings → Appearance fonts, sizes and reasoning expansion, which the plugin API doesn't pass to plugins.
 * ponytail: reads the desktop/web app's own `@paseo:app-settings` storage (undocumented, may move);
 * iOS/Android get defaults. Switch to a host settings API once Paseo exposes one.
 */
export function readHostAppearance(): HostAppearance {
  if (Platform.OS !== "web") return DEFAULTS;
  if (cache && Date.now() - cache.at < 2000) return cache.value;
  let value = DEFAULTS;
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Record<string, unknown> | null;
    if (s && typeof s === "object") {
      value = {
        uiFont: text(s.uiFontFamily),
        monoFont: text(s.monoFontFamily),
        contentSize: size(s.contentFontSize, DEFAULTS.contentSize),
        codeSize: size(s.codeFontSize, DEFAULTS.codeSize),
        pluginThemeId: s.theme === "plugin" ? text(s.pluginThemeId) : undefined,
        theme: text(s.theme),
        autoExpandReasoning: s.autoExpandReasoning === true,
        // Same fallback as Paseo: the legacy compactToolCalls flag, then "detailed"; "concise" is the old "overview".
        toolCallDetail: ["overview", "concise"].includes(String(s.toolCallDetailLevel)) || (s.toolCallDetailLevel === undefined && s.compactToolCalls === true) ? "overview" : "detailed",
      };
    }
  } catch {
    // Unreadable or missing settings: keep Paseo's defaults.
  }
  cache = { at: Date.now(), value };
  return value;
}

/** Whether this client can switch Paseo's app theme itself (desktop and web). */
export const canSetAppTheme = Platform.OS === "web";

/**
 * Selects a plugin theme as Paseo's app theme the way Settings → Appearance does, then reloads the
 * app so it is applied. `catalogId` is `<plugin id>/theme/<theme id>`.
 * ponytail: writes Paseo's private settings document (undocumented); replace with a host
 * "select theme" API once Paseo offers one.
 */
export function setAppTheme(catalogId: string, extra: Record<string, unknown> = {}) {
  updateAppSettings({ ...extra, theme: "plugin", pluginThemeId: catalogId });
}

/**
 * Paseo's font stacks when Settings → Appearance leaves a font empty.
 * ponytail: copied from Paseo 0.11.x (DEFAULT_UI_FONT_STACK / DEFAULT_MONO_FONT_STACK); update if Paseo changes them.
 */
export const PASEO_FONT_STACKS = {
  ui: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
};

/** Changes Paseo's own app settings (desktop/web) and reloads so Paseo picks them up. Same caveat as setAppTheme. */
export function updateAppSettings(patch: Record<string, unknown>) {
  if (!canSetAppTheme) return;
  let current: Record<string, unknown> = {};
  try {
    current = (JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Record<string, unknown> | null) ?? {};
  } catch {
    // Start from Paseo's defaults rather than refusing to switch.
  }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...patch }));
  cache = undefined;
  location.reload();
}

/** Paseo's current code-block syntax theme (Settings → Appearance), desktop/web only. */
export function readSyntaxTheme(): string | undefined {
  if (!canSetAppTheme) return undefined;
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as { syntaxTheme?: unknown } | null;
    return typeof s?.syntaxTheme === "string" ? s.syntaxTheme : "one";
  } catch {
    return undefined;
  }
}

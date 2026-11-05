import type { PluginCleanup } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { useSyncExternalStore } from "react";
import { toContribution, type ThemeDraft } from "../shared/theme";

// The contributed theme is re-registered whenever the dashboard applies a new one.
let client: PluginClientContext | undefined;
let remove: PluginCleanup | undefined;
let current: ThemeDraft | undefined;
const listeners = new Set<() => void>();

/** The theme last registered, for the sidebar painter and code highlighting. */
export const currentTheme = () => current;

/** Calls `l` whenever a theme is registered; returns unsubscribe. */
export const subscribeTheme = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));

export function useCurrentTheme() {
  return useSyncExternalStore(subscribeTheme, currentTheme);
}

export function registerTheme(theme: ThemeDraft) {
  if (!client) return;
  current = theme;
  void remove?.();
  remove = client.addTheme(toContribution(theme));
  listeners.forEach((l) => l());
}

export function bindThemeRegistry(c: PluginClientContext) {
  client = c;
  return () => {
    void remove?.();
    client = remove = current = undefined;
  };
}

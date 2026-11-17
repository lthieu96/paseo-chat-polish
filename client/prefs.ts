import { settingsRpc } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { createContext, useContext, useSyncExternalStore } from "react";
import { prefsSchema, prefsSettings, type Prefs } from "../shared/timeline.ts";

// Saved prefs, shared by transformers (read at transform time) and renderers (subscribed).
let prefs: Prefs = prefsSchema.parse({});
const listeners = new Set<() => void>();

export const currentPrefs = () => prefs;

export function setPrefs(next: Prefs) {
  prefs = next;
  listeners.forEach((l) => l());
}

export const subscribePrefs = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));

/** Lets the dashboard preview prefs before they are saved. */
export const PrefsOverride = createContext<Prefs | undefined>(undefined);

export function usePrefs() {
  const override = useContext(PrefsOverride);
  const live = useSyncExternalStore(subscribePrefs, currentPrefs);
  return override ?? live;
}

// Command Center toggles save through the settings RPCs useSettings calls, so they need no mounted component: Paseo 0.16 unmounts
// the sidebar row (which used to save them) while it is hidden. Saves run one at a time, each on the revision it just read.
let save: ((next: Prefs) => Promise<void>) | undefined;
let saving = Promise.resolve();

/** Applies prefs now and saves them (once bindPrefsSaving has run). */
export function savePrefs(next: Prefs) {
  setPrefs(next);
  const run = save;
  if (run) saving = saving.then(() => run(next)).catch((error: unknown) => console.warn("[chat-polish] Couldn't save prefs", error));
  return saving;
}

export function bindPrefsSaving(rpc: PluginClientContext["rpc"]) {
  const { read, write } = settingsRpc(prefsSettings.id);
  save = async (next) => {
    const { revision } = await rpc(read, {});
    const result = await rpc(write, { revision, values: next });
    if (result.status !== "saved") throw new Error(result.error);
  };
  return () => void (save = undefined);
}

import type { PluginClientContext } from "@getpaseo/plugin/client";
import { settingsRpc } from "@getpaseo/plugin";
import { createContext, useContext, useSyncExternalStore } from "react";
import { prefsSchema, prefsSettings, type Prefs } from "../shared/timeline";

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

let persist: ((next: Prefs) => void) | undefined;

/** Saves through the settings RPC, independent of any mounted screen or sidebar item. */
export function bindPrefsSaver(client: PluginClientContext) {
  const read = settingsRpc(prefsSettings.id).read;
  const write = settingsRpc(prefsSettings.id).write;
  let revision: string | undefined;
  let queue = Promise.resolve();
  persist = (next) => {
    queue = queue.then(async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (!revision) {
          const current = await client.rpc(read, {});
          if (current.status !== "ready") throw new Error(current.error);
          revision = current.revision;
        }
        const result = await client.rpc(write, { revision, values: next });
        if (result.status === "saved") {
          revision = result.revision;
          return;
        }
        if (result.status !== "conflict") throw new Error(result.error);
        revision = undefined;
      }
      throw new Error("Settings changed repeatedly while saving");
    }).catch((error: unknown) => {
      console.warn("[chat-polish] Couldn't save timeline preferences", error);
    });
  };
  return () => {
    persist = undefined;
    queue = Promise.resolve();
  };
}

/** Applies immediately and persists in order, including Command Center changes with no dashboard open. */
export function savePrefs(next: Prefs) {
  setPrefs(next);
  persist?.(next);
}

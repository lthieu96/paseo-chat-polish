import { useMemo, useSyncExternalStore } from "react";
import { translate, translator, type Language, type MessageKey, type MessageVars } from "../shared/i18n.ts";

/** Paseo's app language as the client hands it to plugins; `subscribe` is on the runtime Paseo passes, not in the public type. */
type LocaleSource = { readonly locale: string; subscribe?(listener: () => void): () => void };

let source: LocaleSource | undefined;
const listeners = new Set<() => void>();

/** The plugin's language for a Paseo locale: Chinese for any zh-*, English for everything else. */
export const languageFor = (locale: string | undefined): Language => (locale?.toLowerCase().startsWith("zh") ? "zh" : "en");

/** Follows Paseo's own language (Settings → General → Language). Paseo before plugin i18n has no source and stays English. */
export function followLocale(next: LocaleSource | undefined, onChange: () => void) {
  source = next;
  const notify = () => (onChange(), listeners.forEach((l) => l()));
  return next?.subscribe?.(notify) ?? (() => {});
}

export const currentLanguage = (): Language => languageFor(source?.locale);

const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));

/** Re-renders the caller when Paseo's language changes. */
export const useLanguage = (): Language => useSyncExternalStore(subscribe, currentLanguage);

/** A `t()` in Paseo's current language. */
export function useT() {
  const language = useLanguage();
  return useMemo(() => translator(language), [language]);
}

/** For transformer and DOM code that runs outside React. */
export const t = (key: MessageKey, vars?: MessageVars) => translate(currentLanguage(), key, vars);

export type { Language, MessageKey, MessageVars };

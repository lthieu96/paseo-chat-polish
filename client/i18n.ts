import { useMemo } from "react";
import { translator, type Language, type MessageKey, type MessageVars } from "../shared/i18n";
import { currentPrefs, usePrefs } from "./prefs";

/** A `t()` bound to the saved language; `usePrefs` re-renders the caller when it changes. */
export function useT() {
  const language = usePrefs().language;
  return useMemo(() => translator(language), [language]);
}

/** For transformer and DOM code that runs outside React; reads the latest prefs. */
export function t(key: MessageKey, vars?: MessageVars) {
  return translator(currentPrefs().language)(key, vars);
}

/** The saved language, for code that branches on it instead of translating a key. */
export const currentLanguage = (): Language => currentPrefs().language;

/** Subscribes a component to the saved language. */
export const useLanguage = (): Language => usePrefs().language;

export type { Language, MessageKey, MessageVars };

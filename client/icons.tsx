import { Icon as PaseoIcon } from "@getpaseo/plugin/client/react-native";
import { useSyncExternalStore } from "react";
import { Image, Platform } from "react-native";
import { usePrefs } from "./prefs";
import { iconTwins, subscribeIconSets } from "./web";

/** Paseo's Lucide icon, or its twin in the "Icon set" pref once the daemon has sent that set. React Native's Image draws
 * SVG only on web, so other platforms, and names without a twin, keep Lucide. */
export function Icon({ name, size = 16, color = "#888888" }: { name: string; size?: number; color?: string }) {
  const set = usePrefs().iconSet;
  const twins = useSyncExternalStore(subscribeIconSets, () => iconTwins(set));
  const paths = Platform.OS === "web" ? twins?.[name] : undefined;
  if (!paths) return <PaseoIcon name={name} size={size} color={color} />;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  return <Image source={{ uri: `data:image/svg+xml,${encodeURIComponent(svg)}` }} style={{ width: size, height: size }} />;
}

// Paseo's built-in themes as the Theme page lists them. ponytail: copied from Paseo 0.11.2; they can drift in later versions.
import type { ThemeDraft } from "../../shared/theme";

// ponytail: Paseo's built-in app themes, copied from Paseo 0.11.x (plugins can't read them); refresh when Paseo adds or retunes one.
export interface PaseoTheme {
  id: string;
  name: string;
  appearance: "light" | "dark";
  colors: { background: string; raised: string; control: string; border: string; foreground: string; muted: string; accent: string };
}

const paseoTheme = (id: string, name: string, appearance: "light" | "dark", c: string): PaseoTheme => {
  const [background, raised, control, border, foreground, muted, accent] = c.split(" ") as [string, string, string, string, string, string, string];
  return { id, name, appearance, colors: { background, raised, control, border, foreground, muted, accent } };
};

export const PASEO_LIGHT = paseoTheme("light", "Light", "light", "#ffffff #fafafa #f4f4f5 #e4e4e7 #1a1a1e #71717a #20744A");

export const PASEO_DARK = paseoTheme("dark", "Dark", "dark", "#181B1A #1E2120 #272A29 #252B2A #fafafa #A1A5A4 #20744A");

export const PASEO_THEMES: PaseoTheme[] = [
  { ...PASEO_DARK, id: "auto", name: "System" },
  PASEO_LIGHT,
  PASEO_DARK,
  paseoTheme("zinc", "Zinc", "dark", "#18181b #1f1f22 #27272a #27272a #fafafa #a1a1aa #e4e4e7"),
  paseoTheme("midnight", "Midnight", "dark", "#161820 #1c1e27 #252731 #242636 #fafafa #9a9db0 #3b6fcf"),
  paseoTheme("claude", "Claude", "dark", "#1f1f1e #262523 #2f2d2b #2c2a27 #fafafa #ada9a5 #d97757"),
  paseoTheme("ghostty", "Ghostty", "dark", "#282c34 #2f333d #383c48 #353a47 #fafafa #c8ccd8 #89b4fa"),
  paseoTheme("pureBlack", "Pure Black", "dark", "#000000 #0a0a0a #111111 #1c1c1c #fafafa #a1a1aa #20744A"),
];

/** System follows the OS: the tile shows both halves, the preview whichever is on now. */
function resolvePaseo(t: PaseoTheme): PaseoTheme {
  if (t.id !== "auto") return t;
  const dark = (globalThis as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
  return dark ? PASEO_DARK : PASEO_LIGHT;
}

/** A Paseo theme as a draft, so the preview and color tiles read it like any other; ring is Paseo's muted. */
export function paseoDraft(t: PaseoTheme, syntax: string): ThemeDraft {
  const { colors: c, appearance } = resolvePaseo(t);
  return { name: t.name, appearance, sidebar: "", syntax, colors: { background: c.background, raised: c.raised, control: c.control, border: c.border, foreground: c.foreground, mutedForeground: c.muted, ring: c.muted, accent: c.accent } };
}

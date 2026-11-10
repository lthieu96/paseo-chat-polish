import { defineRpc, defineSettings, type PluginThemeContribution } from "@getpaseo/plugin";
import { z } from "zod";

type Colors = PluginThemeContribution["colors"];

export interface Preset {
  id: string;
  name: string;
  appearance: "light" | "dark";
  colors: Required<Colors>;
  /** Desktop sidebar color the plugin paints itself; Paseo's dark themes reuse the background. */
  sidebar?: string;
  /** Highlight theme that suits the palette. */
  syntax: string;
}

/** The first preset is the default: One Dark Pro Darker - Mariana (myaaghubi.onedarkpro-mariana-vscode), mapped to Paseo's color roles. */
export const PRESETS: Preset[] = [
  {
    id: "one-dark-darker-mariana",
    name: "One Dark Darker Mariana",
    appearance: "dark",
    colors: {
      background: "#23272e", // editor.background of the Darker variant
      foreground: "#abb2bf",
      raised: "#2c313a",
      control: "#323842",
      border: "#3e4452",
      accent: "#6699cc",
      mutedForeground: "#959aa1", // Mariana comment #ffffff70 is 3.8:1 here, lifted to pass AA
      ring: "#84868a", // Mariana comment #ffffff70 as rendered on the Darker background
    },
    sidebar: "#1e2227", // sideBar.background
    syntax: "one-dark-darker-mariana",
  },
  {
    // Ink on ivory with one burnt-orange accent, after HEX's AgentMail work (hex.inc/work/agentmail); the accent is darkened from
    // their #ff6600 to keep 3:1 on the background.
    id: "ivory",
    name: "Ivory",
    appearance: "light",
    colors: {
      background: "#efeee9",
      foreground: "#151314",
      raised: "#f8f7f3",
      control: "#e4e2db",
      border: "#d6d3ca",
      accent: "#e85d04",
      mutedForeground: "#5c5850",
      ring: "#8c887f",
    },
    sidebar: "#e5e4de",
    syntax: "github-light",
  },
  {
    // Ivory a shade darker: cream paper and ink from HEX's AgentMail poster; the accent is darkened from #ff6600 to keep 3:1 on the background.
    id: "parchment",
    name: "Parchment",
    appearance: "light",
    colors: {
      background: "#dedbd1",
      foreground: "#141113",
      raised: "#e8e6df",
      control: "#d2cfc4",
      border: "#c4c0b4",
      accent: "#c84b00",
      mutedForeground: "#524e47",
      ring: "#77736a",
    },
    sidebar: "#d5d2c7",
    syntax: "github-light",
  },
  {
    id: "dusk",
    name: "Dusk",
    appearance: "dark",
    colors: {
      background: "#1b1a26",
      foreground: "#e4e0f0",
      raised: "#252335",
      control: "#2e2b40",
      border: "#3a3650",
      accent: "#c792ea",
      mutedForeground: "#9a94b0",
      ring: "#6e6a85",
    },
    syntax: "tokyo-night",
  },
];

export const TOKENS = ["background", "foreground", "raised", "control", "border", "accent", "mutedForeground", "ring"] as const;
export type Token = (typeof TOKENS)[number];

/** What Paseo paints with each color. `ring` is not a focus color: Paseo uses it for placeholders and extra-muted text. */
export const TOKEN_ROLES: Record<Token, string> = {
  background: "App canvas",
  foreground: "Primary text",
  raised: "Cards, hovered rows",
  control: "Inputs, chips",
  border: "Dividers, outlines",
  accent: "Highlights",
  mutedForeground: "Secondary text",
  ring: "Placeholders, faint text",
};

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
const mariana = PRESETS[0]!;

export const themeSchema = z.object({
  name: z.string().min(1).default(mariana.name),
  appearance: z.enum(["light", "dark"]).default(mariana.appearance),
  colors: z.object(Object.fromEntries(TOKENS.map((t) => [t, hex])) as Record<Token, typeof hex>).default(mariana.colors),
  /** Empty: leave Paseo's sidebar alone. */
  sidebar: hex.or(z.literal("")).default(mariana.sidebar ?? ""),
  /** Highlight theme for code the plugin draws (commands, diffs, JSON); "plain" turns it off. */
  syntax: z.string().default("one-dark-darker-mariana"),
});
export type ThemeDraft = z.output<typeof themeSchema>;

/** The theme this plugin contributes, edited from the dashboard. */
export const themeSettings = defineSettings({ id: "theme", scope: "host", version: 1, schema: themeSchema });

/** Lets the client entry fetch the saved theme before any screen mounts. */
export const getTheme = defineRpc({ name: "theme.get", input: z.object({}), output: themeSchema });

export const THEME_ID = "chat-polish";
/** Paseo's catalog id for this theme: `<plugin id>/theme/<theme id>`, assuming the manifest's plugin id. */
export const THEME_CATALOG_ID = `paseo-chat-polish/theme/${THEME_ID}`;

export const toContribution = (t: ThemeDraft): PluginThemeContribution => ({ id: THEME_ID, name: t.name, appearance: t.appearance, colors: t.colors });

export const isHex = (v: string) => hex.safeParse(v).success;

/**
 * Text color for an accent fill: Paseo uses the page color (`onPage`), which on a light theme's bright accent can sit near 3:1, so the
 * theme's text color is taken when it reads better. Dark themes keep the page color.
 */
export const onAccent = (accent: string, onPage: string, text: string) => (contrast(text, accent) > contrast(onPage, accent) ? text : onPage);

/** WCAG contrast ratio between two #rrggbb colors. */
export function contrast(a: string, b: string) {
  const lum = (h: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(h.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

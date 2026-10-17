import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/** Completed tool calls (and todo-list updates) the dashboard can leave out of the timeline. */
export const HIDEABLE = ["read", "search", "fetch", "task", "todo"] as const;
export type Hideable = (typeof HIDEABLE)[number];

/** Markdown elements with a choice of style. */
export const RICH_TEXT = ["quote", "table", "code", "inline", "heading", "list", "callout", "rule"] as const;
export type RichText = (typeof RICH_TEXT)[number];

const variant = z.enum(["a", "b", "c"]).default("a");
const shown = z.enum(["show", "hide"]).default("show");
/** Working indicators the turn footer can show; "dots" is Paseo's own grid. */
export const LOADERS = ["dots", "sparkle", "spokes", "dotring", "orb", "matrix", "snake"] as const;
export type Loader = (typeof LOADERS)[number];

/** Rows whose leading icon can be hidden. */
export const ICON_KINDS = ["steps", "tool", "thought"] as const;
export type IconKind = (typeof ICON_KINDS)[number];
// Tables have a fourth style, "d" (grid).
const tableVariant = z.enum(["a", "b", "c", "d"]).default("a");

export const prefsSchema = z.object({
  /** Initial state of reasoning rows; "paseo" follows Settings → Appearance → Always expand reasoning. */
  reasoning: z.enum(["paseo", "collapsed", "expanded"]).default("paseo"),
  /** Which tool rows start with their details open. */
  toolDetails: z.enum(["collapsed", "failed", "expanded"]).default("collapsed"),
  /** When the shell command in a row title is colored. */
  commandColors: z.enum(["expanded", "always"]).default("expanded"),
  /** Completed tool calls left out of the timeline; running and failed calls always show. */
  hidden: z.array(z.enum(HIDEABLE)).default([]),
  /** Long user messages: clamped to six lines with a fade (desktop), or shown in full. */
  userMessages: z.enum(["clamp", "full"]).default("clamp"),
  /** Thought and tool rows: faded (dim 30%, faded 45%, soft 65%) until hovered or opened, or full strength. An old "merged" value
   * (it hid items inside Paseo's virtualized list and crashed it) falls back to faded; merging is now `merge`, which removes items instead. */
  steps: z.enum(["dim", "faded", "soft", "full"]).catch("faded"),
  /** The "Copy  Text  Markdown" popup over text selected in a reply (desktop and web). */
  selectionCopy: z.enum(["on", "off"]).default("on"),
  /** Space between replies, prompts and step rows, for Paseo's items (web.ts) and the plugin's rows (views.tsx). */
  density: z.enum(["compact", "normal", "spacious"]).default("normal"),
  /** The icon at the start of merged, tool call and thought rows, per kind; hidden, a failed row's verb turns red instead.
   * An older single "show" or "hide" applies to all three. */
  rowIcons: z.preprocess(
    (v) => (typeof v === "string" ? { steps: v, tool: v, thought: v } : v),
    z.object({ steps: shown, tool: shown, thought: shown }).prefault({}),
  ),
  /** Each run of thoughts and tool calls between two replies folded into one row that opens to the steps (desktop and web). */
  merge: z.enum(["on", "off"]).default("on"),
  /** The working indicator in the turn footer: Paseo's six dots (animated smoothly) or another loader, and its size (14, 16 or 18pt).
   * Desktop and web, with Paseo's own items restyled. */
  loader: z.enum(LOADERS).default("dots"),
  loaderSize: z.enum(["s", "m", "l"]).default("s"),
  /** Paseo's own items (tool call groups, bubbles, markdown) restyled to the design on desktop, or left as Paseo draws them. */
  nativeStyle: z.enum(["design", "paseo"]).default("design"),
  /** A recap row the daemon adds after each turn that changed files or had a failing command. */
  recap: z.enum(["on", "off"]).default("on"),
  /** Image-only replies as thumbnails; "native" leaves them to Paseo. */
  images: z.enum(["small", "large", "native"]).default("small"),
  /** One style variant per markdown element in Paseo's own replies (desktop, with nativeStyle "design"); "a" is the base design. */
  richText: z.object({ quote: variant, table: tableVariant, code: variant, inline: variant, heading: variant, list: variant, callout: variant, rule: variant }).prefault({}),
});
export type Prefs = z.output<typeof prefsSchema>;

/** How timeline items render, edited from the dashboard. */
export const prefsSettings = defineSettings({ id: "timeline", scope: "host", version: 1, schema: prefsSchema });

/** Lets the client entry fetch saved prefs before the first timeline row renders. */
export const getPrefs = defineRpc({ name: "prefs.get", input: z.object({}), output: prefsSchema });

import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc, useSettings, type PluginScreenProps } from "@getpaseo/plugin/client";
import { ScrollView, TextInput } from "@getpaseo/plugin/client/react-native";
import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import { useEffect, useMemo, useState, type ComponentProps, type CSSProperties, type ReactNode } from "react";
import { ActivityIndicator, Image, Linking, Platform, Pressable, StyleSheet, Text, View, type DimensionValue, type LayoutChangeEvent } from "react-native";
import { contrast, isHex, PRESETS, THEME_CATALOG_ID, themeSchema, themeSettings, TOKEN_ROLES, TOKENS, type ThemeDraft, type Token } from "../shared/theme";
import { HIDEABLE, ICON_KINDS, LOADERS, prefsSettings, RICH_TEXT, type Hideable, type IconKind, type Loader, type Prefs, type RichText } from "../shared/timeline";
import { applyUpdate, checkUpdate, type UpdateStatus } from "../shared/update";
import { Icon } from "./icons";
import { APP_ICON } from "./mark";
import { hideableKind, todoData, toolData } from "./model";
import { setTodoChanges } from "./steps";
import { PrefsOverride, setPrefs, usePrefs } from "./prefs";
import { registerTheme, useCurrentTheme } from "./theme-registry";
import { PLAIN_SYNTAX, SYNTAX_THEMES } from "./highlight";
import { alpha, AppearanceOverride, CodeLine, ImagesItem, MergedSteps, PMONO, sunken, SyntaxOverride, ThoughtItem, TodoItem, ToolItem, useReducedMotion, useStyles } from "./views";
import { canSetAppTheme, DEFAULTS, diagramDoc, drawDiagram, loadMermaidDoc, PASEO_FONT_STACKS, readHostAppearance, readSyntaxTheme, setAppTheme, updateAppSettings } from "./web";

type ToolCall = Extract<AgentTimelineItem, { type: "tool_call" }>;
const SQUIRCLE_CARD = { dataSet: { cpSquircle: "card" } } as object;
const call = (detail: ToolCall["detail"], extra?: Partial<ToolCall>) =>
  ({ type: "tool_call", callId: "preview", name: "preview", status: "completed", error: null, detail, ...extra }) as ToolCall;

const PREVIEW_CALLS = [
  call({ type: "search", query: "verifyToken", numMatches: 11, numFiles: 7, filePaths: ["src/routes/billing.ts", "src/routes/users.ts"] }),
  call({ type: "read", filePath: "src/routes/billing.ts" }),
  call({ type: "write", filePath: "src/middleware/requireAuth.ts", content: "\n".repeat(27) }),
  call({ type: "shell", command: "npm run lint", output: "src/routes/users.ts\n  12:10  error  'verifyToken' is defined but never used", exitCode: 1 }, { status: "failed" }),
  call({ type: "shell", command: "npm test -- auth", output: "PASS  test/auth.middleware.test.ts\nTests:  24 passed, 24 total", exitCode: 0 }),
  call({ type: "plain_text", label: "Dev server exited", text: "<task-notification/>" }, { name: "task_notification" }),
];

// A todo update that finished the second of three tasks: a step of the merged row, or its own row with merging off.
const PREVIEW_TODO = {
  type: "todo",
  items: [
    { text: "Find every verifyToken() call", completed: true, status: "completed" },
    { text: "Move auth into requireAuth", completed: true, status: "completed" },
    { text: "Run the auth tests", completed: false, status: "in_progress", activeForm: "Running the auth tests" },
  ],
} as Extract<AgentTimelineItem, { type: "todo" }>;
setTodoChanges(PREVIEW_TODO, [{ type: "completed", text: "Move auth into requireAuth" }]);

// The Theme page's Code view: an edit diff, a quiet and a failed shell call, and an MCP call with input and output.
const CODE_CALLS = [
  call({
    type: "edit",
    filePath: "/tmp/cp-ui-sample/auth.ts",
    oldString: "  if (!ok) return deny(401);",
    newString: "  if (!ok) return deny(403);",
    unifiedDiff: "@@ -12,4 +12,4 @@\n export function requireAuth(req, next) {\n   const ok = verifyToken(req);\n-  if (!ok) return deny(401);\n+  if (!ok) return deny(403);\n   next();",
  }),
  call({ type: "shell", command: "ls -la && head -5 auth.ts", output: "" }),
  call({ type: "shell", command: 'node -e "process.exit(1)"', output: "", exitCode: 1 }, { status: "failed" }),
  call(
    {
      type: "unknown",
      input: {},
      output: [{ id: "write", label: "Write Approval", colorTier: "moderate" }, { id: "read", label: "Read Only", colorTier: "safe" }].map((m) => ({ mode: m, status: "available" })),
    },
    { name: "mcp__paseo__list_providers" },
  ),
];
const CODE_REPLY = ["export function requireAuth(req, next) {", "  const token = verifyToken(req);", "  if (!token) return deny(401);", "  next();", "}"];

// 2×2 pixels in the Mariana accents; scaled up it reads as a soft gradient screenshot.
const PREVIEW_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAF0lEQVR4nGNIm3nm6JSjDPGbN//angwANX4Hw07OqLUAAAAASUVORK5CYII=";

type Page = "theme" | "messages" | "steps" | "rich";
const PAGES: Array<{ id: Page; icon: string; label: string; group: string }> = [
  { id: "theme", icon: "Palette", label: "Theme", group: "APPEARANCE" },
  { id: "messages", icon: "MessageSquareText", label: "Messages", group: "CHAT" },
  { id: "steps", icon: "ListTree", label: "Steps", group: "CHAT" },
  { id: "rich", icon: "Type", label: "Rich text", group: "CHAT" },
];

// ponytail: Paseo's built-in app themes, copied from Paseo 0.11.x (plugins can't read them); refresh when Paseo adds or retunes one.
interface PaseoTheme {
  id: string;
  name: string;
  appearance: "light" | "dark";
  colors: { background: string; raised: string; control: string; border: string; foreground: string; muted: string; accent: string };
}
const paseoTheme = (id: string, name: string, appearance: "light" | "dark", c: string): PaseoTheme => {
  const [background, raised, control, border, foreground, muted, accent] = c.split(" ") as [string, string, string, string, string, string, string];
  return { id, name, appearance, colors: { background, raised, control, border, foreground, muted, accent } };
};
const PASEO_LIGHT = paseoTheme("light", "Light", "light", "#ffffff #fafafa #f4f4f5 #e4e4e7 #1a1a1e #71717a #20744A");
const PASEO_DARK = paseoTheme("dark", "Dark", "dark", "#181B1A #1E2120 #272A29 #252B2A #fafafa #A1A5A4 #20744A");
const PASEO_THEMES: PaseoTheme[] = [
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
function paseoDraft(t: PaseoTheme, syntax: string): ThemeDraft {
  const { colors: c, appearance } = resolvePaseo(t);
  return { name: t.name, appearance, sidebar: "", syntax, colors: { background: c.background, raised: c.raised, control: c.control, border: c.border, foreground: c.foreground, mutedForeground: c.muted, ring: c.muted, accent: c.accent } };
}

/** Fonts and sizes as Paseo's Settings → Appearance keeps them; empty fonts are the system default. */
interface Typography {
  uiFont: string;
  contentSize: number;
  monoFont: string;
  codeSize: number;
}


const sameColors = (a: ThemeDraft["colors"], b: ThemeDraft["colors"]) => TOKENS.every((t) => a[t].toLowerCase() === b[t].toLowerCase());

/** Plugin theme tokens for a draft, so the preview renders exactly what Apply would ship. */
function previewTheme(d: ThemeDraft, host: PluginTheme): PluginTheme {
  const c = d.colors;
  const onAccent = contrast(c.accent, "#ffffff") >= contrast(c.accent, c.background) ? "#ffffff" : c.background;
  return {
    colors: {
      ...host.colors,
      surface0: c.background,
      surface1: c.raised,
      surface2: c.control,
      border: c.border,
      foreground: c.foreground,
      foregroundMuted: c.mutedForeground,
      accent: c.accent,
      accentForeground: onAccent,
    },
  };
}

function Button({ theme, label, icon, primary, disabled, onPress }: { theme: PluginTheme; label: string; icon: string; primary?: boolean; disabled?: boolean; onPress(): void }) {
  const s = useStyles(theme);
  const reducedMotion = useReducedMotion();
  const c = theme.colors;
  const fg = primary ? c.accentForeground : c.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 8,
        opacity: disabled ? 0.45 : reducedMotion && pressed ? 0.8 : 1,
        transform: pressed && !reducedMotion ? [{ scale: 0.97 }] : undefined,
        ...(primary ? { backgroundColor: c.accent } : { borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }),
      })}
    >
      <Icon name={icon} size={14} color={primary ? fg : c.foregroundMuted} />
      <Text style={[s.verb, { color: fg, fontWeight: primary ? "600" : "400" }]}>{label}</Text>
    </Pressable>
  );
}



/** Options are [value, icon, label?, paseo?]; an empty icon leaves it out, and `paseo` marks the choice that leaves Paseo as is. */
function Segmented<T extends string>({ theme, value, options, onChange }: { theme: PluginTheme; value: T; options: Array<[T, string, string?, boolean?]>; onChange(v: T): void }) {
  const s = useStyles(theme);
  const c = theme.colors;
  return (
    <View style={{ flexDirection: "row", padding: 2, gap: 2, borderRadius: 8, backgroundColor: c.surface2 }}>
      {options.map(([v, icon, label, paseo]) => {
        const on = v === value;
        return (
          <Pressable
            key={v}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label ?? icon}
            onPress={() => onChange(v)}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: on ? c.surface1 : undefined }}
          >
            {icon ? <Icon name={icon} size={13} color={on ? c.foreground : c.foregroundMuted} /> : null}
            {label ? <Text style={[s.small, { fontSize: 12, color: on ? c.foreground : c.foregroundMuted }]}>{label}</Text> : null}
            {paseo ? <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c.foregroundMuted }} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** A caps label with a quiet hint on the right. */
function SectionHead({ theme, title, hint }: { theme: PluginTheme; title: string; hint?: string }) {
  const s = useStyles(theme);
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text style={[s.label, { fontSize: 11, marginBottom: 0 }]}>{title.toUpperCase()}</Text>
      {hint ? <Text style={[s.small, { fontSize: 11 }]}>{hint}</Text> : null}
    </View>
  );
}

/** A small full-radius tag: "Live", "AA". */
function Badge({ theme, label, icon, tone }: { theme: PluginTheme; label: string; icon?: string; tone?: string }) {
  const s = useStyles(theme);
  const c = theme.colors;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, borderWidth: tone ? 0 : 1, borderColor: alpha(c.border, 0.9), backgroundColor: tone ? alpha(tone, 0.14) : undefined }}>
      {icon ? <Icon name={icon} size={10} color={tone ?? c.foregroundMuted} /> : tone ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: tone }} /> : null}
      <Text style={[s.small, { fontSize: 11, lineHeight: 14, color: tone ?? c.foregroundMuted }]}>{label}</Text>
    </View>
  );
}

/** An informational box: accent icon, text, and an optional action on the right. */
function Notice({ theme, icon = "Info", children, action }: { theme: PluginTheme; icon?: string; children: ReactNode; action?: ReactNode }) {
  const s = useStyles(theme);
  const c = theme.colors;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 8, backgroundColor: c.surface1, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }}>
      <Icon name={icon} size={14} color={icon === "Info" ? c.accent : c.foregroundMuted} />
      <Text style={[s.small, { flex: 1, fontSize: 12, lineHeight: 17, color: c.foreground }]}>{children}</Text>
      {action}
    </View>
  );
}

function Switch({ theme, value, label, onChange }: { theme: PluginTheme; value: boolean; label: string; onChange(v: boolean): void }) {
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={{ width: 30, height: 18, padding: 2, borderRadius: 9, justifyContent: "center", backgroundColor: value ? c.accent : c.surface2 }}
    >
      <View style={{ width: 14, height: 14, borderRadius: 7, alignSelf: value ? "flex-end" : "flex-start", backgroundColor: value ? c.accentForeground : c.foregroundMuted }} />
    </Pressable>
  );
}

/** A toggle chip: on shows a check on an accent tint, off an eye-off icon and muted text. */
function Chip({ theme, on, label, onPress }: { theme: PluginTheme; on: boolean; label: string; onPress(): void }) {
  const s = useStyles(theme);
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: on ? alpha(c.accent, 0.55) : c.border, backgroundColor: on ? alpha(c.accent, 0.12) : undefined }}
    >
      <Icon name={on ? "Check" : "EyeOff"} size={13} color={on ? c.accent : c.foregroundMuted} />
      <Text style={[s.small, { fontSize: 13, color: on ? c.foreground : c.foregroundMuted }]}>{label}</Text>
    </Pressable>
  );
}

/** Small caps title above a raised, hairline-bordered card; `top` sits between them (a notice). */
function Group({ theme, title, top, children }: { theme: PluginTheme; title: string; top?: ReactNode; children: ReactNode }) {
  const c = theme.colors;
  return (
    <View style={{ gap: 10 }}>
      <SectionHead theme={theme} title={title} />
      {top}
      <View {...SQUIRCLE_CARD} style={{ borderRadius: 10, backgroundColor: c.surface1, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, overflow: "hidden" }}>{children}</View>
    </View>
  );
}

/** A setting: label and one-line hint on the left, the control on the right (or under them when `stacked`). */
function Row({ theme, label, hint, stacked, first, children }: { theme: PluginTheme; label: string; hint: string; stacked?: boolean; first?: boolean; children: ReactNode }) {
  const s = useStyles(theme);
  const text = (
    <View style={{ flex: stacked ? undefined : 1, gap: 2 }}>
      <Text style={[s.verb, { fontSize: 13 }]}>{label}</Text>
      <Text style={[s.small, { fontSize: 12 }]}>{hint}</Text>
    </View>
  );
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: first ? 0 : StyleSheet.hairlineWidth, borderTopColor: theme.colors.border }}>
      {stacked ? (
        <View style={{ gap: 10 }}>
          {text}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{children}</View>
        </View>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          {text}
          {children}
        </View>
      )}
    </View>
  );
}

/** "• Paseo's default", the key to the dot on Segmented options. */
function Legend({ theme }: { theme: PluginTheme }) {
  const s = useStyles(theme);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: theme.colors.foregroundMuted }} />
      <Text style={[s.small, { fontSize: 12 }]}>Paseo's default</Text>
    </View>
  );
}

/** The switch for restyling Paseo's own items; it gates Rich text and the loaders, so it sits outside any one page. */
function RestyleCard({ theme, prefs, onChange }: { theme: PluginTheme; prefs: Prefs; onChange(p: Prefs): void }) {
  const s = useStyles(theme);
  const c = theme.colors;
  return (
    <View {...SQUIRCLE_CARD} style={{ gap: 6, padding: 10, borderRadius: 10, backgroundColor: c.surface1, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon name="Paintbrush" size={14} color={c.foregroundMuted} />
        <Text style={[s.verb, { flex: 1, fontSize: 13 }]}>Restyle Paseo's items</Text>
        <Switch theme={theme} label="Restyle Paseo's items" value={prefs.nativeStyle === "design"} onChange={(on) => onChange({ ...prefs, nativeStyle: on ? "design" : "paseo" })} />
      </View>
      <Text style={[s.small, { fontSize: 12 }]}>Bubbles, tool groups and markdown. Rich text and loaders need it.</Text>
    </View>
  );
}

/**
 * Shown when Paseo finds a newer commit (Git install) or version (npm) for this plugin; checked each time the dashboard opens.
 * Update runs `paseo plugin update`, which installs it and restarts the plugin, so the dashboard reloads on the new code.
 */
function UpdateCard({ theme }: { theme: PluginTheme }) {
  const s = useStyles(theme);
  const c = theme.colors;
  const check = useRpc(checkUpdate);
  const apply = useRpc(applyUpdate);
  const [status, setStatus] = useState<UpdateStatus>();
  const [phase, setPhase] = useState<"idle" | "updating" | "restarting">("idle");
  const [error, setError] = useState<string>();
  useEffect(() => {
    let live = true;
    check({}).then((s) => live && setStatus(s), () => {});
    return () => void (live = false);
  }, [check]);
  if (status?.state !== "update") return null;
  const update = () => {
    setPhase("updating");
    setError(undefined);
    // The call fails when the restart cuts it off, which also means the update went through.
    apply({}).then(
      (r) => (r.error ? (setError(r.error), setPhase("idle")) : setPhase("restarting")),
      () => setPhase("restarting"),
    );
  };
  return <UpdateCardView theme={theme} status={status} phase={phase} error={error} onUpdate={update} />;
}

/** Accent while an update waits, red once it failed, green while the plugin restarts on the new code. */
function UpdateCardView({ theme, status, phase, error, onUpdate }: { theme: PluginTheme; status: UpdateStatus; phase: "idle" | "updating" | "restarting"; error?: string; onUpdate(): void }) {
  const s = useStyles(theme);
  const c = theme.colors;
  const reducedMotion = useReducedMotion();
  const tone = phase === "restarting" ? c.statusSuccess : error ? c.statusDanger : c.accent;
  const title = phase === "restarting" ? "Updated" : phase === "updating" ? "Updating…" : error ? "Update failed" : "Update available";
  const mono = [s.small, { fontSize: 11, lineHeight: 15 }];
  const review = status.links[0];
  const press = ({ pressed }: { pressed: boolean }) => ({ opacity: reducedMotion && pressed ? 0.8 : 1, transform: pressed && !reducedMotion ? [{ scale: 0.97 }] : undefined });
  return (
    <View {...SQUIRCLE_CARD} style={{ gap: 10, padding: 12, borderRadius: 12, backgroundColor: alpha(tone, 0.08), borderWidth: 1, borderColor: alpha(tone, 0.24) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ width: 28, height: 28, borderRadius: 999, backgroundColor: alpha(tone, 0.16), alignItems: "center", justifyContent: "center" }}>
          {phase === "updating" ? <ActivityIndicator size="small" color={tone} /> : <Icon name={phase === "restarting" ? "Check" : error ? "TriangleAlert" : "ArrowDownToLine"} size={14} color={tone} />}
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={[s.verb, { fontSize: 13, fontWeight: "600" }]} numberOfLines={1}>
            {title}
          </Text>
          {phase === "idle" ? (
            <Text style={mono} numberOfLines={1} {...PMONO}>
              {status.current} <Text style={{ color: c.foregroundMuted }}>→</Text> <Text style={{ color: c.foreground }}>{status.target}</Text>
            </Text>
          ) : (
            <Text style={[s.small, { fontSize: 12 }]} numberOfLines={1}>
              {phase === "updating" ? `Installing ${status.target}` : "Restarting Chat Polish…"}
            </Text>
          )}
        </View>
      </View>
      {error ? (
        <Text style={[s.small, { fontSize: 12, lineHeight: 16, color: c.statusDanger }]} numberOfLines={3}>
          {error}
        </Text>
      ) : null}
      {phase === "idle" ? (
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Pressable accessibilityRole="button" onPress={onUpdate} style={(st) => [{ flex: 1, height: 28, borderRadius: 6, backgroundColor: c.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }, press(st)]}>
            <Text style={[s.verb, { fontSize: 12, fontWeight: "600", color: c.accentForeground }]}>{error ? "Try again" : "Update now"}</Text>
          </Pressable>
          {review ? (
            <Pressable accessibilityRole="link" accessibilityLabel="Review changes" onPress={() => void Linking.openURL(review)} style={(st) => [{ height: 28, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: alpha(tone, 0.24), flexDirection: "row", alignItems: "center", gap: 4 }, press(st)]}>
              <Text style={[s.verb, { fontSize: 12, color: c.foreground }]}>Changes</Text>
              <Icon name="ArrowUpRight" size={12} color={c.foregroundMuted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function InnerNav({ theme, host, page, prefs, onSelect, onPrefs }: { theme: PluginTheme; host: string; page: Page; prefs: Prefs; onSelect(p: Page): void; onPrefs(p: Prefs): void }) {
  const s = useStyles(theme);
  const c = theme.colors;
  const item = ({ id, icon, label }: (typeof PAGES)[number]) => {
    const active = id === page;
    return (
      <Pressable
        key={id}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        onPress={() => onSelect(id)}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 8,
          paddingVertical: 8,
          borderRadius: 6,
          backgroundColor: active ? c.surface2 : pressed ? c.surface1 : undefined,
        })}
      >
        <Icon name={icon} size={16} color={active ? c.foreground : c.foregroundMuted} />
        <Text style={[s.target, { color: active ? c.foreground : c.foregroundMuted, flex: 1 }]}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <View style={{ width: 248, paddingHorizontal: 12, paddingVertical: 20, gap: 24, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: c.border }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 8 }}>
        {Platform.OS === "web" ? (
          <Image source={{ uri: APP_ICON }} style={{ width: 24, height: 24 }} />
        ) : (
          <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" }}>
            <Icon name="Sparkles" size={14} color={c.accentForeground} />
          </View>
        )}
        <View>
          <Text style={[s.title, { fontSize: 14 }]}>Chat Polish</Text>
          <Text style={[s.small, { fontSize: 11 }]}>Paseo plugin</Text>
        </View>
      </View>
      {["APPEARANCE", "CHAT"].map((group) => (
        <View key={group} style={{ gap: 2 }}>
          <Text style={[s.label, { paddingHorizontal: 8, marginBottom: 2 }]}>{group}</Text>
          {PAGES.filter((p) => p.group === group).map(item)}
        </View>
      ))}
      <View style={{ flex: 1 }} />
      <UpdateCard theme={theme} />
      {canSetAppTheme ? <RestyleCard theme={theme} prefs={prefs} onChange={onPrefs} /> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.statusSuccess }} />
        <Text style={[s.small, { fontSize: 11 }]} numberOfLines={1}>
          Plugin active · {host}
        </Text>
      </View>
    </View>
  );
}


const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** Tiles in rows of `n`; a short last row is padded so its tiles keep the same width. */
function Grid({ n, gap = 8, children }: { n: number; gap?: number; children: ReactNode[] }) {
  return (
    <View style={{ gap }}>
      {chunk(children, n).map((row, i) => (
        <View key={i} style={{ flexDirection: "row", gap }}>
          {row}
          {Array.from({ length: n - row.length }, (_, j) => (
            <View key={`pad${j}`} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** A theme: "Aa" and an accent dot on its background (two halves for System), the name under it, a check when it is the app theme. */
function ThemeTile({ theme, name, halves, selected, active, onPress }: { theme: PluginTheme; name: string; halves: Array<[string, string, string]>; selected: boolean; active: boolean; onPress(): void }) {
  const s = useStyles(theme);
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ selected }}
      onPress={onPress}
      {...SQUIRCLE_CARD}
      style={{ flex: 1, borderRadius: 8, overflow: "hidden", backgroundColor: c.surface1, borderWidth: selected ? 1.5 : StyleSheet.hairlineWidth, borderColor: selected ? c.accent : c.border }}
    >
      <View style={{ flexDirection: "row", height: 42 }}>
        {halves.map(([bg, fg, accent], i) => (
          <View key={i} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, backgroundColor: bg }}>
            <Text style={[s.verb, { fontSize: 13, color: fg }]}>Aa</Text>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: accent }} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 7 }}>
        <Text style={[s.small, { flex: 1, fontSize: 12, color: selected ? c.foreground : c.foregroundMuted }]} numberOfLines={1}>
          {name}
        </Text>
        {active ? <Icon name="Check" size={12} color={c.accent} /> : null}
      </View>
    </Pressable>
  );
}

/** Height shared by the typography inputs, steppers and sample boxes so their rows line up; the size column has a fixed width so both font inputs match. */
const FIELD = 34;
const STEPPER = 104;

const input = (s: ReturnType<typeof useStyles>, c: PluginTheme["colors"]) => ({ ...s.target, color: c.foreground, backgroundColor: c.surface0, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 });

function Stepper({ theme, value, label, onChange }: { theme: PluginTheme; value: number; label: string; onChange(v: number): void }) {
  const s = useStyles(theme);
  const c = theme.colors;
  const step = (icon: string, by: number) => (
    <Pressable accessibilityRole="button" accessibilityLabel={`${by < 0 ? "Decrease" : "Increase"} ${label}`} onPress={() => onChange(Math.min(32, Math.max(8, value + by)))} style={{ width: 28, height: FIELD - 2, alignItems: "center", justifyContent: "center" }}>
      <Icon name={icon} size={13} color={c.foregroundMuted} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", width: STEPPER, height: FIELD, borderRadius: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface0 }}>
      {step("Minus", -1)}
      <Text style={[s.target, { flex: 1, textAlign: "center", color: c.foreground, fontVariant: ["tabular-nums"] }]}>{value}</Text>
      {step("Plus", 1)}
    </View>
  );
}

/** Paseo's Settings → Appearance fonts and sizes, free text like Paseo's own (empty is the system default). The dot marks Paseo's size. */
function TypographySection({ theme, typo, setTypo }: { theme: PluginTheme; typo: Typography; setTypo(t: Typography): void }) {
  const s = useStyles(theme);
  const c = theme.colors;
  const field = (label: string, key: "uiFont" | "monoFont", mono: boolean) => (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={[s.small, { fontSize: 12 }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={typo[key]}
        onChangeText={(v) => setTypo({ ...typo, [key]: v })}
        placeholder="System default"
        placeholderTextColor={c.foregroundMuted}
        autoCapitalize="none"
        autoCorrect={false}
        {...(mono ? PMONO : null)}
        style={[input(s, c), mono ? s.code : null, { color: c.foreground, height: FIELD, paddingVertical: 0 }]}
      />
    </View>
  );
  const size = (label: string, key: "contentSize" | "codeSize") => (
    <View style={{ width: STEPPER, gap: 4 }}>
      <Text style={[s.small, { fontSize: 12 }]} numberOfLines={1}>
        {label}
      </Text>
      <Stepper theme={theme} value={typo[key]} label={label} onChange={(v) => setTypo({ ...typo, [key]: v })} />
    </View>
  );
  const box = (children: ReactNode) => (
    <View style={{ width: FIELD, height: FIELD, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: c.surface2 }}>{children}</View>
  );
  return (
    <View style={{ gap: 10 }}>
      <SectionHead theme={theme} title="Typography" hint="Settings → Appearance" />
      <View {...SQUIRCLE_CARD} style={{ borderRadius: 10, backgroundColor: c.surface1, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12, padding: 12 }}>
          {box(<Text style={[s.title, { fontSize: 15 }, { "--paseo-ui-font": typo.uiFont || PASEO_FONT_STACKS.ui } as object]}>Ag</Text>)}
          {field("Interface font", "uiFont", false)}
          {size("Content size", "contentSize")}
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12, padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }}>
          {box(<Text {...PMONO} style={[s.code, { fontSize: 15, color: c.foreground }, { fontFamily: typo.monoFont || PASEO_FONT_STACKS.mono }]}>{"{}"}</Text>)}
          {field("Code font", "monoFont", true)}
          {size("Code size", "codeSize")}
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
        <View style={{ height: 17, justifyContent: "center" }}>
          <Icon name="RotateCw" size={13} color={c.foregroundMuted} />
        </View>
        <Text style={[s.small, { flex: 1, fontSize: 12, lineHeight: 17 }]}>Type any installed font, or leave empty for the system default. Paseo's sizes are {DEFAULTS.contentSize} and {DEFAULTS.codeSize}. Applies app-wide once you apply; Paseo reloads.</Text>
      </View>
    </View>
  );
}

const TOKEN_LABEL: Partial<Record<Token, string>> = { mutedForeground: "muted" };
const SURFACES: Token[] = ["background", "raised", "control", "border"];
const TEXTS: Token[] = ["foreground", "mutedForeground", "ring", "accent"];

/** A color: its swatch (text colors show "Aa" on the background and their contrast), name and hex. Clicking selects it for the hex editor. */
function ColorTile({ theme, token, draft, selected, onPress }: { theme: PluginTheme; token: Token; draft: ThemeDraft; selected: boolean; onPress?(): void }) {
  const s = useStyles(theme);
  const c = theme.colors;
  const color = draft.colors[token];
  const text = TEXTS.includes(token);
  const ratio = contrast(color, draft.colors.background);
  const tone = token === "ring" ? undefined : ratio >= 4.5 ? c.statusSuccess : c.statusWarning;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      disabled={!onPress}
      onPress={onPress}
      {...SQUIRCLE_CARD}
      style={{ flex: 1, borderRadius: 8, overflow: "hidden", backgroundColor: c.surface1, borderWidth: selected ? 1.5 : StyleSheet.hairlineWidth, borderColor: selected ? c.accent : c.border }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 44, paddingHorizontal: 10, backgroundColor: text ? draft.colors.background : color }}>
        {text ? (
          <>
            <Text style={[s.verb, { fontSize: 15, color }]}>Aa</Text>
            <View style={{ flex: 1 }} />
            <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: tone ? alpha(tone, 0.16) : alpha(c.foregroundMuted, 0.18) }}>
              <Text style={[s.small, { fontSize: 10, lineHeight: 14, color: tone ?? c.foregroundMuted }]}>
                {ratio.toFixed(1)} {token === "ring" ? "faint" : ratio >= 4.5 ? "AA" : "low"}
              </Text>
            </View>
          </>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: 8, paddingVertical: 8, gap: 1 }}>
        <Text {...PMONO} numberOfLines={1} style={[s.code, { fontSize: 11, color: c.foreground }]}>{TOKEN_LABEL[token] ?? token}</Text>
        <Text {...PMONO} numberOfLines={1} style={[s.code, { fontSize: 11, color: c.foregroundMuted }]}>{color}</Text>
      </View>
    </Pressable>
  );
}

/** One full-width color row: swatch, name, what it paints, and a hex input unless the color is read-only. */
function ColorRow({ theme, name, hint, color, text, bad, accent, onText }: { theme: PluginTheme; name: string; hint: string; color: string; text?: string; bad?: boolean; accent?: boolean; onText?(v: string): void }) {
  const s = useStyles(theme);
  const c = theme.colors;
  return (
    <View {...SQUIRCLE_CARD} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: 10, backgroundColor: c.surface1, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }}>
      <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: color, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text {...PMONO} style={[s.code, { fontSize: 12, color: c.foreground }]}>{name}</Text>
        <Text style={[s.small, { fontSize: 12 }]}>{hint}</Text>
      </View>
      {onText ? (
        <TextInput
          accessibilityLabel={`${name} hex color`}
          value={text}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="#rrggbb"
          onChangeText={onText}
          {...PMONO}
          style={[input(s, c), s.code, { width: 104, paddingVertical: 6, color: c.foreground, borderColor: bad ? c.statusDanger : accent ? c.accent : c.border }]}
        />
      ) : null}
    </View>
  );
}

const normalize = (v: string) => (v.trim().startsWith("#") ? v.trim() : `#${v.trim()}`);

interface EditorProps {
  theme: PluginTheme;
  draft: ThemeDraft;
  /** What the tiles and preview show: the draft, or the Paseo theme being looked at. */
  shown: ThemeDraft;
  view: string | undefined;
  /** The app theme in use: a Paseo theme id, "plugin" for this plugin's, or "other". */
  appId: string;
  /** The plugin theme as saved, which is what "plugin" applies. */
  saved: ThemeDraft | undefined;
  typo: Typography;
  setDraft(d: ThemeDraft): void;
  setView(id: string | undefined): void;
  setTypo(t: Typography): void;
}

function Editor({ theme, draft, shown, view, appId, saved, typo, setDraft, setView, setTypo }: EditorProps) {
  const s = useStyles(theme);
  const c = theme.colors;
  const locked = !!view;
  // Hex text being typed; only valid values reach the draft.
  const [typing, setTyping] = useState<Partial<Record<Token | "sidebar", string>>>({});
  const [token, setToken] = useState<Token>("raised");
  useEffect(() => setTyping({}), [draft.colors, draft.sidebar]);
  const presetOf = (d: ThemeDraft) => PRESETS.find((p) => sameColors(p.colors, d.colors) && (p.sidebar ?? "") === d.sidebar && p.syntax === d.syntax)?.id;
  const selected = locked ? undefined : presetOf(draft);
  const inUse = appId === "plugin" && saved ? presetOf(saved) : undefined;
  const tokenText = typing[token] ?? draft.colors[token];
  const sidebarText = typing.sidebar ?? draft.sidebar;
  const sidebarBad = !!typing.sidebar && !isHex(normalize(typing.sidebar));
  const sub = (title: string, hint: string) => (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text style={[s.verb, { fontSize: 13 }]}>{title}</Text>
      <Text style={[s.small, { fontSize: 12 }]}>{hint}</Text>
    </View>
  );
  const grid = (tokens: Token[]) => (
    <Grid n={4}>
      {tokens.map((t) => (
        <ColorTile key={t} theme={theme} token={t} draft={shown} selected={!locked && t === token} onPress={locked ? undefined : () => setToken(t)} />
      ))}
    </Grid>
  );
  return (
    <View style={{ gap: 28 }}>
      <View style={{ gap: 12 }}>
        <SectionHead theme={theme} title="App theme" />
        <View style={{ gap: 8 }}>
          {sub("Paseo", "built in · read only")}
          <Grid n={4}>
            {PASEO_THEMES.map((t) => {
              const half = (p: PaseoTheme): [string, string, string] => [p.colors.background, p.colors.foreground, p.colors.accent];
              return <ThemeTile key={t.id} theme={theme} name={t.name} halves={t.id === "auto" ? [half(PASEO_LIGHT), half(PASEO_DARK)] : [half(t)]} selected={view === t.id} active={appId === t.id} onPress={() => setView(t.id)} />;
            })}
          </Grid>
        </View>
        <View style={{ gap: 8 }}>
          {sub("Chat Polish", "editable")}
          <Grid n={4}>
            {[
              ...PRESETS.map((p) => (
                <ThemeTile
                  key={p.id}
                  theme={theme}
                  name={p.name.replace("One Dark Darker ", "")}
                  halves={[[p.colors.background, p.colors.foreground, p.colors.accent]]}
                  selected={p.id === selected}
                  active={p.id === inUse}
                  onPress={() => {
                    setView(undefined);
                    setDraft({ name: p.name, appearance: p.appearance, colors: { ...p.colors }, sidebar: p.sidebar ?? "", syntax: p.syntax });
                  }}
                />
              )),
              <Pressable
                key="new"
                accessibilityRole="button"
                accessibilityLabel="New theme from current colors"
                onPress={() => {
                  setView(undefined);
                  setDraft({ ...shown, name: "Custom theme" });
                }}
                style={{ flex: 1, minHeight: 72, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, alignItems: "center", justifyContent: "center", gap: 4 }}
              >
                <Icon name="Plus" size={15} color={c.foregroundMuted} />
                <Text style={[s.small, { fontSize: 12 }]}>New theme</Text>
              </Pressable>,
            ]}
          </Grid>
        </View>
        {locked ? null : (
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <TextInput accessibilityLabel="Theme name" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name: name || " " })} style={[input(s, c), { flex: 1, backgroundColor: c.surface1, fontSize: 14, color: c.foreground }]} />
            <Segmented
              theme={theme}
              value={draft.appearance}
              onChange={(appearance) => setDraft({ ...draft, appearance })}
              options={[
                ["light", "Sun", "Light"],
                ["dark", "Moon", "Dark"],
              ]}
            />
          </View>
        )}
      </View>

      {canSetAppTheme ? <TypographySection theme={theme} typo={typo} setTypo={setTypo} /> : null}

      {locked ? (
        <Notice theme={theme} icon="Lock">
          Built into Paseo, so these colors can't be edited. Customize a copy makes a Chat Polish theme from them.
        </Notice>
      ) : null}

      <View style={{ gap: 10 }}>
        <SectionHead theme={theme} title="Surfaces" hint="back to front" />
        {grid(SURFACES)}
      </View>
      <View style={{ gap: 10 }}>
        <SectionHead theme={theme} title="Text and accent" hint="contrast on background" />
        {grid(TEXTS)}
      </View>

      {canSetAppTheme ? (
        <View style={{ gap: 10 }}>
          <SectionHead theme={theme} title="Sidebar" hint="desktop only" />
          <ColorRow
            theme={theme}
            name="sidebar"
            hint="Empty uses background"
            color={shown.sidebar || shown.colors.background}
            text={sidebarText}
            bad={sidebarBad}
            onText={
              locked
                ? undefined
                : (v) => {
                    const t = v.trim();
                    const next = !t ? "" : normalize(t);
                    setTyping({ ...typing, sidebar: v });
                    if (next === "" || isHex(next)) setDraft({ ...draft, sidebar: next.toLowerCase() });
                  }
            }
          />
        </View>
      ) : null}
      {locked ? null : (
        <ColorRow
          theme={theme}
          name={TOKEN_LABEL[token] ?? token}
          hint={TOKEN_ROLES[token]}
          color={draft.colors[token]}
          text={tokenText}
          bad={!isHex(normalize(tokenText))}
          accent
          onText={(v) => {
            const next = normalize(v);
            setTyping({ ...typing, [token]: v });
            if (isHex(next)) setDraft({ ...draft, colors: { ...draft.colors, [token]: next.toLowerCase() } });
          }}
        />
      )}
      <HighlightTheme theme={theme} draft={draft} shown={shown} setDraft={setDraft} />
    </View>
  );
}

/** Highlight theme for code the plugin draws, as a grid of cards with five of its colors; ones for the other appearance are dimmed. */
function HighlightTheme({ theme, draft, shown, setDraft }: { theme: PluginTheme; draft: ThemeDraft; shown: ThemeDraft; setDraft(d: ThemeDraft): void }) {
  const s = useStyles(theme);
  const c = theme.colors;
  const options = [...SYNTAX_THEMES, { id: PLAIN_SYNTAX, name: "Plain", appearance: shown.appearance, colors: undefined }];
  return (
    <View style={{ gap: 10 }}>
      <SectionHead theme={theme} title="Highlight theme" hint="commands, diffs, JSON" />
      <Grid n={4}>
        {options.map((t) => {
          const on = t.id === draft.syntax;
          const dots = t.colors ? [t.colors.keyword, t.colors.string, t.colors.number, t.colors.function, t.colors.punctuation] : Array(5).fill(c.foregroundMuted);
          return (
            <Pressable
              key={t.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => setDraft({ ...draft, syntax: t.id })}
              style={{ flex: 1, gap: 8, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 8, backgroundColor: on ? c.surface1 : undefined, borderWidth: on ? 1.5 : StyleSheet.hairlineWidth, borderColor: on ? c.accent : c.border, opacity: t.appearance === shown.appearance ? 1 : 0.45 }}
            >
              <View style={{ flexDirection: "row", gap: 4 }}>
                {dots.map((d, i) => (
                  <View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: d, opacity: t.colors ? 1 : 0.4 }} />
                ))}
              </View>
              <Text style={[s.small, { fontSize: 12, color: on ? c.foreground : c.foregroundMuted }]} numberOfLines={1}>
                {t.name.replace("One Dark Darker ", "")}
              </Text>
            </Pressable>
          );
        })}
      </Grid>
    </View>
  );
}


const HIDEABLE_LABELS: Record<Hideable, string> = { read: "Reads", search: "Searches", fetch: "Fetches", task: "Tasks", todo: "Todo lists" };
const ICON_LABELS: Record<IconKind, string> = { steps: "Merged", tool: "Tools", thought: "Thoughts" };

/** Titles and tile labels for each rich text variant, from the "Rich Text — Style Variants" design. */
const RICH_TEXT_OPTIONS: Record<RichText, { title: string; options: string[] }> = {
  quote: { title: "Blockquote", options: ["Accent bar", "Tinted card", "Italic indent"] },
  table: { title: "Table", options: ["Bordered", "Striped", "Minimal", "Grid"] },
  code: { title: "Code block", options: ["Header bar", "Bare", "Gutter"] },
  inline: { title: "Inline code", options: ["Filled chip", "Tinted text", "Outlined"] },
  heading: { title: "Headings", options: ["Size scale", "Compact + rule", "Accent marker"] },
  list: { title: "Lists", options: ["Bullets + squares", "Dashes + circles", "Timeline rows"] },
  callout: { title: "Callouts", options: ["Tinted card", "Side bar", "Inline row"] },
  rule: { title: "Horizontal rule", options: ["Hairline", "Spaced dots", "Short inset"] },
};


const LOADER_LABELS: Record<Loader, string> = { dots: "Dots", sparkle: "Sparkle", spokes: "Spokes", dotring: "Dot ring", orb: "Orb", matrix: "Matrix", snake: "Snake" };

/** One loader running for real: the timeline's overlay (css in web.ts) scoped to this tile instead of the whole page. */
function LoaderTile({ theme, id, on, onPress }: { theme: PluginTheme; id: Loader; on: boolean; onPress(): void }) {
  const s = useStyles(theme);
  const reducedMotion = useReducedMotion();
  const c = theme.colors;
  const vars = { "--cp-fg": c.foreground, "--cp-accent": c.accent, "--cp-mono": "ui-monospace, Menlo, monospace" } as CSSProperties;
  const dot = 10 / 3;
  const box: CSSProperties = { position: "relative", width: 14, height: 14, transform: "scale(1.7)", ...vars };
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={LOADER_LABELS[id]}
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, alignItems: "center", gap: 10, paddingTop: 16, paddingBottom: 9, borderRadius: 8, backgroundColor: c.surface0, borderWidth: on ? 1.5 : StyleSheet.hairlineWidth, borderColor: on ? c.accent : c.border, opacity: reducedMotion && pressed ? 0.8 : 1, transform: pressed && !reducedMotion ? [{ scale: 0.97 }] : undefined })}
    >
      {id === "dots" ? (
        <div data-cp-dots="" style={{ ...box, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "relative", width: dot * 2 + 2, height: 14 }}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} style={{ position: "absolute", left: (i % 2) * (dot + 2), top: Math.floor(i / 2) * (dot + 2), width: dot, height: dot, borderRadius: "50%", background: c.foreground, opacity: 0.6 }} />
            ))}
          </div>
        </div>
      ) : (
        <div style={box}>
          <div data-cp-loader="" data-cp-tile={id}>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <i key={i} />
            ))}
          </div>
        </div>
      )}
      <Text style={[s.small, { fontSize: 12, color: on ? c.foreground : c.foregroundMuted }]}>{LOADER_LABELS[id]}</Text>
    </Pressable>
  );
}

type Colors = PluginTheme["colors"];
const bar = (w: DimensionValue, color: string, h = 3, key?: number) => <View key={key} style={{ width: w, height: h, borderRadius: 2, backgroundColor: color }} />;
const col = (...kids: ReactNode[]) => <View style={{ gap: 4 }}>{kids}</View>;
const line = (c: Colors, w: DimensionValue = 70) => <View style={{ width: w, height: 1, backgroundColor: c.border }} />;
const KEYWORD = "#c594c5";
const FUNCTION = "#5fb3b3";

/** A small drawing of each style variant, in the order of RICH_TEXT_OPTIONS. */
const RICH_DRAWINGS: Record<RichText, Array<(c: Colors) => ReactNode>> = {
  quote: [
    (c) => (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 2, height: 24, backgroundColor: c.accent }} />
        {col(bar(56, c.foregroundMuted), bar(38, c.foregroundMuted))}
      </View>
    ),
    (c) => (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, padding: 8, borderRadius: 5, backgroundColor: c.surface2 }}>
        <Icon name="Quote" size={9} color={c.foregroundMuted} />
        {col(bar(40, c.foregroundMuted), bar(28, c.foregroundMuted))}
      </View>
    ),
    (c) => <View style={{ paddingLeft: 14 }}>{col(bar(56, c.foregroundMuted), bar(38, c.foregroundMuted))}</View>,
  ],
  table: [
    (c) => (
      <View style={{ alignSelf: "stretch", borderRadius: 4, borderWidth: 1, borderColor: c.border, overflow: "hidden" }}>
        <View style={{ height: 9, backgroundColor: c.surface2, borderBottomWidth: 1, borderBottomColor: c.border }} />
        <View style={{ height: 9, borderBottomWidth: 1, borderBottomColor: c.border }} />
        <View style={{ height: 9 }} />
      </View>
    ),
    (c) => (
      <View style={{ alignSelf: "stretch", gap: 2 }}>
        {[c.surface2, undefined, c.surface2].map((bg, i) => (
          <View key={i} style={{ height: 8, borderRadius: 2, backgroundColor: bg }} />
        ))}
      </View>
    ),
    (c) => line(c, 66),
    (c) => (
      <View style={{ alignSelf: "stretch", height: 28, borderRadius: 4, borderWidth: 1, borderColor: c.border, flexDirection: "row" }}>
        <View style={{ flex: 1, borderRightWidth: 1, borderRightColor: c.border }} />
        <View style={{ flex: 1, borderRightWidth: 1, borderRightColor: c.border }} />
        <View style={{ flex: 1 }} />
      </View>
    ),
  ],
  code: [
    (c) => (
      <View style={{ width: 76, borderRadius: 4, borderWidth: 1, borderColor: c.border, overflow: "hidden" }}>
        <View style={{ height: 7, backgroundColor: c.surface2 }} />
        <View style={{ padding: 6, gap: 3 }}>
          {bar(40, KEYWORD)}
          {bar(28, FUNCTION)}
        </View>
      </View>
    ),
    (c) => (
      <View style={{ width: 76, padding: 7, gap: 3, borderRadius: 4, backgroundColor: sunken(c.surface0) }}>
        {bar(44, KEYWORD)}
        {bar(30, FUNCTION)}
      </View>
    ),
    (c) => (
      <View style={{ width: 76, flexDirection: "row", gap: 6, padding: 7, borderRadius: 4, borderWidth: 1, borderColor: c.border }}>
        {col(bar(3, c.foregroundMuted), bar(3, c.foregroundMuted))}
        {col(bar(40, KEYWORD), bar(28, FUNCTION))}
      </View>
    ),
  ],
  inline: [
    (c) => (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {bar(12, c.foregroundMuted)}
        <View style={{ padding: 3, borderRadius: 3, backgroundColor: c.surface2 }}>{bar(14, c.foregroundMuted)}</View>
        {bar(10, c.foregroundMuted)}
      </View>
    ),
    (c) => (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {bar(12, c.foregroundMuted)}
        {bar(18, c.statusWarning)}
        {bar(10, c.foregroundMuted)}
      </View>
    ),
    (c) => (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {bar(12, c.foregroundMuted)}
        <View style={{ padding: 3, borderRadius: 3, borderWidth: 1, borderColor: c.border }}>{bar(14, c.foreground)}</View>
        {bar(10, c.foregroundMuted)}
      </View>
    ),
  ],
  heading: [
    (c) => col(bar(46, c.foreground, 6), bar(30, c.foregroundMuted, 4)),
    (c) => (
      <View style={{ gap: 4 }}>
        {bar(34, c.foreground, 5)}
        {bar(24, c.foregroundMuted, 3)}
        {line(c, 62)}
      </View>
    ),
    (c) => (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View style={{ width: 2, height: 14, backgroundColor: c.accent }} />
        {bar(40, c.foreground, 6)}
      </View>
    ),
  ],
  list: [
    (c) => (
      <View style={{ gap: 4 }}>
        {[c.foregroundMuted, c.foregroundMuted, c.statusSuccess].map((m, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View style={{ width: 4, height: 4, borderRadius: i === 2 ? 1 : 2, backgroundColor: m }} />
            {bar(i === 1 ? 26 : 38, c.foregroundMuted)}
          </View>
        ))}
      </View>
    ),
    (c) => (
      <View style={{ gap: 4 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            {i === 2 ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.statusSuccess }} /> : bar(5, c.foregroundMuted, 1)}
            {bar(i === 1 ? 26 : 38, c.foregroundMuted)}
          </View>
        ))}
      </View>
    ),
    (c) => (
      <View style={{ gap: 3 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: c.foregroundMuted }} />
            {bar(i === 1 ? 30 : 42, c.foregroundMuted, i === 2 ? 2 : 3)}
          </View>
        ))}
      </View>
    ),
  ],
  callout: [
    (c) => (
      <View style={{ width: 76, flexDirection: "row", alignItems: "center", gap: 6, padding: 7, borderRadius: 5, backgroundColor: alpha(c.accent, 0.14), borderWidth: 1, borderColor: alpha(c.accent, 0.35) }}>
        <Icon name="Info" size={9} color={c.accent} />
        {col(bar(28, c.foregroundMuted), bar(20, c.foregroundMuted))}
      </View>
    ),
    (c) => (
      <View style={{ flexDirection: "row", gap: 6 }}>
        <View style={{ width: 2, height: 18, backgroundColor: c.accent }} />
        {col(bar(22, c.accent), bar(44, c.foregroundMuted))}
      </View>
    ),
    (c) => (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        <Icon name="Info" size={9} color={c.accent} />
        {bar(12, c.accent)}
        {bar(34, c.foregroundMuted)}
      </View>
    ),
  ],
  rule: [
    (c) => line(c),
    (c) => (
      <View style={{ flexDirection: "row", gap: 6 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: c.foregroundMuted }} />
        ))}
      </View>
    ),
    (c) => <View style={{ width: 70 }}>{line(c, 24)}</View>,
  ],
};

/** Settings for one page: grouped cards (Messages, Steps) or a tile picker per markdown element (Rich text). */
function PrefsEditor({ theme, page, prefs, onChange }: { theme: PluginTheme; page: Exclude<Page, "theme">; prefs: Prefs; onChange(p: Prefs): void }) {
  const set = <K extends keyof Prefs>(key: K) => (value: Prefs[K]) => onChange({ ...prefs, [key]: value });
  const s = useStyles(theme);
  const c = theme.colors;
  if (page === "messages") {
    const paseoSyntax = readSyntaxTheme();
    return (
      <View style={{ gap: 24 }}>
        <Group theme={theme} title="Spacing">
          <Row theme={theme} first label="Density" hint="Space between replies, prompts and step rows.">
            <Segmented
              theme={theme}
              value={prefs.density}
              onChange={set("density")}
              options={[
                ["compact", "", "Compact"],
                ["normal", "", "Normal"],
                ["spacious", "", "Spacious"],
              ]}
            />
          </Row>
        </Group>
        <Group theme={theme} title="Icons">
          <Row theme={theme} first stacked label="Icon set" hint="Paseo’s icons too; any without a twin stay Lucide. Desktop and web.">
            <Segmented
              theme={theme}
              value={prefs.iconSet}
              onChange={set("iconSet")}
              options={[
                ["lucide", "", "Lucide", true],
                ["untitled", "", "Untitled UI"],
                ["hugeicons", "", "Hugeicons"],
              ]}
            />
          </Row>
        </Group>
        <Group theme={theme} title="Replies">
          <Row theme={theme} first label="Copy popup" hint="Selecting text offers Copy text or Markdown.">
            <Switch theme={theme} label="Copy popup" value={prefs.selectionCopy === "on"} onChange={(on) => set("selectionCopy")(on ? "on" : "off")} />
          </Row>
        </Group>
        <Group theme={theme} title="Your messages">
          <Row theme={theme} first label="Long messages" hint="Over 8 lines; clamp shows six.">
            <Segmented
              theme={theme}
              value={prefs.userMessages}
              onChange={set("userMessages")}
              options={[
                ["clamp", "", "Clamp"],
                ["full", "", "Full", true],
              ]}
            />
          </Row>
        </Group>
        <Group theme={theme} title="Images">
          <Row theme={theme} first label="Image-only replies" hint="Thumbnails open full size.">
            <Segmented
              theme={theme}
              value={prefs.images}
              onChange={set("images")}
              options={[
                ["small", "", "Small"],
                ["large", "", "Large"],
                ["native", "", "Inline", true],
              ]}
            />
          </Row>
        </Group>
        {canSetAppTheme ? (
          <Group theme={theme} title="Working indicator">
            <Row theme={theme} first stacked label="Loader" hint="Shown in the turn footer while the agent works.">
              {prefs.nativeStyle === "paseo" ? (
                <Notice theme={theme}>Loaders are drawn by the restyle. Turn on Restyle Paseo's items to pick one.</Notice>
              ) : (
                <View style={{ width: "100%" }}>
                  <Grid n={4}>
                    {LOADERS.map((id) => (
                      <LoaderTile key={id} theme={theme} id={id} on={prefs.loader === id} onPress={() => set("loader")(id)} />
                    ))}
                  </Grid>
                </View>
              )}
            </Row>
            <Row theme={theme} label="Size" hint="Paseo draws it at 14.">
              <Segmented
                theme={theme}
                value={prefs.loaderSize}
                onChange={set("loaderSize")}
                options={[
                  ["s", "", "14", true],
                  ["m", "", "16"],
                  ["l", "", "18"],
                ]}
              />
            </Row>
          </Group>
        ) : null}
        {paseoSyntax ? (
          <Notice theme={theme} action={paseoSyntax === "one" ? null : <Button theme={theme} label="Use One" icon="Code" onPress={() => updateAppSettings({ syntaxTheme: "one" })} />}>
            {paseoSyntax === "one"
              ? "Text and code follow Settings → Appearance. Code uses Paseo's One syntax theme."
              : `Text and code follow Settings → Appearance. Code uses Paseo's ${paseoSyntax} syntax theme; One is the closest match to Mariana.`}
          </Notice>
        ) : (
          <Notice theme={theme}>Text, tables, code blocks and mermaid diagrams render natively.</Notice>
        )}
        <Legend theme={theme} />
      </View>
    );
  }
  if (page === "steps") {
    const paseo = readHostAppearance().autoExpandReasoning;
    return (
      <View style={{ gap: 24 }}>
        <Group theme={theme} title="Layout">
          <Row theme={theme} first label="Merge into one row" hint="One row like “Thought 2 times, ran 3 commands”.">
            <Switch theme={theme} label="Merge into one row" value={prefs.merge === "on"} onChange={(on) => set("merge")(on ? "on" : "off")} />
          </Row>
          <Row theme={theme} label="Strength" hint="How faded rows sit until you hover them.">
            <Segmented
              theme={theme}
              value={prefs.steps}
              onChange={set("steps")}
              options={[
                ["dim", "", "30%"],
                ["faded", "", "45%"],
                ["soft", "", "65%"],
                ["full", "", "Full", true],
              ]}
            />
          </Row>
          <Row theme={theme} stacked label="Row icons" hint="Without an icon a row starts with its verb.">
            {ICON_KINDS.map((k) => {
              const shown = prefs.rowIcons[k] === "show";
              return <Chip key={k} theme={theme} on={shown} label={ICON_LABELS[k]} onPress={() => onChange({ ...prefs, rowIcons: { ...prefs.rowIcons, [k]: shown ? "hide" : "show" } })} />;
            })}
          </Row>
        </Group>
        <Group theme={theme} title="Reasoning">
          <Row theme={theme} first stacked label="Starts as" hint={`Paseo: Always expand reasoning (${paseo ? "on" : "off"}).`}>
            <Segmented
              theme={theme}
              value={prefs.reasoning}
              onChange={set("reasoning")}
              options={[
                ["paseo", "", "Paseo", true],
                ["collapsed", "", "Collapsed"],
                ["expanded", "", "Expanded"],
              ]}
            />
          </Row>
        </Group>
        <Group
          theme={theme}
          title="Tool calls"
          top={
            readHostAppearance().toolCallDetail === "overview" ? (
              <Notice theme={theme}>Paseo's tool call display is Summary, so calls stay grouped ("Ran 4 commands"). Switch it to Detailed in Settings → Appearance to get these rows.</Notice>
            ) : null
          }
        >
          <Row theme={theme} first label="Open details" hint="Which rows start open.">
            <Segmented
              theme={theme}
              value={prefs.toolDetails}
              onChange={set("toolDetails")}
              options={[
                ["collapsed", "", "None", true],
                ["failed", "", "Failures"],
                ["expanded", "", "All"],
              ]}
            />
          </Row>
          <Row theme={theme} label="Command colors" hint="Colors from the Theme page.">
            <Segmented
              theme={theme}
              value={prefs.commandColors}
              onChange={set("commandColors")}
              options={[
                ["expanded", "", "When open", true],
                ["always", "", "Always"],
              ]}
            />
          </Row>
          <Row theme={theme} label="Wrap diff lines" hint="Off keeps long lines on one row.">
            <Switch theme={theme} label="Wrap diff lines" value={prefs.diffWrap === "on"} onChange={(on) => set("diffWrap")(on ? "on" : "off")} />
          </Row>
          <Row theme={theme} stacked label="Show in timeline" hint="Running and failed calls always show.">
            {HIDEABLE.map((k) => {
              const shown = !prefs.hidden.includes(k);
              return <Chip key={k} theme={theme} on={shown} label={HIDEABLE_LABELS[k]} onPress={() => onChange({ ...prefs, hidden: shown ? [...prefs.hidden, k] : prefs.hidden.filter((h) => h !== k) })} />;
            })}
          </Row>
        </Group>
        <Legend theme={theme} />
      </View>
    );
  }
  return (
    <View style={{ gap: 20 }}>
      {prefs.nativeStyle === "paseo" ? <Notice theme={theme}>Restyle Paseo's items is off, so these styles don't apply until you switch it back on.</Notice> : null}
      {RICH_TEXT.map((k) => (
        <View key={k} style={{ gap: 8 }}>
          <Text style={[s.verb, { fontSize: 13 }]}>{RICH_TEXT_OPTIONS[k].title}</Text>
          <Grid n={k === "table" ? 4 : 3}>
            {RICH_TEXT_OPTIONS[k].options.map((label, j) => {
              const id = (["a", "b", "c", "d"] as const)[j]!;
              const on = prefs.richText[k] === id;
              return (
                <Pressable key={id} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: on }} onPress={() => onChange({ ...prefs, richText: { ...prefs.richText, [k]: id } })} style={{ flex: 1, gap: 6 }}>
                  <View style={{ height: 52, paddingHorizontal: 10, justifyContent: "center", alignItems: "flex-start", borderRadius: 8, backgroundColor: c.surface0, borderWidth: on ? 1.5 : StyleSheet.hairlineWidth, borderColor: on ? c.accent : c.border }}>{RICH_DRAWINGS[k][j]!(c)}</View>
                  <Text style={[s.small, { fontSize: 12, color: on ? c.foreground : c.foregroundMuted, fontWeight: on ? "500" : "400" }]} numberOfLines={1}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </Grid>
        </View>
      ))}
      <Group theme={theme} title="Diagrams">
        <Row theme={theme} first label="Renderer" hint="Pele draws the same mermaid source in its own layout and the theme's colors.">
          <Segmented
            theme={theme}
            value={prefs.diagrams}
            onChange={set("diagrams")}
            options={[
              ["pele", "", "Pele"],
              ["mermaid", "", "Mermaid", true],
            ]}
          />
        </Row>
      </Group>
      <Legend theme={theme} />
    </View>
  );
}

const LONG_MESSAGE = [
  "Move auth into one middleware and keep the tests green.",
  "Right now the token check runs twice on /api/billing: once in the router guard and once inside the handler.",
  "The second check reads a stale header after the refresh middleware rotated it, so users get logged out at random.",
  "Delete the per-route calls, mount requireAuth before the router, and let public routes opt out with skipAuth.",
  "Don't touch the session store; that migration lands next week.",
].join(" ");

/** The user bubble as Paseo draws it; the clamp is shortened to three lines to fit the mock. */
function PreviewBubble({ theme, clamp }: { theme: PluginTheme; clamp: boolean }) {
  const s = useStyles(theme);
  const c = theme.colors;
  const [open, setOpen] = useState(false);
  const clamped = clamp && !open;
  return (
    <View style={{ alignItems: "flex-end", paddingBottom: 8 }}>
      <Pressable
        {...SQUIRCLE_CARD}
        disabled={!clamp}
        onPress={() => setOpen(!open)}
        accessibilityRole={clamp ? "button" : undefined}
        accessibilityState={clamp ? { expanded: open } : undefined}
        style={{ maxWidth: "80%", paddingHorizontal: 14, paddingVertical: 10, gap: 6, borderRadius: 16, backgroundColor: c.border }}
      >
        <Text style={[s.prose, { color: c.foreground }]} numberOfLines={clamped ? 3 : undefined}>
          {LONG_MESSAGE}
        </Text>
        {clamp ? <Text style={[s.small, { fontSize: 12 }]}>{open ? "Show less" : "Show full message"}</Text> : null}
      </Pressable>
    </View>
  );
}

/** The turn footer while the agent works, with a box the restyle draws the chosen loader in (Paseo's 2 × 3 grid at size 14 underneath). */
function PreviewWorking({ theme }: { theme: PluginTheme }) {
  const s = useStyles(theme);
  const c = theme.colors;
  const dot = 10 / 3;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      <View {...({ dataSet: { cpPart: "loader" } } as object)} style={{ width: 14, height: 14, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: dot * 2 + 2, height: 14 }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={{ position: "absolute", left: (i % 2) * (dot + 2), top: Math.floor(i / 2) * (dot + 2), width: dot, height: dot, borderRadius: dot / 2, backgroundColor: c.foreground, opacity: 0.6 }} />
          ))}
        </View>
      </View>
      <Icon name="Split" size={14} color={c.foregroundMuted} />
      <Text style={[s.small, { fontSize: 12 }]}>12s</Text>
    </View>
  );
}

type Viewport = "desktop" | "phone";

type PreviewMode = "chat" | "code";

function PreviewHead({ theme, layout, viewport, setViewport, hint = "Updates as you change settings", mode }: { theme: PluginTheme; layout: PluginScreenProps["layout"]; viewport: Viewport; setViewport(v: Viewport): void; hint?: string; mode?: { value: PreviewMode; set(m: PreviewMode): void } }) {
  const s = useStyles(theme);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Text style={[s.title, { fontSize: 13 }]}>Preview</Text>
      <Badge theme={theme} label="Live" tone={theme.colors.statusSuccess} />
      <Text style={[s.small, { flex: 1, fontSize: 12 }]} numberOfLines={1}>
        {hint}
      </Text>
      {mode ? (
        <Segmented<PreviewMode>
          theme={theme}
          value={mode.value}
          onChange={mode.set}
          options={[
            ["chat", "MessageSquare", "Chat"],
            ["code", "Code", "Code"],
          ]}
        />
      ) : null}
      {layout.compact ? null : (
        <Segmented<Viewport>
          theme={theme}
          value={viewport}
          onChange={setViewport}
          options={[
            ["desktop", "Monitor", "Desktop"],
            ["phone", "Smartphone", "Phone"],
          ]}
        />
      )}
    </View>
  );
}

/** A chat as Paseo shows it: title bar, the timeline, and the composer. `theme` is the previewed theme. */
function MockChat({ theme, layout, viewport, children }: { theme: PluginTheme; layout: PluginScreenProps["layout"]; viewport: Viewport; children: ReactNode }) {
  const s = useStyles(theme);
  const c = theme.colors;
  const chip = (icon: string, label?: string) => (
    <View key={icon} style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: label ? 6 : 0, height: 26 }}>
      <Icon name={icon} size={14} color={c.foregroundMuted} />
      {label ? <Text style={[s.small, { fontSize: 13, color: c.foregroundMuted }]}>{label}</Text> : null}
      {label ? <Icon name="ChevronDown" size={12} color={c.foregroundMuted} /> : null}
    </View>
  );
  const narrow = layout.compact || viewport === "phone";
  return (
    <View {...SQUIRCLE_CARD} style={{ width: viewport === "phone" ? 390 : "100%", alignSelf: "center", borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, backgroundColor: c.surface0, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: alpha(c.border, 0.6) }}>
        <Text style={[s.target, { color: c.foreground, fontSize: 13, fontWeight: "500" }]}>Refactor auth middleware</Text>
        <Text style={[s.target, { fontSize: 12 }]} numberOfLines={1}>
          paseo-api
        </Text>
      </View>
      <View style={{ paddingHorizontal: narrow ? 16 : 40, paddingVertical: 24, gap: 16 }}>{children}</View>
      <View {...SQUIRCLE_CARD} style={{ margin: 20, marginTop: 4, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, backgroundColor: c.surface1 }}>
        <Text style={[s.prose, { fontSize: 14 }]} numberOfLines={1}>
          Message the agent, tag @files, or use /commands
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {chip("Plus")}
          {chip("Bot", "Opus 5.5")}
          {narrow ? null : chip("Brain", "High")}
          {narrow ? null : chip("ShieldOff", "Bypass")}
          <View style={{ flex: 1 }} />
          <Icon name="Mic" size={15} color={c.foregroundMuted} />
          <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" }}>
            <Icon name="ArrowUp" size={15} color={c.accentForeground} />
          </View>
        </View>
      </View>
    </View>
  );
}

/** The code a chat shows, drawn by the same rows as the Chat view: an open merged row of sample calls, then a reply with a code block. */
function CodeView({ theme, layout, viewport, props }: { theme: PluginTheme; layout: PluginScreenProps["layout"]; viewport: Viewport; props: ComponentProps<typeof MergedSteps> }) {
  const s = useStyles(theme);
  const c = theme.colors;
  return (
    <View {...SQUIRCLE_CARD} style={{ width: viewport === "phone" ? 390 : "100%", alignSelf: "center", gap: 16, padding: layout.compact || viewport === "phone" ? 12 : 20, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, backgroundColor: c.surface0 }}>
      <MergedSteps {...props} defaultOpen />
      <Text style={[s.prose, { color: c.foreground }]}>I wrote auth.ts and changed its 401 to 403. The final file:</Text>
      <View style={s.block}>
        <View style={[s.blockHead, { alignItems: "center", justifyContent: "space-between" }]}>
          <Text {...PMONO} style={[s.code, { color: c.foregroundMuted }]}>ts</Text>
          <Icon name="Copy" size={13} color={c.foregroundMuted} />
        </View>
        <View style={s.blockBody}>
          {CODE_REPLY.map((l, i) => (
            <CodeLine key={i} text={l} theme={theme} style={s.code} />
          ))}
        </View>
      </View>
    </View>
  );
}

/** The Chat view (or Code view, on the Theme page) of a sample conversation. `theming` previews unapplied fonts. */
function Preview({ theme, draft, prefs, layout, theming }: { theme: PluginTheme; draft: ThemeDraft; prefs: Prefs; layout: PluginScreenProps["layout"]; theming?: Typography }) {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [mode, setMode] = useState<PreviewMode>("chat");
  const pt = previewTheme(draft, theme);
  const ps = useStyles(pt);
  const pc = pt.colors;
  const host = { id: "preview", label: "Preview" };
  const props = { agentId: "preview", timestamp: new Date(0), theme: pt, host, layout };
  const item = <T,>(data: T) => ({ type: "plugin" as const, kind: "preview", version: 1, data });
  // Rows read their open state once; remount them when a pref that sets it changes.
  const remount = `${prefs.reasoning}-${prefs.toolDetails}`;
  const calls = PREVIEW_CALLS.filter((t) => !prefs.hidden.includes(hideableKind(t)!));
  const todos = prefs.hidden.includes("todo") ? [] : [PREVIEW_TODO];
  const tools = calls.map(toolData);
  const thought = "Handlers in routes/ each call verifyToken(); one middleware removes the duplicates.";
  const { uiFont, monoFont, contentSize, codeSize } = theming ?? {};
  const fonts = useMemo(() => (theming ? { uiFont: uiFont || undefined, monoFont: monoFont || undefined, contentSize, codeSize } : undefined), [!!theming, uiFont, monoFont, contentSize, codeSize]);

  return (
    <PrefsOverride.Provider value={prefs}>
      <SyntaxOverride.Provider value={draft.syntax}>
        <View style={{ gap: 14 }}>
          <PreviewHead theme={theme} layout={layout} viewport={viewport} setViewport={setViewport} hint={theming ? "Updates as you edit colors and fonts" : undefined} mode={theming ? { value: mode, set: setMode } : undefined} />
          <AppearanceOverride.Provider value={fonts}>
            {/* Paseo sets its UI font from this variable on #root; set here, only the preview picks the font up. */}
            <View style={theming ? ({ "--paseo-ui-font": theming.uiFont || PASEO_FONT_STACKS.ui } as object) : null}>
              {mode === "code" ? (
                <PrefsOverride.Provider value={{ ...prefs, toolDetails: "expanded" }}>
                  <CodeView theme={pt} layout={layout} viewport={viewport} props={{ ...props, item: item(null), steps: CODE_CALLS.map((item) => ({ item, phase: "complete" as const })), ms: 9000, growing: false }} />
                </PrefsOverride.Provider>
              ) : (
                <MockChat theme={pt} layout={layout} viewport={viewport}>
                  <PreviewBubble theme={pt} clamp={prefs.userMessages === "clamp"} />
                  {prefs.merge === "on" ? (
                    <MergedSteps
                      key={`steps-${remount}`}
                      {...props}
                      item={item(null)}
                      steps={[{ type: "reasoning" as const, text: thought }, ...calls, ...todos].map((item) => ({ item, phase: "complete" as const }))}
                      ms={41000}
                      growing={false}
                    />
                  ) : (
                    <>
                      <ThoughtItem key={`thought-${remount}`} {...props} item={item({ text: thought, phase: "complete" as const })} />
                      {tools.map((d) => (
                        <ToolItem key={`${d.verb}-${d.target}-${remount}`} {...props} item={item(d)} />
                      ))}
                      {todos.map((t) => (
                        <TodoItem key="todo" {...props} item={item(todoData(t))} />
                      ))}
                    </>
                  )}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 5, paddingTop: 8 }}>
                    <Text style={[ps.prose, { color: pc.foreground }]}>Done. Auth now lives in</Text>
                    <InlineCode theme={pt} variant={prefs.richText.inline}>
                      requireAuth
                    </InlineCode>
                    <Text style={[ps.prose, { color: pc.foreground }]}>and all 24 tests pass.</Text>
                  </View>
                  <PreviewWorking theme={pt} />
                  {prefs.images === "native" ? (
                    <Image source={{ uri: PREVIEW_IMAGE }} style={{ width: "100%", aspectRatio: 16 / 10, borderRadius: 8 }} resizeMode="cover" />
                  ) : (
                    <ImagesItem {...props} item={item({ images: [{ alt: "Login screen", url: PREVIEW_IMAGE }, { alt: "Settings screen", url: PREVIEW_IMAGE }] })} />
                  )}
                </MockChat>
              )}
            </View>
          </AppearanceOverride.Provider>
        </View>
      </SyntaxOverride.Provider>
    </PrefsOverride.Provider>
  );
}

type Variant = "a" | "b" | "c";

function InlineCode({ theme, variant, children }: { theme: PluginTheme; variant: Variant; children: string }) {
  const s = useStyles(theme);
  const c = theme.colors;
  const box = { a: { backgroundColor: c.surface2 }, b: {}, c: { borderWidth: 1, borderColor: alpha(c.border, 0.6) } }[variant];
  return (
    <View style={[{ paddingHorizontal: variant === "b" ? 0 : 5, paddingVertical: 1, borderRadius: 4 }, box]}>
      <Text {...PMONO} style={[s.code, { color: variant === "b" ? c.statusWarning : c.foreground }]}>{children}</Text>
    </View>
  );
}

const SAMPLE_TABLE = [
  ["src/middleware/requireAuth.ts", "new file", "28", "0"],
  ["src/routes/billing.ts", "check removed", "2", "5"],
  ["src/server.ts", "mount", "1", "0"],
];
const SAMPLE_CODE = ["export function requireAuth(req, next) {", "  const token = verifyToken(req);", "  if (!token) return deny(401);", "  next();", "}"];

/** A reply using every markdown element, drawn with the chosen variants, as the Rich text page's preview. */
const SAMPLE_DIAGRAM = `flowchart LR
  req[Request] --> auth{requireAuth}
  auth -- valid --> router[Router]
  auth -- skipAuth --> router
  auth -- expired --> refresh[Refresh token]
  refresh --> auth`;

/** The sample reply's diagram, drawn the way chats draw it (desktop and web, with the restyle on). */
function DiagramSample({ theme, pele }: { theme: PluginTheme; pele: boolean }) {
  const s = useStyles(theme);
  const c = theme.colors;
  const [frame, setFrame] = useState<unknown>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [failed, setFailed] = useState(false);
  // Paseo's mermaid: undefined while it loads, null if it can't be found.
  const [mermaid, setMermaid] = useState<string | null | undefined>(() => diagramDoc(false));
  useEffect(() => {
    if (pele || mermaid !== undefined) return;
    let live = true;
    void loadMermaidDoc().then((doc) => live && setMermaid(doc ?? null));
    return () => {
      live = false;
    };
  }, [pele, mermaid]);
  const doc = pele ? diagramDoc(true) : (mermaid ?? undefined);
  // The drawing takes the applied app theme's colors (not an unapplied draft), so a theme change draws it again.
  const key = `${pele}:${Object.values(c).join()}`;
  useEffect(() => {
    setSize(null);
    setFailed(false);
  }, [key]);
  // A failed drawing unmounts the frame, which leaves it failed rather than drawing again.
  useEffect(() => (frame ? drawDiagram(frame, SAMPLE_DIAGRAM, (drawn) => (drawn ? setSize(drawn) : setFailed(true))) : undefined), [frame]);
  const note = failed ? "Couldn't draw the diagram." : doc ? null : mermaid === null ? "Couldn't find Paseo's mermaid in this version of Paseo." : "Loading Paseo's mermaid…";
  return (
    <View style={{ padding: 12, borderRadius: 8, backgroundColor: sunken(c.surface0), borderWidth: 1, borderColor: alpha(c.border, 0.6), alignItems: "center" }}>
      {note ? (
        <Text style={[s.small, { fontSize: 12, paddingVertical: 24 }]}>{note}</Text>
      ) : (
        <iframe
          key={key}
          ref={setFrame}
          title="Diagram preview"
          sandbox="allow-scripts"
          srcDoc={doc}
          style={{ display: "block", border: 0, width: "100%", pointerEvents: "none", background: "transparent", ...(size ? { maxWidth: size.width, aspectRatio: `${size.width} / ${size.height}` } : { height: 120, opacity: 0 }) }}
        />
      )}
    </View>
  );
}

function RichSample({ theme, rt, pele }: { theme: PluginTheme; rt: Prefs["richText"]; pele?: boolean }) {
  const s = useStyles(theme);
  const c = theme.colors;
  const rule = alpha(c.border, 0.6);
  const prose = [s.prose, { color: c.foreground }];
  const muted = [s.prose, { color: c.foregroundMuted }];

  const heading = (level: 1 | 2 | 3, text: string) => {
    if (rt.heading === "b") {
      const size = [18, 15, 12][level - 1]!;
      return <Text style={[s.title, { fontSize: size, color: level === 3 ? c.foregroundMuted : c.foreground, ...(level === 3 ? { textTransform: "uppercase", letterSpacing: 0.7 } : {}), ...(level === 1 ? { paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: rule } : {}) }]}>{text}</Text>;
    }
    const title = <Text style={[s.title, { fontSize: [24, 20, 16][level - 1]! }]}>{text}</Text>;
    if (rt.heading === "a") return title;
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {level < 3 ? <View style={{ width: 3, alignSelf: "stretch", borderRadius: 2, backgroundColor: c.accent }} /> : <Text {...PMONO} style={[s.code, { color: c.foregroundMuted }]}>###</Text>}
        {title}
      </View>
    );
  };

  const quote = (() => {
    const text = "Never read the token before refresh() runs — it may already be rotated.";
    if (rt.quote === "b")
      return (
        <View style={{ flexDirection: "row", gap: 10, padding: 12, borderRadius: 8, backgroundColor: c.surface1 }}>
          <Text style={[s.title, { fontSize: 20, lineHeight: 22, color: c.accent }]}>“</Text>
          <Text style={[prose, { flex: 1 }]}>{text}</Text>
        </View>
      );
    return (
      <View style={rt.quote === "a" ? { borderLeftWidth: 2, borderLeftColor: c.accent, paddingLeft: 14 } : { paddingLeft: 20 }}>
        <Text style={[muted, { fontStyle: "italic" }]}>{text}</Text>
      </View>
    );
  })();

  const callout = (tone: string, icon: string, label: string, text: string) => {
    if (rt.callout === "b")
      return (
        <View key={label} style={{ borderLeftWidth: 2, borderLeftColor: tone, paddingLeft: 14, gap: 2 }}>
          <Text style={[s.small, { fontSize: 11, fontWeight: "600", letterSpacing: 0.7, color: tone }]}>{label.toUpperCase()}</Text>
          <Text style={prose}>{text}</Text>
        </View>
      );
    if (rt.callout === "c")
      return (
        <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name={icon} size={14} color={tone} />
          <Text style={[prose, { flex: 1 }]}>
            <Text style={{ color: tone, fontWeight: "600" }}>{label} — </Text>
            {text}
          </Text>
        </View>
      );
    return (
      <View key={label} style={{ flexDirection: "row", gap: 10, padding: 12, borderRadius: 8, backgroundColor: alpha(tone, 0.12) }}>
        <Icon name={icon} size={14} color={tone} />
        <View style={{ flex: 1, gap: 2, marginTop: -3 }}>
          <Text style={[s.title, { fontSize: 13, color: tone }]}>{label}</Text>
          <Text style={prose}>{text}</Text>
        </View>
      </View>
    );
  };

  const marker = (ordered: number | undefined) => {
    const text = rt.list === "c" ? "·" : ordered ? (rt.list === "b" ? `${ordered})` : `${ordered}.`) : rt.list === "b" ? "–" : "•";
    return <Text {...(ordered && rt.list !== "c" ? PMONO : null)} style={[ordered && rt.list !== "c" ? s.code : s.prose, { width: 20, color: c.foregroundMuted, fontWeight: rt.list === "c" ? "700" : "400" }]}>{text}</Text>;
  };
  const listItem = (text: string, ordered?: number, nested?: boolean) => (
    <View key={text} style={{ flexDirection: "row", alignItems: "baseline", paddingLeft: nested ? 22 : 0 }}>
      {marker(ordered)}
      <Text style={prose}>{text}</Text>
    </View>
  );
  const task = (text: string, done: boolean) => {
    const icon = rt.list === "b" ? (done ? "CircleCheck" : "Circle") : done ? "SquareCheck" : "Square";
    const tone = !done ? c.foregroundMuted : rt.list === "b" ? c.statusSuccess : rt.list === "c" ? c.foregroundMuted : c.accent;
    return (
      <View key={text} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: rt.list === "c" ? 26 : undefined }}>
        <Icon name={icon} size={15} color={tone} />
        <Text style={[prose, done && rt.list === "c" ? { color: c.foregroundMuted } : null]}>{text}</Text>
      </View>
    );
  };

  const divider =
    rt.rule === "b" ? (
      <Text style={[s.small, { textAlign: "center", letterSpacing: 3 }]}>• • •</Text>
    ) : (
      <View style={{ height: 1, width: rt.rule === "c" ? 48 : "100%", backgroundColor: rt.rule === "c" ? c.border : rule }} />
    );

  const widths = [3, 2, 0.6, 0.6];
  const bordered = rt.table === "a" || rt.table === "d";
  const grid = rt.table === "d";
  const cell = (text: string, i: number, head: boolean) => (
    <Text
      key={i}
      numberOfLines={1}
      {...(head ? null : PMONO)}
      style={[
        head ? s.small : s.code,
        { flex: widths[i], fontSize: head ? 11 : undefined, fontWeight: head ? "600" : undefined, color: head ? c.foregroundMuted : i === 3 && text !== "0" ? c.statusDanger : c.foreground },
        grid ? { paddingHorizontal: 12, paddingVertical: 8, borderRightWidth: i < 3 ? 1 : 0, borderRightColor: rule } : null,
      ]}
    >
      {head ? text.toUpperCase() : text}
    </Text>
  );
  // Grid cells carry their own padding so the column rules run the full row height.
  const rowPad = grid ? { gap: 0 } : { gap: 12, paddingHorizontal: rt.table === "c" ? 0 : 12, paddingVertical: 8 };
  const table = (
    <View style={bordered ? { borderRadius: 8, borderWidth: 1, borderColor: rule, overflow: "hidden" } : { gap: rt.table === "b" ? 2 : 0 }}>
      <View style={{ flexDirection: "row", ...rowPad, backgroundColor: bordered ? c.surface1 : undefined, borderBottomWidth: rt.table === "b" ? 0 : 1, borderBottomColor: rule }}>
        {["File", "Change", "+", "-"].map((t, i) => cell(t, i, true))}
      </View>
      {SAMPLE_TABLE.map((row, r) => (
        <View
          key={row[0]}
          style={{ flexDirection: "row", ...rowPad, borderRadius: rt.table === "b" ? 6 : 0, backgroundColor: rt.table === "b" && r % 2 === 0 ? c.surface1 : undefined, borderTopWidth: bordered && r ? 1 : 0, borderTopColor: rule }}
        >
          {row.map((t, i) => cell(t, i, false))}
        </View>
      ))}
    </View>
  );

  const codeBody = (
    <View style={{ flexDirection: "row", gap: 12, padding: 12 }}>
      {rt.code === "c" ? (
        <View>
          {SAMPLE_CODE.map((_, i) => (
            <Text {...PMONO} key={i} style={[s.code, { color: c.foregroundMuted, opacity: 0.6, textAlign: "right" }]}>
              {i + 1}
            </Text>
          ))}
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        {SAMPLE_CODE.map((line) => (
          <Text {...PMONO} key={line} style={s.code}>
            {line}
          </Text>
        ))}
      </View>
      {rt.code === "b" ? <Text {...PMONO} style={[s.code, { fontSize: 11, color: alpha(c.foregroundMuted, 0.6) }]}>ts</Text> : null}
      {rt.code === "a" ? null : <Icon name="Copy" size={13} color={rt.code === "b" ? alpha(c.foregroundMuted, 0.4) : c.foregroundMuted} />}
    </View>
  );
  const codeBlock = (
    <View style={{ borderRadius: 8, backgroundColor: rt.code === "c" ? undefined : sunken(c.surface0), borderWidth: rt.code === "b" ? 0 : 1, borderColor: rule }}>
      {rt.code === "a" ? (
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: rule }}>
          <Text {...PMONO} style={[s.code, { flex: 1, fontSize: 12, color: c.foregroundMuted }]}>typescript</Text>
          <Icon name="Copy" size={13} color={c.foregroundMuted} />
        </View>
      ) : null}
      {codeBody}
    </View>
  );

  return (
    <View style={{ gap: 14 }}>
      {heading(1, "Auth middleware")}
      {heading(2, "What changed")}
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 5 }}>
        <Text style={prose}>Auth now lives in</Text>
        <InlineCode theme={theme} variant={rt.inline}>
          requireAuth
        </InlineCode>
        <Text style={prose}>and runs once.</Text>
      </View>
      {quote}
      {callout(c.accent, "Info", "Note", "Public routes opt out with skipAuth.")}
      {callout(c.statusWarning, "TriangleAlert", "Warning", "Tokens rotate on refresh; never cache them.")}
      {heading(3, "Routes")}
      <View style={{ gap: 6 }}>
        {listItem("Add requireAuth before the router", 1)}
        {listItem("Reads the rotated header", undefined, true)}
        {listItem("Delete the inline checks", 2)}
      </View>
      <View style={{ gap: 4 }}>
        {task("Middleware", true)}
        {task("Route cleanup", true)}
        {task("Docs", false)}
      </View>
      {divider}
      {table}
      {codeBlock}
      {pele === undefined ? null : <DiagramSample theme={theme} pele={pele} />}
    </View>
  );
}

function RichPreview({ theme, draft, prefs, layout }: { theme: PluginTheme; draft: ThemeDraft; prefs: Prefs; layout: PluginScreenProps["layout"] }) {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const pt = previewTheme(draft, theme);
  return (
    <View style={{ gap: 14 }}>
      <PreviewHead theme={theme} layout={layout} viewport={viewport} setViewport={setViewport} />
      <MockChat theme={pt} layout={layout} viewport={viewport}>
        <RichSample theme={pt} rt={prefs.richText} pele={Platform.OS === "web" && prefs.nativeStyle === "design" ? prefs.diagrams === "pele" : undefined} />
      </MockChat>
    </View>
  );
}

function TopBar({ theme, layout, title, subtitle, children }: { theme: PluginTheme; layout: PluginScreenProps["layout"]; title: string; subtitle: string; children?: ReactNode }) {
  const s = useStyles(theme);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: layout.compact ? 16 : 32, paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[s.title, { fontSize: 20 }]}>{title}</Text>
        <Text style={[s.small, { fontSize: 13 }]}>{subtitle}</Text>
      </View>
      {children}
    </View>
  );
}

/**
 * Settings beside the preview, which sits on a sunken pane. Stacked in one scroll on compact screens and when the
 * dashboard is too narrow for both (desktop window beside the sidebar).
 */
function Columns({ theme, layout, editor, preview }: { theme: PluginTheme; layout: PluginScreenProps["layout"]; editor: ReactNode; preview: ReactNode }) {
  const [width, setWidth] = useState(0);
  const pane = sunken(theme.colors.surface0);
  const measure = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  if (layout.compact || (width > 0 && width < 940)) {
    return (
      <ScrollView onLayout={measure} contentContainerStyle={{ gap: 28, paddingVertical: layout.compact ? 16 : 28 }}>
        <View style={{ paddingHorizontal: layout.compact ? 16 : 32 }}>{editor}</View>
        <View style={{ paddingHorizontal: layout.compact ? 16 : 32, paddingVertical: 24, backgroundColor: pane }}>{preview}</View>
      </ScrollView>
    );
  }
  return (
    <View onLayout={measure} style={{ flex: 1, flexDirection: "row" }}>
      <ScrollView style={{ width: 472, flexGrow: 0, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: theme.colors.border }} contentContainerStyle={{ paddingHorizontal: 32, paddingVertical: 28 }}>
        {editor}
      </ScrollView>
      <ScrollView style={{ flex: 1, backgroundColor: pane }} contentContainerStyle={{ paddingHorizontal: 32, paddingVertical: 28 }}>
        {preview}
      </ScrollView>
    </View>
  );
}


function ThemePage({ theme, layout }: Pick<PluginScreenProps, "theme" | "layout">) {
  const s = useStyles(theme);
  const c = theme.colors;
  const prefs = usePrefs();
  const settings = useSettings(themeSettings);
  const saved = settings.status === "ready" ? settings.values : undefined;
  const host = readHostAppearance();
  const hostTypo: Typography = { uiFont: host.uiFont ?? "", contentSize: host.contentSize, monoFont: host.monoFont ?? "", codeSize: host.codeSize };
  // The app theme in use: this plugin's, a Paseo one (unset means Paseo's default, System), or another plugin's.
  const appId = host.pluginThemeId ? (host.pluginThemeId === THEME_CATALOG_ID ? "plugin" : "other") : (host.theme ?? "auto");
  const [draft, setDraft] = useState<ThemeDraft | undefined>();
  const [typo, setTypo] = useState(hostTypo);
  // The Paseo theme on show (read only); a Paseo theme in use starts out shown.
  const [view, setView] = useState<string | undefined>(PASEO_THEMES.some((t) => t.id === appId) ? appId : undefined);
  useEffect(() => {
    if (saved && !draft) setDraft(saved);
  }, [saved, draft]);

  const themeDirty = !!saved && !!draft && JSON.stringify(saved) !== JSON.stringify(draft);
  const typoDirty = JSON.stringify(typo) !== JSON.stringify(hostTypo);
  const dirty = themeDirty || typoDirty;
  const active = appId === "plugin";
  const paseo = PASEO_THEMES.find((t) => t.id === view);
  const shown = draft && paseo ? paseoDraft(paseo, draft.syntax) : draft;
  const fonts = { uiFontFamily: typo.uiFont, contentFontSize: typo.contentSize, monoFontFamily: typo.monoFont, codeFontSize: typo.codeSize };
  // Saves the theme and writes the fonts (and `app` settings) into Paseo's settings, which reloads the app.
  const apply = async (useAsAppTheme = false) => {
    if (!draft || settings.status !== "ready") return;
    if (themeDirty) {
      if (!(await settings.save(draft, settings.revision))) return;
      registerTheme(draft);
    }
    const typoPatch = typoDirty ? fonts : {};
    if (useAsAppTheme) setAppTheme(THEME_CATALOG_ID, typoPatch);
    else if (typoDirty) updateAppSettings(typoPatch);
  };
  const reset = () => {
    if (saved) setDraft(saved);
    setTypo(hostTypo);
  };

  let body: ReactNode;
  if (settings.status === "invalid" || settings.status === "error") {
    body = (
      <View style={{ padding: 28, gap: 12 }}>
        <Text style={[s.verb, { color: c.statusDanger }]}>Couldn't load the saved theme.</Text>
        <Button theme={theme} label="Restore default theme" icon="RotateCcw" onPress={() => void settings.reset()} />
      </View>
    );
  } else if (!draft || !shown) {
    body = <Text style={[s.small, { padding: 28 }]}>Loading theme…</Text>;
  } else {
    body = (
      <Columns
        theme={theme}
        layout={layout}
        editor={<Editor theme={theme} draft={draft} shown={shown} view={view} appId={appId} saved={saved} typo={typo} setDraft={setDraft} setView={setView} setTypo={setTypo} />}
        preview={<Preview theme={theme} draft={shown} prefs={prefs} layout={layout} theming={canSetAppTheme ? typo : undefined} />}
      />
    );
  }

  const subtitle = paseo
    ? `${paseo.name} is a Paseo theme. Its colors are fixed; customize a copy to change them.`
    : active
      ? "This is your Paseo theme. Apply pushes edits to the app."
      : canSetAppTheme
        ? "Use as app theme saves your edits and reloads Paseo with this theme."
        : "Apply, then choose it under Settings → Appearance to use it app-wide.";
  return (
    <>
      <TopBar theme={theme} layout={layout} title="Theme" subtitle={subtitle + (settings.saveError ? ` Save failed: ${String(settings.saveError)}` : "")}>
        {paseo && shown ? (
          <>
            {dirty ? <Button theme={theme} label="Reset" icon="RotateCcw" onPress={reset} /> : null}
            {dirty && appId === paseo.id ? <Button theme={theme} label={settings.saving ? "Applying…" : "Apply"} icon="Check" primary disabled={settings.saving} onPress={() => void apply()} /> : null}
            {appId === paseo.id ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Icon name="Check" size={14} color={c.foregroundMuted} />
                <Text style={[s.small, { fontSize: 13 }]}>In use</Text>
              </View>
            ) : (
              <Button theme={theme} label={`Use ${paseo.name}`} icon="Paintbrush" primary onPress={() => updateAppSettings({ theme: paseo.id, ...(typoDirty ? fonts : null) })} />
            )}
            <Button
              theme={theme}
              label="Customize a copy"
              icon="Copy"
              primary={appId === paseo.id && !dirty}
              disabled={!draft}
              onPress={() => {
                setDraft({ ...shown, name: `${paseo.name} copy` });
                setView(undefined);
              }}
            />
          </>
        ) : (
          <>
            <Button theme={theme} label="Reset" icon="RotateCcw" disabled={!dirty} onPress={reset} />
            {active || !canSetAppTheme ? (
              <Button theme={theme} label={settings.saving ? "Applying…" : "Apply theme"} icon="Check" primary disabled={!dirty || settings.saving} onPress={() => void apply()} />
            ) : (
              <Button theme={theme} label="Use as app theme" icon="Paintbrush" primary disabled={settings.saving || !draft} onPress={() => void apply(true)} />
            )}
          </>
        )}
      </TopBar>
      {body}
    </>
  );
}

const PAGE_SUBTITLES: Record<Exclude<Page, "theme">, string> = {
  messages: "Your messages, images in replies and the working indicator.",
  steps: "The thoughts and tool calls between two replies.",
  rich: "One style per markdown element in replies. Click a tile to switch.",
};

/** Timeline prefs save as you pick; open chats pick them up for new rows. */
function PrefsPage({ theme, layout, page, settings, change }: Pick<PluginScreenProps, "theme" | "layout"> & { page: Exclude<Page, "theme">; settings: ReturnType<typeof usePrefsSettings>["settings"]; change(p: Prefs): void }) {
  const prefs = usePrefs();
  const draft = useCurrentTheme() ?? themeSchema.parse({});
  const defaults = prefsSettings.schema.parse({});
  const isDefault = JSON.stringify(prefs) === JSON.stringify(defaults);
  const c = theme.colors;
  const s = useStyles(theme);
  const failed = !!settings.saveError;
  const status = failed ? `Save failed: ${String(settings.saveError)}` : settings.saving ? "Saving…" : "Saved automatically";
  const PagePreview = page === "rich" ? RichPreview : Preview;
  return (
    <>
      <TopBar theme={theme} layout={layout} title={PAGES.find((p) => p.id === page)!.label} subtitle={PAGE_SUBTITLES[page]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
          <Icon name={failed ? "TriangleAlert" : "Check"} size={13} color={failed ? c.statusDanger : c.statusSuccess} />
          <Text style={[s.small, { fontSize: 12, color: failed ? c.statusDanger : c.foregroundMuted }]} numberOfLines={1}>
            {status}
          </Text>
        </View>
        <Button theme={theme} label="Defaults" icon="RotateCcw" disabled={isDefault} onPress={() => change(defaults)} />
      </TopBar>
      <Columns
        theme={theme}
        layout={layout}
        editor={<PrefsEditor theme={theme} page={page} prefs={prefs} onChange={change} />}
        preview={<PagePreview theme={theme} draft={draft} prefs={prefs} layout={layout} />}
      />
    </>
  );
}

/** One settings instance for every prefs control in the dashboard, so saves never race on a stale revision. */
function usePrefsSettings() {
  const settings = useSettings(prefsSettings);
  const saved = settings.status === "ready" ? settings.values : undefined;
  // Settings may load after the entry's own fetch failed: trust the stored document.
  useEffect(() => {
    if (saved) setPrefs(saved);
  }, [saved]);
  const change = (next: Prefs) => {
    setPrefs(next);
    if (settings.status === "ready") void settings.save(next, settings.revision);
  };
  return { settings, change };
}

export function Dashboard({ theme, layout, host }: PluginScreenProps) {
  const [page, setPage] = useState<Page>("theme");
  const prefs = usePrefs();
  const { settings, change } = usePrefsSettings();
  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: theme.colors.surface0 }}>
      {layout.compact ? null : <InnerNav theme={theme} host={host.label} page={page} prefs={prefs} onSelect={setPage} onPrefs={change} />}
      <View style={{ flex: 1 }}>
        {layout.compact ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 12, alignItems: "flex-start" }}>
            <Segmented<Page> theme={theme} value={page} onChange={setPage} options={PAGES.map((p) => [p.id, p.icon] as [Page, string])} />
            {canSetAppTheme && page !== "theme" ? (
              <View style={{ alignSelf: "stretch" }}>
                <RestyleCard theme={theme} prefs={prefs} onChange={change} />
              </View>
            ) : null}
          </View>
        ) : null}
        {page === "theme" ? <ThemePage theme={theme} layout={layout} /> : <PrefsPage key={page} theme={theme} layout={layout} page={page} settings={settings} change={change} />}
      </View>
    </View>
  );
}

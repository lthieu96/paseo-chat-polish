// The live preview: a mock chat (or code view) drawn with the plugin's own rows in the draft theme.
import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { contrast, type ThemeDraft } from "../../shared/theme";
import type { Prefs } from "../../shared/timeline";
import { Icon } from "../icons";
import { hideableKind, todoData, toolData } from "../model";
import { PrefsOverride } from "../prefs";
import { alpha, AppearanceOverride, CodeLine, HtmlItem, ImagesItem, MergedSteps, PMONO, SyntaxOverride, ThoughtItem, TodoItem, ToolItem, useStyles } from "../views";
import { PASEO_FONT_STACKS } from "../web";
import { Badge, Segmented, SQUIRCLE_CARD } from "./controls";
import { CODE_CALLS, CODE_REPLY, LONG_MESSAGE, PREVIEW_CALLS, PREVIEW_IMAGE, PREVIEW_TODO, SAMPLE_PAGE } from "./samples";
import type { Typography } from "./theme-editor";

/** Plugin theme tokens for a draft, so the preview renders exactly what Apply would ship. */
export function previewTheme(d: ThemeDraft, host: PluginTheme): PluginTheme {
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

/** A sample page in the theme being edited, drawn by the same row the chat uses. */
export function HtmlPreview({ theme, draft, layout }: { theme: PluginTheme; draft: ThemeDraft; prefs: Prefs; layout: PluginScreenProps["layout"] }) {
  const pt = previewTheme(draft, theme);
  const s = useStyles(pt);
  return (
    <View style={{ gap: 12, padding: 24, borderRadius: 12, backgroundColor: pt.colors.surface0 }}>
      <Text style={[s.small, { fontSize: 12 }]}>“Chart our API latency for the last day”</Text>
      <HtmlItem agentId="preview" timestamp={new Date(0)} theme={pt} host={{ id: "preview", label: "Preview" }} layout={layout} item={{ type: "plugin", kind: "preview", version: 1, data: { title: "API latency", html: SAMPLE_PAGE } }} />
    </View>
  );
}

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

export type Viewport = "desktop" | "phone";

type PreviewMode = "chat" | "code";

export function PreviewHead({ theme, layout, viewport, setViewport, hint = "Updates as you change settings", mode }: { theme: PluginTheme; layout: PluginScreenProps["layout"]; viewport: Viewport; setViewport(v: Viewport): void; hint?: string; mode?: { value: PreviewMode; set(m: PreviewMode): void } }) {
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
export function MockChat({ theme, layout, viewport, children }: { theme: PluginTheme; layout: PluginScreenProps["layout"]; viewport: Viewport; children: ReactNode }) {
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
export function Preview({ theme, draft, prefs, layout, theming }: { theme: PluginTheme; draft: ThemeDraft; prefs: Prefs; layout: PluginScreenProps["layout"]; theming?: Typography }) {
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

export function InlineCode({ theme, variant, children }: { theme: PluginTheme; variant: Variant; children: string }) {
  const s = useStyles(theme);
  const c = theme.colors;
  const box = { a: { backgroundColor: c.surface2 }, b: {}, c: { borderWidth: 1, borderColor: alpha(c.border, 0.6) } }[variant];
  return (
    <View style={[{ paddingHorizontal: variant === "b" ? 0 : 5, paddingVertical: 1, borderRadius: 4 }, box]}>
      <Text {...PMONO} style={[s.code, { color: variant === "b" ? c.statusWarning : c.foreground }]}>{children}</Text>
    </View>
  );
}

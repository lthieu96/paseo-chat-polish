// The Theme page's editor: theme tiles, colors with contrast checks, typography and the syntax theme.
import type { PluginTheme } from "@getpaseo/plugin";
import { TextInput } from "@getpaseo/plugin/client/react-native";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { contrast, isHex, PRESETS, TOKEN_ROLES, TOKENS, type ThemeDraft, type Token } from "../../shared/theme";
import { PLAIN_SYNTAX, SYNTAX_THEMES } from "../highlight";
import { Icon } from "../icons";
import { alpha, PMONO, useStyles } from "../views";
import { canSetAppTheme, DEFAULTS, PASEO_FONT_STACKS } from "../web";
import { Grid, Notice, SectionHead, Segmented, SQUIRCLE_CARD } from "./controls";
import { PASEO_DARK, PASEO_LIGHT, PASEO_THEMES, type PaseoTheme } from "./paseo-themes";

/** Fonts and sizes as Paseo's Settings → Appearance keeps them; empty fonts are the system default. */
export interface Typography {
  uiFont: string;
  contentSize: number;
  monoFont: string;
  codeSize: number;
}

const sameColors = (a: ThemeDraft["colors"], b: ThemeDraft["colors"]) => TOKENS.every((t) => a[t].toLowerCase() === b[t].toLowerCase());

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

export function Editor({ theme, draft, shown, view, appId, saved, typo, setDraft, setView, setTypo }: EditorProps) {
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

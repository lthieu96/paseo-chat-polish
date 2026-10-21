import type { PluginTheme } from "@getpaseo/plugin";
import { openExternalUrl, useAgent, useRpc, type PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { copyText, ScrollView, useRevealedText, useToast } from "@getpaseo/plugin/client/react-native";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, Image, LayoutAnimation, Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import type { z } from "zod";
import { readImage } from "../shared/image";
import { loadImage } from "./images";
import type { Recap } from "../shared/recap";
import type { IconKind } from "../shared/timeline";
import { todoData, toolData, type imagesSchema, type noticeSchema, type planSchema, type stepsSchema, type thoughtSchema, type todoSchema, type ToolData, type Tone } from "./model";
import { changesOfTodo, runOf, runVersion, stepKey, stepSummary, subscribeRun, type TaskChange } from "./steps";
import { contrast, isHex } from "../shared/theme";
import { highlight, highlightShell, highlightShellBlock, SYNTAX_THEMES, type Span, type SyntaxColors } from "./highlight";
import { Icon } from "./icons";
import { usePrefs } from "./prefs";
import { useCurrentTheme } from "./theme-registry";
import { followExpansionAtBottom, readHostAppearance, type HostAppearance } from "./web";
import type { HtmlData } from "./html";
import { HtmlFrame, lastFrameHeight, useHovered, useHtmlTheme, windowButtonsInset } from "./html-frame";
import { htmlPage } from "../shared/page";
import { inlineImages, localImages, openHtml } from "../shared/html";

type Colors = PluginTheme["colors"];
const SQUIRCLE_CARD = { dataSet: { cpSquircle: "card" } } as object;
const ROW_HOVER = { dataSet: { cpRow: "" } } as object;
const RUNNING_LABEL = { dataSet: { cpRunningLabel: "" } } as object;
const NO_WRAP_SCROLL = { dataSet: { cpNowrap: "" } } as object;

// Paseo's own fallback stack when Settings → Appearance → Code font is empty.
const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" });
const ICON_SLOT = 20;

/**
 * Spread on every Text in the mono font. Paseo sets its UI font on all text not inside `data-pmono`, through an
 * `#root` selector that outranks the font family in our styles, so without it code renders in the UI font.
 */
export const PMONO = { dataSet: { pmono: "" } } as object;
const INDENT = 28;
// Paseo puts 16pt between timeline items; rows are 26pt tall, so 6pt less gives the design's 36pt pitch (normal density). The split puts a row
// 20pt from reply text on both sides, with the tighter reply blocks in web/restyle-css.ts (6pt item gap, 4pt padding).
// Compact and spacious move rows 6pt closer or 8pt further apart; web/restyle-css.ts sets the same values for Paseo's rows.
const TIGHT = { compact: { marginTop: 0, marginBottom: -12 }, normal: { marginTop: 2, marginBottom: -8 }, spacious: { marginTop: 5, marginBottom: -3 } };
/** How far faded thought and tool rows step back, per strength (Paseo's own rows match it in web/restyle-css.ts). */
const QUIET = { dim: 0.3, faded: 0.45, soft: 0.65, full: 1 };

function toneColor(c: Colors, tone: Tone | undefined) {
  if (tone === "success") return c.statusSuccess;
  if (tone === "danger") return c.statusDanger;
  if (tone === "warning") return c.statusWarning;
  if (tone === "accent") return c.accent;
  return c.foregroundMuted;
}

/** Hex color with alpha; non-hex colors (rgb(), names) are returned unchanged. */
export function alpha(color: string, a: number) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const hex = m[1]!.length === 3 ? [...m[1]!].map((ch) => ch + ch).join("") : m[1]!;
  return `#${hex}${Math.round(a * 255).toString(16).padStart(2, "0")}`;
}

/** The sunken surface behind code blocks: a step darker than the canvas (#23272e → #1e2227 in Mariana). */
export function sunken(color: string) {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1]!, 16);
  return `#${[16, 8, 0].map((sh) => Math.round(((n >> sh) & 255) * 0.86).toString(16).padStart(2, "0")).join("")}`;
}

/** Sizes follow Settings → Appearance: content size for prose and rows, code size (line height 1.5×) for code. */
function makeStyles(c: Colors, a: HostAppearance) {
  const ui = a.uiFont ? { fontFamily: a.uiFont } : {};
  const mono = { fontFamily: a.monoFont ? `${a.monoFont}, ${MONO}` : MONO };
  const body = a.contentSize - 1;
  const code = { ...mono, fontSize: a.codeSize, lineHeight: Math.round(a.codeSize * 1.5) };
  const rule = alpha(c.border, 0.6);
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 26, paddingVertical: 3 },
    slot: { width: ICON_SLOT, height: 18, alignItems: "center", justifyContent: "center" },
    verb: { ...ui, color: c.foreground, fontSize: body, fontWeight: "500" },
    target: { ...ui, color: c.foregroundMuted, fontSize: body, flexShrink: 1, opacity: 0.85 },
    mono: { ...mono, fontSize: a.codeSize + 1 },
    meta: { ...ui, color: c.foregroundMuted, fontSize: body - 2, fontVariant: ["tabular-nums"], marginLeft: "auto", flexShrink: 0 },
    detail: { paddingLeft: INDENT, paddingTop: 2, marginTop: 6 },
    ruled: { paddingLeft: 18, borderLeftWidth: 1, borderLeftColor: c.border, gap: 4, paddingVertical: 2 },
    block: { borderRadius: 8, backgroundColor: sunken(c.surface0), borderWidth: 1, borderColor: rule, overflow: "hidden" },
    blockHead: { flexDirection: "row", alignItems: "baseline", gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: rule },
    blockBody: { paddingHorizontal: 12, paddingVertical: 9 },
    code: { ...code, color: c.foreground },
    gutter: { ...code, color: c.foregroundMuted, opacity: 0.6, textAlign: "right", fontVariant: ["tabular-nums"], flexShrink: 0 },
    small: { ...ui, color: c.foregroundMuted, fontSize: body - 1, lineHeight: Math.round((body - 1) * 1.45) },
    label: { ...ui, color: c.foregroundMuted, fontSize: 10, fontWeight: "600", letterSpacing: 0.8, marginBottom: 4 },
    prose: { ...ui, color: c.foregroundMuted, fontSize: body, lineHeight: Math.round(body * 1.6) },
    card: { borderRadius: 12, backgroundColor: c.surface1, borderWidth: 1, borderColor: rule, overflow: "hidden" },
    cardHead: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: rule },
    title: { ...ui, color: c.foreground, fontSize: body, fontWeight: "600" },
    more: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 16, paddingBottom: 12, paddingTop: 4 },
    moreText: { ...ui, color: c.foregroundMuted, fontSize: body - 2, fontWeight: "500" },
    hairline: { flex: 1, height: 1, backgroundColor: rule },
  });
}

/** Lets the dashboard preview fonts and sizes before they are applied to Paseo. */
export const AppearanceOverride = createContext<Partial<HostAppearance> | undefined>(undefined);

export function useStyles(theme: PluginTheme) {
  const override = useContext(AppearanceOverride);
  return useMemo(() => makeStyles(theme.colors, { ...readHostAppearance(), ...override }), [theme, override]);
}

const NATIVE_DRIVER = Platform.OS !== "web";

// One shared reduce-motion subscription for every row, attached while any row is mounted.
let reducedMotion = false;
const motionListeners = new Set<() => void>();
let motionSub: { remove(): void } | undefined;
function subscribeReducedMotion(listener: () => void) {
  motionListeners.add(listener);
  if (!motionSub) {
    const set = (v: boolean) => {
      reducedMotion = v;
      motionListeners.forEach((l) => l());
    };
    void AccessibilityInfo.isReduceMotionEnabled().then(set);
    motionSub = AccessibilityInfo.addEventListener("reduceMotionChanged", set);
  }
  return () => {
    motionListeners.delete(listener);
    if (!motionListeners.size) {
      motionSub?.remove();
      motionSub = undefined;
    }
  };
}
export function useReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, () => reducedMotion);
}

/** Animated value that eases to `to` whenever it changes; snaps when the OS asks for reduced motion. */
function useTween(to: number, duration: number, from = to, native = NATIVE_DRIVER) {
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(from)).current;
  useEffect(() => {
    if (reduced) return void value.setValue(to);
    const anim = Animated.timing(value, { toValue: to, duration, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: native });
    anim.start();
    return () => anim.stop();
  }, [to, reduced, duration, native, value]);
  return value;
}

/** Opacity pulse for live labels: 1 → 0.45 → 1 over 2.2s. */
function usePulse(active: boolean) {
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    value.setValue(1);
    if (!active || reduced) return;
    const step = (toValue: number) =>
      Animated.timing(value, { toValue, duration: 1100, easing: Easing.inOut(Easing.ease), isInteraction: false, useNativeDriver: NATIVE_DRIVER });
    const loop = Animated.loop(Animated.sequence([step(0.45), step(1)]));
    loop.start();
    return () => {
      loop.stop();
      value.stopAnimation();
      value.setValue(1);
    };
  }, [active, reduced, value]);
  return value;
}

/** Fade + 4px rise each time `key` changes after the first render, so a new label reads as the next step arriving. */
function useSwap(key: string, active: boolean) {
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(1)).current;
  const previousKey = useRef(key);
  useEffect(() => {
    const changed = previousKey.current !== key;
    previousKey.current = key;
    if (!active || reduced) {
      value.stopAnimation();
      value.setValue(1);
      return;
    }
    if (!changed) return;
    value.setValue(0.25);
    const anim = Animated.timing(value, { toValue: 1, duration: 240, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: NATIVE_DRIVER });
    anim.start(({ finished }) => {
      if (finished) value.setValue(1);
    });
    return () => anim.stop();
  }, [key, active, reduced, value]);
  return active ? { opacity: value, transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }] } : null;
}

/** Fade + 4px rise for rows born while the agent is live; history renders still. */
function useEnter(live: boolean) {
  const [born] = useState(live);
  const t = useTween(1, 160, born ? 0 : 1);
  return born ? { opacity: t, transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }] } : null;
}

/** Open state whose toggle animates the surrounding layout change. */
function useDisclosure(initial = false) {
  const [open, setOpen] = useState(initial);
  const reduced = useReducedMotion();
  const toggle = useCallback(() => {
    followExpansionAtBottom();
    if (!reduced && Platform.OS !== "web") LayoutAnimation.configureNext(LayoutAnimation.create(100, "easeOut", "opacity"));
    setOpen((v) => !v);
  }, [reduced]);
  return [open, toggle, setOpen] as const;
}

function FadeIn({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const opacity = useTween(1, 100, 0);
  return <Animated.View style={[style, { opacity, transform: [{ translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [-4, 0] }) }] }]}>{children}</Animated.View>;
}

/** Keep output only through the closing transition; reopening cancels its pending removal. */
function Expand({ open, children, style }: { open: boolean; children: ReactNode | (() => ReactNode); style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const [present, setPresent] = useState(open);
  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    if (!present) return;
    if (reduced || Platform.OS !== "web") {
      setPresent(false);
      return;
    }
    // Leave a small buffer beyond the 100ms CSS transition before releasing the content.
    const timer = setTimeout(() => setPresent(false), 130);
    return () => clearTimeout(timer);
  }, [open, present, reduced]);
  if (!open && (!present || reduced || Platform.OS !== "web")) return null;
  const content = typeof children === "function" ? children() : children;
  if (Platform.OS !== "web") return <FadeIn style={style}>{content}</FadeIn>;
  return (
    <View {...({ dataSet: { cpExpand: open ? "open" : "closed" } } as object)} accessibilityElementsHidden={!open}>
      <View style={{ minHeight: 0, overflow: "hidden" }}>
        <View style={style}>{content}</View>
      </View>
    </View>
  );
}

interface RowProps {
  theme: PluginTheme;
  icon: string;
  iconColor?: string;
  verb: string;
  target?: string;
  mono?: boolean;
  meta?: string;
  metaColor?: string;
  pulsing?: boolean;
  struck?: boolean;
  /** Color the target as a shell command line while the row is expanded; collapsed rows stay quiet. */
  shell?: boolean;
  open?: boolean;
  onToggle?: () => void;
  compact: boolean;
  /** Animate the label in whenever it changes (the merged row's label follows the live step). */
  swap?: boolean;
  /** Which "Row icons" choice hides this row's icon. */
  kind: IconKind;
}

/** Left inset for a row's details: under the verb, past the icon when it shows. */
function useIndent(kind: IconKind) {
  return usePrefs().rowIcons[kind] === "hide" ? 0 : INDENT;
}

/** Shows `value` until its key changes, then keeps each new one up at least `hold` ms; changes inside the hold collapse into the latest,
 * so a run that steps quickly reads as a few calm label changes instead of a flicker. */
function useSteady<T>(value: T, key: string, hold: number, active = true): T {
  const [shown, setShown] = useState({ key, value });
  const since = useRef(0);
  const latest = useRef(value);
  latest.current = value;
  useEffect(() => {
    if (!active) {
      since.current = 0;
      if (key !== shown.key) setShown({ key, value: latest.current });
      return;
    }
    if (key === shown.key) return;
    const timer = setTimeout(() => {
      since.current = Date.now();
      setShown({ key, value: latest.current });
    }, Math.max(0, since.current + hold - Date.now()));
    return () => clearTimeout(timer);
  }, [key, shown.key, hold, active]);
  return active && key !== shown.key ? shown.value : value;
}

function Row(p: RowProps) {
  const s = useStyles(p.theme);
  const [hovered, setHovered] = useState(false);
  const swap = useSwap(`${p.verb}\n${p.target ?? ""}`, !!p.swap);
  const syntax = useSyntax(p.theme);
  const { commandColors, steps, rowIcons } = usePrefs();
  const bare = rowIcons[p.kind] === "hide";
  const pulse = usePulse(!!p.pulsing && Platform.OS !== "web");
  const c = p.theme.colors;
  const rotation = useTween(p.open ? 1 : 0, 100);
  const chevronOpacity = useTween(hovered || p.open || p.compact ? 0.7 : 0, 80);
  // All idle rows, including failures, follow Strength; hover, open and running rows come back to full strength.
  const quiet = steps !== "full" && !(hovered || p.open || p.pulsing);
  return (
    <Pressable
      {...ROW_HOVER}
      disabled={!p.onToggle}
      onPress={p.onToggle}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole={p.onToggle ? "button" : undefined}
      accessibilityState={p.onToggle ? { expanded: !!p.open } : undefined}
      // Bleeds into the gutter so the hover surface (full-strength rows only; faded rows brighten instead) covers the same area as Paseo's own tool rows.
      style={[s.row, { marginHorizontal: -13, paddingHorizontal: 13, borderRadius: 6 }, hovered && p.onToggle && steps === "full" ? { backgroundColor: c.surface1 } : null, quiet && { opacity: QUIET[steps] }]}
    >
      {bare ? null : (
        <View style={s.slot}>
          <Icon name={p.icon} size={15} color={p.iconColor ?? c.foregroundMuted} />
        </View>
      )}
      {/* Baseline, not center: the verb is in the content size and a mono target a point smaller, so centering left them a pixel apart. */}
      <Animated.View
        {...(p.pulsing ? RUNNING_LABEL : null)}
        style={[
          { flexDirection: "row", alignItems: "baseline", gap: 8, flexShrink: 1, minWidth: 0 },
          swap,
          Platform.OS !== "web" && { opacity: Animated.multiply(swap?.opacity ?? 1, pulse.interpolate({ inputRange: [0.45, 1], outputRange: [0.82, 1] })) },
        ]}
      >
        {/* One line: a long merged summary ends in "…" rather than wrapping the row; with a target, the target gives way instead. */}
        <Text numberOfLines={1} style={[s.verb, { flexShrink: p.target ? 0 : 1 }, bare && p.iconColor ? { color: p.iconColor } : null]}>
          {p.verb}
        </Text>
        {p.target ? (
          <Text
            numberOfLines={1}
            ellipsizeMode="middle"
            {...(p.mono ? PMONO : null)}
            style={[s.target, p.mono && s.mono, hovered && !p.pulsing && { color: c.foreground }, p.struck && { textDecorationLine: "line-through" }]}
          >
            {p.shell && (p.open || commandColors === "always") && syntax ? colored(highlightShell(p.target), syntax) : p.target}
          </Text>
        ) : null}
      </Animated.View>
      {p.meta ? <Text numberOfLines={1} style={[s.meta, p.metaColor ? { color: p.metaColor } : null]}>{p.meta}</Text> : <View style={{ flex: 1 }} />}
      {p.onToggle ? (
        <Animated.View
          style={{ opacity: chevronOpacity, transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] }) }] }}
        >
          <Icon name="ChevronRight" size={12} color={c.foregroundMuted} />
        </Animated.View>
      ) : null}
    </Pressable>
  );
}

function isDark(theme: PluginTheme) {
  const bg = theme.colors.surface0;
  return isHex(bg) && contrast(bg, "#ffffff") > contrast(bg, "#000000");
}

/** Lets the dashboard preview a highlight theme before it is applied. */
export const SyntaxOverride = createContext<string | undefined>(undefined);

/** Colors of the chosen highlight theme, or undefined for plain code (off, or a dark palette on a light theme). */
function useSyntax(theme: PluginTheme): SyntaxColors | undefined {
  const override = useContext(SyntaxOverride);
  const applied = useCurrentTheme()?.syntax;
  const id = override ?? applied ?? SYNTAX_THEMES[0]!.id;
  const palette = SYNTAX_THEMES.find((t) => t.id === id);
  return palette && (palette.appearance === "dark") === isDark(theme) ? palette.colors : undefined;
}

function colored(spans: Span[], colors: SyntaxColors) {
  return spans.map((t, i) => (t.kind ? <Text key={i} style={{ color: colors[t.kind] }}>{t.text}</Text> : t.text));
}

/** One line of code (or a shell command) in the chosen highlight theme. */
export function CodeLine({ text, theme, style, shell }: { text: string; theme: PluginTheme; style: StyleProp<TextStyle>; shell?: boolean }) {
  const colors = useSyntax(theme);
  return (
    <Text {...PMONO} selectable style={style}>
      {colors ? colored(shell ? highlightShellBlock(text) : highlight(text), colors) : text}
    </Text>
  );
}

function Scroll({ children, nowrap = false }: { children: ReactNode; nowrap?: boolean }) {
  return (
    <ScrollView {...(nowrap ? NO_WRAP_SCROLL : null)} style={{ maxHeight: 320 }} nestedScrollEnabled>
      {nowrap && Platform.OS !== "web" ? (
        <ScrollView horizontal nestedScrollEnabled contentContainerStyle={{ flexGrow: 1 }}>{children}</ScrollView>
      ) : children}
    </ScrollView>
  );
}

function ToolDetail({ data, theme }: { data: NonNullable<ToolData["detail"]>; theme: PluginTheme }) {
  const s = useStyles(theme);
  const c = theme.colors;
  const wrap = usePrefs().diffWrap === "on";
  switch (data.kind) {
    case "output":
      return (
        <View style={s.block}>
          {data.command ? (
            <View style={[s.blockHead, !data.text && { borderBottomWidth: 0 }]}>
              <Text {...PMONO} style={[s.code, { color: c.foregroundMuted, fontSize: s.code.fontSize + 0.5 }]}>$</Text>
              <CodeLine text={data.command} theme={theme} shell style={[s.code, { flex: 1, fontSize: s.code.fontSize + 0.5 }]} />
              {data.cwd ? <Text {...PMONO} style={[s.code, { color: c.foregroundMuted, fontSize: s.code.fontSize - 0.5 }]}>{data.cwd.split("/").pop()}</Text> : null}
            </View>
          ) : null}
          {data.text ? (
            <Scroll>
              <Text {...PMONO} style={[s.code, s.blockBody, { color: c.foregroundMuted }]} selectable>
                {data.text}
              </Text>
            </Scroll>
          ) : null}
        </View>
      );
    case "diff": {
      // An edit without hunk headers has no line numbers: no empty gutter then.
      const numberDigits = data.lines.reduce((max, l) => Math.max(max, String(l.n ?? "").length), 0);
      const lineStyle = wrap ? { flex: 1, minWidth: 0 } : { flexGrow: 1, flexShrink: 0 };
      return (
        <View style={s.block}>
          <Scroll nowrap={!wrap}>
            <View style={{ paddingVertical: 6, flexGrow: 1 }}>
              {data.lines.map((l, i) => {
                const color = l.sign === "+" ? c.statusSuccess : l.sign === "-" ? c.statusDanger : undefined;
                return (
                  <View key={i} style={{ flexDirection: "row", gap: 12, paddingHorizontal: 12, paddingVertical: 1, backgroundColor: color ? alpha(color, 0.12) : undefined }}>
                    <Text {...PMONO} style={[s.code, { color: color ?? c.foregroundMuted, width: s.code.fontSize, flexShrink: 0, marginRight: -6 }]}>{l.sign}</Text>
                    {numberDigits ? <Text {...PMONO} style={s.gutter}>{String(l.n ?? "").padStart(numberDigits, "\u2007")}</Text> : null}
                    {/* Added and removed lines read in their color, as in the design; context lines keep the highlight theme. */}
                    {color ? (
                      <Text {...PMONO} selectable style={[s.code, lineStyle, { color }]}>
                        {l.text}
                      </Text>
                    ) : (
                      <CodeLine text={l.text} theme={theme} style={[s.code, lineStyle]} />
                    )}
                  </View>
                );
              })}
            </View>
          </Scroll>
        </View>
      );
    }
    case "io":
      return (
        <View style={s.block}>
          {(["input", "output"] as const).map((k, i) => (
            <View key={k} style={[s.blockBody, i === 0 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
              <Text style={s.label}>{k.toUpperCase()}</Text>
              <Scroll>
                {data[k].split("\n").map((line, i) => (
                  <CodeLine key={i} text={line} theme={theme} style={s.code} />
                ))}
              </Scroll>
            </View>
          ))}
        </View>
      );
    case "list":
      return (
        <View style={s.ruled}>
          {data.items.map((it, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {it.icon ? <Icon name={it.icon} size={13} color={toneColor(c, it.tone)} /> : null}
              {it.shell ? (
                <CodeLine text={it.text} theme={theme} shell style={[s.code, { flexShrink: 1 }]} />
              ) : (
                <Text {...PMONO} numberOfLines={1} style={[s.code, { flexShrink: 1 }]}>
                  {it.text}
                </Text>
              )}
            </View>
          ))}
        </View>
      );
    case "text":
      return (
        <View style={s.ruled}>
          <Scroll>
            <Text style={s.small} selectable>
              {data.text}
            </Text>
          </Scroll>
        </View>
      );
  }
}

/** Rows inside an open merged run sit flush in its list, without the timeline spacing TIGHT adds. */
type Nestable = { nested?: boolean };

export function ToolItem({ item, theme, layout, nested }: PluginTimelineItemProps<ToolData> & Nestable) {
  const d = item.data;
  const s = useStyles(theme);
  const { toolDetails, density } = usePrefs();
  const auto = !!d.detail && (toolDetails === "expanded" || (toolDetails === "failed" && d.status === "failed"));
  const [open, toggle, setOpen] = useDisclosure(auto);
  // A running call that fails opens once it fails.
  useEffect(() => {
    if (auto) setOpen(true);
  }, [auto, setOpen]);
  const enter = useEnter(d.status === "running");
  const indent = useIndent("tool");
  const c = theme.colors;
  return (
    <Animated.View style={[nested ? null : TIGHT[density], enter, d.status === "canceled" ? { opacity: 0.55 } : null]}>
      <Row
        theme={theme}
        compact={layout.compact}
        kind="tool"
        icon={d.icon}
        iconColor={d.status === "failed" ? c.statusDanger : undefined}
        verb={d.verb}
        target={d.target}
        mono={d.mono}
        shell={d.shell}
        meta={d.meta}
        metaColor={d.metaTone ? toneColor(c, d.metaTone) : undefined}
        pulsing={d.status === "running"}
        struck={d.status === "canceled"}
        open={open}
        onToggle={d.detail ? toggle : undefined}
      />
      {d.error ? (
        <Text style={[s.small, { color: c.statusDanger, paddingLeft: indent }]} numberOfLines={open ? undefined : 2}>
          {d.error}
        </Text>
      ) : null}
      {d.detail ? (
        <Expand open={open} style={[s.detail, { paddingLeft: indent, marginBottom: 12 }]}>
          <ToolDetail data={d.detail} theme={theme} />
        </Expand>
      ) : null}
    </Animated.View>
  );
}

/** "41s", "2m 14s". */
function duration(ms: number) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** A run of thoughts and tool calls folded into one row (design: Merged steps · A), its steps read from the timelines client/steps.ts follows. */
export function StepsItem(props: PluginTimelineItemProps<z.output<typeof stepsSchema>>) {
  const { head } = props.item.data;
  const subscribe = useCallback((listener: () => void) => subscribeRun(head, listener), [head]);
  useSyncExternalStore(subscribe, () => runVersion(head));
  const { steps, ms, open: tail } = runOf(head);
  const working = useAgent(props.agentId, (a) => a.status === "running") ?? false;
  return <MergedSteps {...props} steps={steps} ms={ms} growing={!!tail && working} />;
}

/** The merged row. Done, it says what the run did and how long it took; working, it names the step in progress; a failed step turns
 * the icon red. Open, it lists the steps as their own rows. A lone step renders as itself. The dashboard preview draws it from samples. */
export function MergedSteps(
  props: PluginTimelineItemProps<unknown> & { steps: Array<{ item: AgentTimelineItem; phase: "streaming" | "complete" }>; ms?: number; growing: boolean; defaultOpen?: boolean },
) {
  const { item, theme, layout, steps, ms, growing, defaultOpen } = props;
  const [open, toggle] = useDisclosure(!!defaultOpen);
  const icons = !!useIndent("steps");
  const { density } = usePrefs();
  // Inside the open list steps sit flush; a run of one stands in the timeline like any row.
  const step = ({ item: step, phase }: (typeof steps)[number], nested = true) =>
    step.type === "tool_call" ? (
      <ToolItem key={stepKey(step)} {...props} nested={nested} item={{ ...item, data: toolData(step) }} />
    ) : step.type === "reasoning" ? (
      <ThoughtItem key={stepKey(step)} {...props} nested={nested} item={{ ...item, data: { text: step.text, phase } }} />
    ) : step.type === "todo" ? (
      <TodoSteps key={stepKey(step)} {...props} step={step} />
    ) : null;
  // The step in progress, or between steps of a run the agent is still adding to, the one just done (not the summary, which would flash).
  const live = steps.findLast((s) => s.phase === "streaming" || (s.item.type === "tool_call" && s.item.status === "running")) ?? (growing ? steps.at(-1) : undefined);
  const change = live?.item.type === "todo" ? changesOfTodo(stepKey(live.item)!).at(-1) : undefined;
  const words = change && changeWords(change);
  const now: Pick<ToolData, "verb" | "target" | "mono" | "shell"> | undefined =
    live?.item.type === "tool_call" ? toolData(live.item) : words ? { verb: words[0], target: words[1], mono: false } : undefined;
  const fresh = live && (live.item.type !== "todo" || now)
    ? { verb: now?.verb ?? (live.phase === "streaming" ? "Thinking" : "Thought"), target: now?.target, mono: now?.mono, shell: now?.shell }
    : { verb: stepSummary(steps.map((s) => s.item)) };
  const holdLabel = !!live && !(live.item.type === "tool_call" && (live.item.status === "failed" || live.item.status === "canceled"));
  const label = useSteady(fresh, `${fresh.verb}\n${fresh.target ?? ""}`, 700, holdLabel);
  if (steps.length < 2) return steps[0] ? step(steps[0], false) : null;
  const c = theme.colors;
  const failed = steps.filter((s) => s.item.type === "tool_call" && s.item.status === "failed").length;
  return (
    <View style={TIGHT[density]}>
      <Row
        theme={theme}
        compact={layout.compact}
        kind="steps"
        icon="ListTree"
        iconColor={failed ? c.statusDanger : undefined}
        verb={label.verb}
        target={label.target}
        mono={label.mono}
        shell={label.shell}
        meta={failed ? `${failed} failed` : live ? `${steps.length} steps` : ms ? duration(ms) : undefined}
        metaColor={failed ? c.statusDanger : undefined}
        pulsing={!!live}
        swap
        open={open}
        onToggle={toggle}
      />
      <Expand open={open} style={{ marginLeft: icons ? 9 : 0, paddingLeft: icons ? 15 : 13, paddingTop: 3, paddingBottom: 3, borderLeftWidth: 1, borderLeftColor: alpha(c.border, 0.6) }}>{() => steps.map((s) => step(s))}</Expand>
    </View>
  );
}

export function ThoughtItem({ item, theme, layout, nested }: PluginTimelineItemProps<z.output<typeof thoughtSchema>> & Nestable) {
  const s = useStyles(theme);
  // "paseo" follows Settings → Appearance → Always expand reasoning, which is off (collapsed) by default.
  const { reasoning, density } = usePrefs();
  const [open, toggle] = useDisclosure(reasoning === "paseo" ? readHostAppearance().autoExpandReasoning : reasoning === "expanded");
  const streaming = item.data.phase === "streaming";
  const enter = useEnter(streaming);
  const text = useRevealedText(item.data.text, item.data.phase);
  const inset = useIndent("thought") ? 9 : 0;
  return (
    <Animated.View style={[nested ? null : TIGHT[density], enter]}>
      <Row
        theme={theme}
        compact={layout.compact}
        kind="thought"
        icon="Brain"
        verb={streaming ? "Thinking" : "Thought"}
        pulsing={streaming}
        open={open}
        onToggle={text.trim() ? toggle : undefined}
      />
      {open ? (
        <FadeIn style={[s.detail, { paddingLeft: inset, paddingTop: 0 }]}>
          <View style={[s.ruled, { gap: 10 }]}>
            {text
              .trim()
              .split(/\n\s*\n/)
              .map((para, i) => (
                <Text key={i} style={s.prose} selectable>
                  {para}
                </Text>
              ))}
          </View>
        </FadeIn>
      ) : null}
    </Animated.View>
  );
}

export function PlanItem({ item, theme }: PluginTimelineItemProps<z.output<typeof planSchema>>) {
  const s = useStyles(theme);
  const [open, toggle] = useDisclosure();
  const text = useRevealedText(item.data.text, item.data.phase).trim();
  const long = text.split("\n").length > 14 || text.length > 1200;
  const steps = text.match(/^\s*\d+[.)]\s/gm)?.length ?? 0;
  return (
    <View {...SQUIRCLE_CARD} style={s.card}>
      <View style={s.cardHead}>
        <Icon name="Map" size={15} color={theme.colors.accent} />
        <Text style={s.title}>Plan</Text>
        {steps ? <Text style={[s.meta, { marginLeft: 0 }]}>{steps} steps</Text> : null}
      </View>
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: long ? 6 : 14, maxHeight: long && !open ? 320 : undefined, overflow: "hidden" }}>
        <Text style={[s.prose, { color: theme.colors.foreground, lineHeight: Math.round(s.prose.fontSize * 1.5) }]} selectable>
          {text}
        </Text>
      </View>
      {long ? (
        <Pressable accessibilityRole="button" onPress={toggle} style={s.more}>
          <Text style={s.moreText}>{open ? "Show less" : "Show full plan"}</Text>
          <Icon name={open ? "ChevronUp" : "ChevronDown"} size={12} color={theme.colors.foregroundMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const changeWords = (c: TaskChange): [string, string | undefined] =>
  c.type === "created" ? [`Created ${c.count} ${c.count === 1 ? "task" : "tasks"}`, undefined] : [c.type.charAt(0).toUpperCase() + c.type.slice(1), c.text];

/** A todo update inside a merged run: one row per change ("Completed Inspect its source"); open, a row shows the list at that point. */
function TodoSteps(props: PluginTimelineItemProps<unknown> & { step: Extract<AgentTimelineItem, { type: "todo" }> }) {
  const changes = changesOfTodo(stepKey(props.step)!);
  return <>{changes.map((change, i) => <TaskChangeRow key={i} {...props} change={change} />)}</>;
}

function TaskChangeRow({ theme, layout, step, change }: PluginTimelineItemProps<unknown> & { step: Extract<AgentTimelineItem, { type: "todo" }>; change: TaskChange }) {
  const [open, toggle] = useDisclosure();
  const indent = useIndent("tool");
  const [verb, target] = changeWords(change);
  const { items } = todoData(step);
  const done = items.filter((t) => t.status === "completed").length;
  return (
    <View>
      <Row theme={theme} compact={layout.compact} kind="tool" icon="ListChecks" verb={verb} target={target} meta={`${done}/${items.length}`} open={open} onToggle={toggle} />
      {open ? (
        <FadeIn style={{ paddingLeft: indent, paddingTop: 2, paddingBottom: 8 }}>
          <TodoList theme={theme} items={items} />
        </FadeIn>
      ) : null}
    </View>
  );
}

function TodoLine({ theme, status, text }: { theme: PluginTheme; status: "pending" | "in_progress" | "completed"; text: string }) {
  const s = useStyles(theme);
  const c = theme.colors;
  const pulse = usePulse(status === "in_progress");
  const [icon, color] =
    status === "completed" ? ["CircleCheck", c.statusSuccess] : status === "in_progress" ? ["CircleDot", c.accent] : ["Circle", c.foregroundMuted];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Icon name={icon} size={14} color={color} />
      <Animated.Text
        style={[
          s.target,
          { opacity: pulse, color: status === "completed" ? c.foregroundMuted : c.foreground },
          status === "completed" && { textDecorationLine: "line-through" },
        ]}
      >
        {text}
      </Animated.Text>
    </View>
  );
}

function TodoList({ theme, items }: { theme: PluginTheme; items: z.output<typeof todoSchema>["items"] }) {
  return (
    <View style={{ gap: 6 }}>
      {items.map((t, i) => (
        <TodoLine key={i} theme={theme} status={t.status} text={t.text} />
      ))}
    </View>
  );
}

/** A todo update on its own row (merging off, or no steps around it): "Tasks 1 / 3", progress and the task in progress; open, the list. */
export function TodoItem({ item, theme }: PluginTimelineItemProps<z.output<typeof todoSchema>>) {
  const s = useStyles(theme);
  const c = theme.colors;
  const [open, toggle] = useDisclosure();
  const [hovered, setHovered] = useState(false);
  const { items, active } = item.data;
  const done = items.filter((t) => t.status === "completed").length;
  const progress = useTween(items.length ? done / items.length : 0, 300);
  const rotation = useTween(open ? 1 : 0, 100);
  return (
    <View>
      <Pressable
        onPress={toggle}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={[s.row, { gap: 10, borderRadius: 6 }]}
      >
        <View style={s.slot}>
          <Icon name="ListChecks" size={15} color={c.foregroundMuted} />
        </View>
        <Text style={s.verb}>Tasks</Text>
        <Text {...PMONO} style={[s.code, { color: c.foregroundMuted }]}>
          {done} / {items.length}
        </Text>
        <View style={{ width: 56, height: 3, borderRadius: 2, overflow: "hidden", backgroundColor: c.surface2 }}>
          <Animated.View style={{ width: 56, height: 3, borderRadius: 2, backgroundColor: c.accent, transformOrigin: "left center", transform: [{ scaleX: progress }] }} />
        </View>
        {active ? (
          <Text numberOfLines={1} style={[s.target, hovered && { color: c.foreground }]}>
            {active}
          </Text>
        ) : null}
        <View style={{ flex: 1 }} />
        <Animated.View style={{ opacity: hovered || open ? 0.7 : 0, transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] }) }] }}>
          <Icon name="ChevronRight" size={12} color={c.foregroundMuted} />
        </Animated.View>
      </Pressable>
      {open ? (
        <FadeIn style={{ paddingLeft: INDENT, paddingTop: 2, paddingBottom: 6 }}>
          <TodoList theme={theme} items={items} />
        </FadeIn>
      ) : null}
    </View>
  );
}

export function NoticeItem({ item, theme }: PluginTimelineItemProps<z.output<typeof noticeSchema>>) {
  const s = useStyles(theme);
  const d = item.data;
  const color = toneColor(theme.colors, d.tone);
  const pulse = usePulse(d.pulsing);
  if (d.variant === "inline") {
    return (
      <View style={[s.row, { alignItems: "flex-start" }]}>
        <View style={s.slot}>
          <Icon name={d.icon} size={15} color={color} />
        </View>
        <Text style={[s.verb, { color, flex: 1, lineHeight: 20 }]} selectable>
          {d.text}
        </Text>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 }} accessibilityRole="text">
      <View style={s.hairline} />
      <Icon name={d.icon} size={12} color={color} />
      <Animated.Text style={[s.meta, { marginLeft: 0, color: d.tone === "danger" ? color : theme.colors.foregroundMuted, opacity: pulse, flexShrink: 1 }]} numberOfLines={2}>
        {d.text}
      </Animated.Text>
      <View style={s.hairline} />
    </View>
  );
}

function useImage(url: string, variant: "thumbnail" | "original" = "original") {
  const read = useRpc(readImage);
  const key = `${variant}:${url}`;
  const [state, setState] = useState<{ key?: string; uri?: string; failed?: boolean }>({});
  useEffect(() => {
    let alive = true;
    loadImage(url, variant, read).then(
      (uri) => alive && setState({ key, uri }),
      () => alive && setState({ key, failed: true }),
    );
    return () => {
      alive = false;
    };
  }, [url, variant, key, read]);
  return state.key === key ? state : {};
}

const THUMB = { small: { width: 200, height: 128 }, large: { width: 320, height: 200 } };

function Thumbnail({ alt, url, theme, onOpen }: { alt: string; url: string; theme: PluginTheme; onOpen(): void }) {
  const s = useStyles(theme);
  const c = theme.colors;
  const { uri, failed } = useImage(url, "thumbnail");
  const size = THUMB[usePrefs().images === "large" ? "large" : "small"];
  const frame = [size, { borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, backgroundColor: c.surface1, overflow: "hidden" as const }];
  if (!uri) {
    return (
      <View style={[frame, { alignItems: "center", justifyContent: "center", gap: 6 }]}>
        <Icon name={failed ? "ImageOff" : "Image"} size={16} color={c.foregroundMuted} />
        <Text style={s.small}>{failed ? "Image unavailable" : "Loading…"}</Text>
      </View>
    );
  }
  return (
    <Pressable accessibilityRole="imagebutton" accessibilityLabel={`Open ${alt}`} onPress={onOpen} style={frame}>
      <Image source={{ uri }} style={size} resizeMode="cover" />
    </Pressable>
  );
}

type KeyTarget = { addEventListener(type: "keydown", l: (e: { key: string; preventDefault(): void }) => void): void; removeEventListener(type: "keydown", l: (e: { key: string; preventDefault(): void }) => void): void };

/** A round control on the lightbox's dark chrome, the same in every theme. */
function LightboxButton({ icon, label, onPress, size = 32 }: { icon: string; label: string; onPress(): void; size?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({ width: size, height: size, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: `rgba(255,255,255,${pressed ? 0.2 : hovered ? 0.14 : 0.08})` })}
    >
      <Icon name={icon} size={size > 32 ? 18 : 16} color="#ffffff" />
    </Pressable>
  );
}

/**
 * Full-window viewer for a reply's images: fitted to the window, click (or Z) for actual size with scrolling, arrows between
 * images, Esc or a click on the backdrop to close.
 */
function Lightbox({ images, index, onIndex, onClose }: { images: Array<{ alt: string; url: string }>; index: number; onIndex(i: number): void; onClose(): void }) {
  const image = images[index]!;
  const { uri, failed } = useImage(image.url);
  const win = useWindowDimensions();
  const [natural, setNatural] = useState<{ w: number; h: number }>();
  const [zoomed, setZoomed] = useState(false);
  const many = images.length > 1;
  const go = useCallback((step: number) => (setZoomed(false), onIndex((index + step + images.length) % images.length)), [index, images.length, onIndex]);
  useEffect(() => {
    setNatural(undefined);
    if (uri) Image.getSize(uri, (w, h) => setNatural({ w, h }), () => {});
  }, [uri]);
  useEffect(() => {
    const target = Platform.OS === "web" ? (globalThis as unknown as KeyTarget) : undefined;
    if (!target) return;
    const onKey = (e: { key: string; preventDefault(): void }) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && many) go(1);
      else if (e.key === "ArrowLeft" && many) go(-1);
      else if (e.key === "z" || e.key === "Z") setZoomed((z) => !z);
      else return;
      e.preventDefault();
    };
    target.addEventListener("keydown", onKey);
    return () => target.removeEventListener("keydown", onKey);
  }, [go, many, onClose]);
  // Fitted: the largest size that leaves room for the chrome, never above actual size except that a tiny image grows to 320pt.
  // Zoomed: actual size, or twice the fitted size for an image already shown whole, so a click always magnifies.
  const room = { w: win.width - (many ? 160 : 64), h: win.height - 136 };
  const fit = natural ? Math.min(Math.max(1, 320 / Math.max(natural.w, natural.h)), room.w / natural.w, room.h / natural.h) : 1;
  const scale = zoomed ? Math.max(1, fit * 2) : fit;
  const shown = natural ? { width: Math.round(natural.w * scale), height: Math.round(natural.h * scale) } : { width: Math.min(room.w, 640), height: Math.min(room.h, 400) };
  const chrome = { color: "#ffffff", fontSize: 13 } as const;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={[{ flex: 1, backgroundColor: "rgba(8,9,11,0.92)" }, Platform.OS === "web" ? ({ backdropFilter: "blur(12px)" } as object) : null]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close image" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View pointerEvents="box-none" style={{ flexDirection: "row", alignItems: "center", gap: 12, height: 56, paddingHorizontal: 16 }}>
          <View pointerEvents="none" style={{ flex: 1, flexDirection: "row", alignItems: "baseline", gap: 10, minWidth: 0 }}>
            <Text style={[chrome, { fontWeight: "500", flexShrink: 1 }]} numberOfLines={1}>
              {image.alt || "Image"}
            </Text>
            {natural ? <Text style={[chrome, { fontSize: 12, opacity: 0.55, fontVariant: ["tabular-nums"] }]}>{`${natural.w} × ${natural.h}`}</Text> : null}
            {many ? <Text style={[chrome, { fontSize: 12, opacity: 0.55, fontVariant: ["tabular-nums"] }]}>{`${index + 1} / ${images.length}`}</Text> : null}
          </View>
          {natural && fit < 1 ? <Text style={[chrome, { fontSize: 12, opacity: 0.55, fontVariant: ["tabular-nums"] }]}>{`${Math.round(scale * 100)}%`}</Text> : null}
          <LightboxButton icon={zoomed ? "ZoomOut" : "ZoomIn"} label={zoomed ? "Fit to window" : "Zoom in"} onPress={() => setZoomed((z) => !z)} />
          <LightboxButton icon="X" label="Close" onPress={onClose} />
        </View>
        <ScrollView style={{ flex: 1 }} horizontal={false} contentContainerStyle={{ flexGrow: 1 }}>
          <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
            {/* The scroll area covers the backdrop, so it closes on a press itself; the image's own press zooms instead. */}
            <Pressable
              accessibilityLabel="Close image"
              onPress={onClose}
              style={{ flexGrow: 1, minWidth: win.width, minHeight: win.height - 56, alignItems: "center", justifyContent: "center", paddingHorizontal: many ? 80 : 32, paddingBottom: 56, cursor: "default" } as object}
            >
            {uri ? (
              <Pressable accessibilityRole="imagebutton" accessibilityLabel={zoomed ? "Fit to window" : "Zoom in"} onPress={() => setZoomed((z) => !z)} style={{ cursor: zoomed ? "zoom-out" : "zoom-in" } as object}>
                <Image source={{ uri }} style={[shown, { borderRadius: 6 }]} resizeMode="contain" />
              </Pressable>
            ) : (
              <View pointerEvents="none" style={[shown, { alignItems: "center", justifyContent: "center", gap: 8 }]}>
                <Icon name={failed ? "ImageOff" : "Image"} size={20} color="rgba(255,255,255,0.5)" />
                <Text style={[chrome, { opacity: 0.5 }]}>{failed ? "Image unavailable" : "Loading…"}</Text>
              </View>
            )}
            </Pressable>
          </ScrollView>
        </ScrollView>
        {many ? (
          <>
            <View pointerEvents="box-none" style={{ position: "absolute", left: 20, top: 0, bottom: 0, justifyContent: "center" }}>
              <LightboxButton icon="ChevronLeft" label="Previous image" onPress={() => go(-1)} size={40} />
            </View>
            <View pointerEvents="box-none" style={{ position: "absolute", right: 20, top: 0, bottom: 0, justifyContent: "center" }}>
              <LightboxButton icon="ChevronRight" label="Next image" onPress={() => go(1)} size={40} />
            </View>
          </>
        ) : null}
        <Text pointerEvents="none" style={[chrome, { position: "absolute", bottom: 14, alignSelf: "center", fontSize: 12, color: "rgba(255,255,255,0.6)", backgroundColor: "rgba(8,9,11,0.7)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: "hidden" }]}>
          {Platform.OS === "web" ? `Click to ${zoomed ? "fit" : "zoom"} · ${many ? "← → to browse · " : ""}Esc to close` : "Tap to zoom"}
        </Text>
      </View>
    </Modal>
  );
}

export function ImagesItem({ item, theme }: PluginTimelineItemProps<z.output<typeof imagesSchema>>) {
  const [open, setOpen] = useState<number>();
  return (
    // Rows leave 8pt less below and take 2pt more above (TIGHT), so thumbnails between two rows sit 19pt from each.
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 11, paddingBottom: 1 }}>
      {item.data.images.map((img, i) => (
        <Thumbnail key={i} alt={img.alt} url={img.url} theme={theme} onOpen={() => setOpen(i)} />
      ))}
      {open !== undefined ? <Lightbox images={item.data.images} index={open} onIndex={setOpen} onClose={() => setOpen(undefined)} /> : null}
    </View>
  );
}

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** GitHub-style diffstat: five squares split between added and removed, at least one for any removal. */
export function Diffstat({ added, removed, theme }: { added: number; removed: number; theme: PluginTheme }) {
  const c = theme.colors;
  const total = added + removed;
  const plus = total ? Math.round((5 * added) / total) : 0;
  const minus = total ? Math.min(5 - plus, Math.max(removed ? 1 : 0, Math.round((5 * removed) / total))) : 0;
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={{ width: 7, height: 7, borderRadius: 1.5, backgroundColor: i < plus ? c.statusSuccess : i < plus + minus ? c.statusDanger : c.surface2, opacity: i < plus + minus ? 0.85 : 1 }} />
      ))}
    </View>
  );
}

/** The daemon's recap after a turn, set like the turn footer under it: files with +/− and a diffstat, commands, failures. Opens to the file list. */
export function RecapItem({ item, theme }: PluginTimelineItemProps<Recap>) {
  const s = useStyles(theme);
  const c = theme.colors;
  const { files, commands, failed } = item.data;
  const [open, toggle] = useDisclosure(false);
  const [hovered, setHovered] = useState(false);
  const added = files.reduce((n, f) => n + f.added, 0);
  const removed = files.reduce((n, f) => n + f.removed, 0);
  const text = [s.meta, { marginLeft: 0, fontSize: 12 }];
  const mono = [s.code, { fontSize: 12, lineHeight: 18 }];
  const dot = <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.statusDanger }} />;
  const parts: ReactNode[] = [];
  if (files.length)
    parts.push(
      <View key="files" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text style={[text, { color: c.foreground }]}>{count(files.length, "file")}</Text>
        {added ? <Text {...PMONO} style={[mono, { color: c.statusSuccess }]}>+{added}</Text> : null}
        {removed ? <Text {...PMONO} style={[mono, { color: c.statusDanger }]}>−{removed}</Text> : null}
        <Diffstat added={added} removed={removed} theme={theme} />
      </View>,
    );
  if (commands) parts.push(<Text key="commands" style={text}>{count(commands, "command")}</Text>);
  if (failed.length)
    parts.push(
      <View key="failed" style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        {dot}
        <Text style={[text, { color: c.statusDanger }]}>{failed.length} failed</Text>
      </View>,
    );
  return (
    <View style={{ marginVertical: -3 }}>
      <Pressable
        onPress={toggle}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 26, alignSelf: "flex-start", opacity: hovered || open ? 1 : 0.85 }}
      >
        <View style={s.slot}>
          <Icon name="FileDiff" size={14} color={c.foregroundMuted} />
        </View>
        {parts.flatMap((part, i) => (i ? [<Text key={`dot${i}`} style={text}>·</Text>, part] : [part]))}
        <Icon name={open ? "ChevronDown" : "ChevronRight"} size={12} color={c.foregroundMuted} />
      </Pressable>
      {open ? (
        <FadeIn style={{ paddingLeft: 9, marginTop: 4 }}>
          <View style={{ borderLeftWidth: 1, borderLeftColor: alpha(c.border, 0.6), paddingLeft: 14, paddingVertical: 2 }}>
            {files.map((f) => {
              const cut = f.path.lastIndexOf("/") + 1;
              return (
                <View key={f.path} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 26 }}>
                  <Text {...PMONO} numberOfLines={1} ellipsizeMode="head" style={[mono, { flexShrink: 1 }]} selectable>
                    <Text style={{ color: c.foregroundMuted }}>{f.path.slice(0, cut)}</Text>
                    {f.path.slice(cut)}
                  </Text>
                  <View style={{ flex: 1 }} />
                  <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 6, minWidth: 76 }}>
                    {f.added ? <Text {...PMONO} style={[mono, { color: c.statusSuccess }]}>+{f.added}</Text> : null}
                    {f.removed ? <Text {...PMONO} style={[mono, { color: c.statusDanger }]}>−{f.removed}</Text> : null}
                  </View>
                  <Diffstat added={f.added} removed={f.removed} theme={theme} />
                </View>
              );
            })}
            {failed.map((f, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 26 }}>
                {dot}
                <Text {...PMONO} numberOfLines={1} style={[mono, { flexShrink: 1 }]} selectable>
                  {f.command}
                </Text>
                {f.exit ? <Text {...PMONO} numberOfLines={1} style={[mono, { flexShrink: 0, color: c.statusDanger }]}>exit {f.exit}</Text> : null}
              </View>
            ))}
          </View>
        </FadeIn>
      ) : null}
    </View>
  );
}

/** A page an agent published with html_render. Native apps can't run its scripts in a frame, so they name it instead. */
export function HtmlItem({ item, theme }: PluginTimelineItemProps<HtmlData>) {
  if (Platform.OS === "web") return <HtmlPage {...item.data} theme={theme} />;
  return (
    <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13, paddingVertical: 4 }}>{`${item.data.title}: open this chat on desktop or the web to see the page.`}</Text>
  );
}

/** The page with the local images it names inlined, undefined while they're read; an image that can't be read keeps its path. */
function useInlinedImages(html: string) {
  const read = useRpc(readImage);
  const paths = useMemo(() => [...new Set(localImages(html).map((image) => image.path))], [html]);
  const [done, setDone] = useState<{ source: string; html: string }>();
  useEffect(() => {
    if (!paths.length) return;
    let alive = true;
    void Promise.all(paths.map((path) => loadImage(path, "original", read).then((uri) => [path, uri] as const, () => undefined))).then((entries) => {
      if (alive) setDone({ source: html, html: inlineImages(html, new Map(entries.filter((entry) => entry !== undefined))) });
    });
    return () => {
      alive = false;
    };
  }, [html, paths, read]);
  if (!paths.length) return html;
  return done?.source === html ? done.html : undefined;
}

/** The page in the chat, with full screen, open in browser and copy on hover. Full screen is a second frame, so the page starts over there. */
function HtmlPage({ html, title, theme }: HtmlData & { theme: PluginTheme }) {
  const page = useInlinedImages(html);
  const c = theme.colors;
  const css = useHtmlTheme(c);
  const save = useRpc(openHtml);
  const toast = useToast();
  const box = useRef<View>(null);
  const hovered = useHovered(box);
  const [full, setFull] = useState(false);
  // Esc pressed outside the page (its header, after a click on the backdrop); the page passes on its own through onEscape.
  useEffect(() => {
    if (!full) return;
    const target = globalThis as unknown as KeyTarget;
    const onKey = (e: { key: string; preventDefault(): void }) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setFull(false);
    };
    target.addEventListener("keydown", onKey);
    return () => target.removeEventListener("keydown", onKey);
  }, [full]);
  const openInBrowser = () =>
    save({ html: htmlPage(page ?? html, css, true) })
      .then(({ url }) => openExternalUrl(url))
      .catch((error: unknown) => {
        console.warn("[chat-polish] Opening the page in the browser failed", error);
        toast.error("Couldn't open the page in the browser.");
      });
  const copy = () => copyText(html).then(() => toast.show("Copied the page's HTML", { variant: "success" }), () => toast.error("Couldn't copy the HTML."));
  const button = (icon: string, label: string, onPress: () => void) => (
    <Pressable
      key={icon}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ hovered: on, pressed }: { hovered?: boolean; pressed: boolean }) => ({ width: 26, height: 26, borderRadius: 6, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border, backgroundColor: on || pressed ? c.surface2 : c.surface1 })}
    >
      <Icon name={icon} size={14} color={c.foregroundMuted} />
    </Pressable>
  );
  const shared = [button("ExternalLink", "Open in browser", () => void openInBrowser()), button("Copy", "Copy HTML", () => void copy())];
  return (
    <View ref={box}>
      {/* A stand-in the frame's last size while images load, so the chat doesn't move when the page arrives. */}
      {page === undefined ? <View style={{ height: lastFrameHeight(html) }} /> : <HtmlFrame html={page} id={html} title={title} colors={c} />}
      {/* Hidden, not removed, off hover: the buttons stay where the pointer may land, so showing them never moves what is under it. */}
      <View pointerEvents="box-none" style={{ position: "absolute", top: 6, right: 6, flexDirection: "row", gap: 4, opacity: hovered ? 1 : 0 }}>
        {[button("Maximize2", "Full screen", () => setFull(true)), ...shared]}
      </View>
      {full ? (
        <Modal transparent visible animationType="fade" onRequestClose={() => setFull(false)}>
          <View style={{ flex: 1, backgroundColor: c.surface0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 48, paddingLeft: windowButtonsInset(), paddingRight: 16, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text style={{ flex: 1, color: c.foreground, fontSize: 13, fontWeight: "500" }} numberOfLines={1}>
                {title}
              </Text>
              {[...shared, button("X", "Close full screen", () => setFull(false))]}
            </View>
            <View style={{ flex: 1, paddingVertical: 24, paddingHorizontal: 32 }}>
              <HtmlFrame html={page ?? html} title={title} colors={c} fill onEscape={() => setFull(false)} />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

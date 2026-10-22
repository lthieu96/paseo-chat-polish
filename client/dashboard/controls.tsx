// The dashboard's shared controls and page layout, drawn in the plugin theme's colors.
import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/react-native";
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Icon } from "../icons";
import { alpha, sunken, useReducedMotion, useStyles } from "../views";

export const SQUIRCLE_CARD = { dataSet: { cpSquircle: "card" } } as object;

export function Button({ theme, label, icon, primary, disabled, onPress }: { theme: PluginTheme; label: string; icon: string; primary?: boolean; disabled?: boolean; onPress(): void }) {
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
export function Segmented<T extends string>({ theme, value, options, onChange }: { theme: PluginTheme; value: T; options: Array<[T, string, string?, boolean?]>; onChange(v: T): void }) {
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
export function SectionHead({ theme, title, hint }: { theme: PluginTheme; title: string; hint?: string }) {
  const s = useStyles(theme);
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text style={[s.label, { fontSize: 11, marginBottom: 0 }]}>{title.toUpperCase()}</Text>
      {hint ? <Text style={[s.small, { fontSize: 11 }]}>{hint}</Text> : null}
    </View>
  );
}

/** A small full-radius tag: "Live", "AA". */
export function Badge({ theme, label, icon, tone }: { theme: PluginTheme; label: string; icon?: string; tone?: string }) {
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
export function Notice({ theme, icon = "Info", children, action }: { theme: PluginTheme; icon?: string; children: ReactNode; action?: ReactNode }) {
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

export function Switch({ theme, value, label, onChange }: { theme: PluginTheme; value: boolean; label: string; onChange(v: boolean): void }) {
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
export function Chip({ theme, on, label, onPress }: { theme: PluginTheme; on: boolean; label: string; onPress(): void }) {
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
export function Group({ theme, title, top, children }: { theme: PluginTheme; title: string; top?: ReactNode; children: ReactNode }) {
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
export function Row({ theme, label, hint, stacked, first, children }: { theme: PluginTheme; label: string; hint: string; stacked?: boolean; first?: boolean; children: ReactNode }) {
  const s = useStyles(theme);
  const text = (
    // A basis rather than flex: 1, so on a phone a wide control wraps under the label instead of squeezing it to a word per line.
    <View style={stacked ? { gap: 2 } : { flexGrow: 1, flexShrink: 1, flexBasis: 140, gap: 2 }}>
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
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 16, rowGap: 10 }}>
          {text}
          {children}
        </View>
      )}
    </View>
  );
}

/** "• Paseo's default", the key to the dot on Segmented options. */
export function Legend({ theme }: { theme: PluginTheme }) {
  const s = useStyles(theme);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: theme.colors.foregroundMuted }} />
      <Text style={[s.small, { fontSize: 12 }]}>Paseo's default</Text>
    </View>
  );
}

const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

const TILE_MIN = 96;

/** Tiles in rows of `n`, fewer when that would make a tile narrower than TILE_MIN (phones); a short last row is padded so its tiles keep the same width. */
export function Grid({ n, gap = 8, children }: { n: number; gap?: number; children: ReactNode[] }) {
  const [width, setWidth] = useState(0);
  const cols = width ? Math.max(1, Math.min(n, Math.floor((width + gap) / (TILE_MIN + gap)))) : n;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ gap }}>
      {chunk(children, cols).map((row, i) => (
        <View key={i} style={{ flexDirection: "row", gap }}>
          {row}
          {Array.from({ length: cols - row.length }, (_, j) => (
            <View key={`pad${j}`} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </View>
  );
}

export function TopBar({ theme, layout, title, badge, subtitle, children }: { theme: PluginTheme; layout: PluginScreenProps["layout"]; title: string; badge?: string; subtitle: string; children?: ReactNode }) {
  const s = useStyles(theme);
  return (
    // Phones stack the actions under the subtitle, which beside them wrapped to a narrow column.
    <View style={{ flexDirection: layout.compact ? "column" : "row", alignItems: layout.compact ? "stretch" : "center", gap: layout.compact ? 12 : 16, paddingHorizontal: layout.compact ? 16 : 32, paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }}>
      <View style={{ flex: layout.compact ? undefined : 1, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={[s.title, { fontSize: 20 }]}>{title}</Text>
          {badge ? <Badge theme={theme} label={badge} tone={theme.colors.statusWarning} /> : null}
        </View>
        <Text style={[s.small, { fontSize: 13 }]}>{subtitle}</Text>
      </View>
      {layout.compact && children ? <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>{children}</View> : children}
    </View>
  );
}

/**
 * Settings beside the preview, which sits on a sunken pane. Stacked in one scroll on compact screens and when the
 * dashboard is too narrow for both (desktop window beside the sidebar).
 */
export function Columns({ theme, layout, editor, preview }: { theme: PluginTheme; layout: PluginScreenProps["layout"]; editor: ReactNode; preview: ReactNode }) {
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

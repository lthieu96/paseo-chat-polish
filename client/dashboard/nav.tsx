// The dashboard's sidebar: its pages, the restyle switch and the update card.
import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { Prefs } from "../../shared/timeline";
import { applyUpdate, checkUpdate, type UpdateStatus } from "../../shared/update";
import { Icon } from "../icons";
import { APP_ICON } from "../mark";
import { alpha, PMONO, useReducedMotion, useStyles } from "../views";
import { canSetAppTheme } from "../web";
import { SQUIRCLE_CARD, Switch } from "./controls";

export type Page = "theme" | "messages" | "steps" | "rich" | "html";

export const PAGES: Array<{ id: Page; icon: string; label: string; group: string; badge?: string }> = [
  { id: "theme", icon: "Palette", label: "Theme", group: "APPEARANCE" },
  { id: "messages", icon: "MessageSquareText", label: "Messages", group: "CHAT" },
  { id: "steps", icon: "ListTree", label: "Steps", group: "CHAT" },
  { id: "rich", icon: "Type", label: "Rich text", group: "CHAT" },
  { id: "html", icon: "AppWindow", label: "HTML pages", group: "CHAT", badge: "Experimental" },
];

/** The switch for restyling Paseo's own items; it gates Rich text and the loaders, so it sits outside any one page. */
export function RestyleCard({ theme, prefs, onChange }: { theme: PluginTheme; prefs: Prefs; onChange(p: Prefs): void }) {
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

export function InnerNav({ theme, host, page, prefs, onSelect, onPrefs }: { theme: PluginTheme; host: string; page: Page; prefs: Prefs; onSelect(p: Page): void; onPrefs(p: Prefs): void }) {
  const s = useStyles(theme);
  const c = theme.colors;
  const item = ({ id, icon, label, badge }: (typeof PAGES)[number]) => {
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
        {/* The full tag would wrap the label in this column; the page's own header spells it out. */}
        {badge ? <Icon name="FlaskConical" size={14} color={c.statusWarning} /> : null}
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

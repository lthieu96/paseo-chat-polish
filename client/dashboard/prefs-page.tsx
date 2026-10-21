// A settings page: its editor beside the preview that page needs, saving as you pick.
import { useSettings, type PluginScreenProps } from "@getpaseo/plugin/client";
import { useEffect } from "react";
import { Text, View } from "react-native";
import { themeSchema } from "../../shared/theme";
import { prefsSettings, type Prefs } from "../../shared/timeline";
import { Icon } from "../icons";
import { setPrefs, usePrefs } from "../prefs";
import { useCurrentTheme } from "../theme-registry";
import { useStyles } from "../views";
import { Button, Columns, TopBar } from "./controls";
import { PAGES, type Page } from "./nav";
import { PrefsEditor } from "./prefs-editor";
import { HtmlPreview, Preview } from "./preview";
import { RichPreview } from "./rich-preview";

const PAGE_SUBTITLES: Record<Exclude<Page, "theme">, string> = {
  messages: "Your messages, images in replies and the working indicator.",
  steps: "The thoughts and tool calls between two replies.",
  rich: "One style per markdown element in replies. Click a tile to switch.",
  html: "Charts, tables, simulations and mockups agents draw in the chat when you ask.",
};

/** Timeline prefs save as you pick; open chats pick them up for new rows. */
export function PrefsPage({ theme, layout, page, settings, change }: Pick<PluginScreenProps, "theme" | "layout"> & { page: Exclude<Page, "theme">; settings: ReturnType<typeof usePrefsSettings>["settings"]; change(p: Prefs): void }) {
  const prefs = usePrefs();
  const draft = useCurrentTheme() ?? themeSchema.parse({});
  const defaults = prefsSettings.schema.parse({});
  const isDefault = JSON.stringify(prefs) === JSON.stringify(defaults);
  const c = theme.colors;
  const s = useStyles(theme);
  const failed = !!settings.saveError;
  const status = failed ? `Save failed: ${String(settings.saveError)}` : settings.saving ? "Saving…" : "Saved automatically";
  const PagePreview = page === "rich" ? RichPreview : page === "html" ? HtmlPreview : Preview;
  return (
    <>
      <TopBar theme={theme} layout={layout} title={PAGES.find((p) => p.id === page)!.label} badge={PAGES.find((p) => p.id === page)!.badge} subtitle={PAGE_SUBTITLES[page]}>
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
export function usePrefsSettings() {
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

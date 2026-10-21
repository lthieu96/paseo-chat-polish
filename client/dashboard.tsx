import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useState } from "react";
import { View } from "react-native";
import { Segmented } from "./dashboard/controls";
import { InnerNav, PAGES, RestyleCard, type Page } from "./dashboard/nav";
import { PrefsPage, usePrefsSettings } from "./dashboard/prefs-page";
import { ThemePage } from "./dashboard/theme-page";
import { usePrefs } from "./prefs";
import { canSetAppTheme } from "./web";

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

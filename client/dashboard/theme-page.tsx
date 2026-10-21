// The Theme page: the editor beside a live preview, saving the theme and switching Paseo's app theme to it.
import { useSettings, type PluginScreenProps } from "@getpaseo/plugin/client";
import { useEffect, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { THEME_CATALOG_ID, themeSettings, type ThemeDraft } from "../../shared/theme";
import { Icon } from "../icons";
import { usePrefs } from "../prefs";
import { registerTheme } from "../theme-registry";
import { useStyles } from "../views";
import { canSetAppTheme, readHostAppearance, setAppTheme, updateAppSettings } from "../web";
import { Button, Columns, TopBar } from "./controls";
import { PASEO_THEMES, paseoDraft } from "./paseo-themes";
import { Preview } from "./preview";
import { Editor, type Typography } from "./theme-editor";

export function ThemePage({ theme, layout }: Pick<PluginScreenProps, "theme" | "layout">) {
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

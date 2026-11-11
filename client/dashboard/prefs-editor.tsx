// The settings on the Messages, Steps, Tool calls, Rich text, HTML pages and Extras pages.
import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { useEffect, useState, type CSSProperties } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { browserStatus, installBrowser, removeBrowser, type BrowserStatus } from "../../shared/html";
import type { MessageKey } from "../../shared/i18n";
import { HIDEABLE, ICON_KINDS, LOADERS, RICH_TEXT, type Hideable, type IconKind, type Loader, type Prefs, type RichText } from "../../shared/timeline";
import { useT } from "../i18n";
import { useReducedMotion, useStyles } from "../views";
import { canSetAppTheme, readHostAppearance, readSyntaxTheme, updateAppSettings } from "../web";
import { Button, Chip, Grid, Group, Legend, Notice, Row, Segmented, Switch } from "./controls";
import { RICH_DRAWINGS } from "./drawings";
import type { Page } from "./nav";

const HIDEABLE_LABELS: Record<Hideable, MessageKey> = { read: "prefs.hideable.read", search: "prefs.hideable.search", fetch: "prefs.hideable.fetch", task: "prefs.hideable.task", todo: "prefs.hideable.todo" };

const ICON_LABELS: Record<IconKind, MessageKey> = { steps: "prefs.iconKind.steps", tool: "prefs.iconKind.tool", thought: "prefs.iconKind.thought" };

/** Titles and tile labels for each rich text variant, from the "Rich Text — Style Variants" design. */
const RICH_TEXT_OPTIONS: Record<RichText, { title: MessageKey; options: MessageKey[] }> = {
  quote: { title: "prefs.rich.quote", options: ["prefs.richQuote.a", "prefs.richQuote.b", "prefs.richQuote.c"] },
  table: { title: "prefs.rich.table", options: ["prefs.richTable.a", "prefs.richTable.b", "prefs.richTable.c", "prefs.richTable.d"] },
  code: { title: "prefs.rich.code", options: ["prefs.richCode.a", "prefs.richCode.b", "prefs.richCode.c"] },
  inline: { title: "prefs.rich.inline", options: ["prefs.richInline.a", "prefs.richInline.b", "prefs.richInline.c"] },
  heading: { title: "prefs.rich.heading", options: ["prefs.richHeading.a", "prefs.richHeading.b", "prefs.richHeading.c"] },
  list: { title: "prefs.rich.list", options: ["prefs.richList.a", "prefs.richList.b", "prefs.richList.c"] },
  callout: { title: "prefs.rich.callout", options: ["prefs.richCallout.a", "prefs.richCallout.b", "prefs.richCallout.c"] },
  rule: { title: "prefs.rich.rule", options: ["prefs.richRule.a", "prefs.richRule.b", "prefs.richRule.c"] },
};

const LOADER_LABELS: Record<Loader, MessageKey> = { dots: "prefs.loader.dots", sparkle: "prefs.loader.sparkle", spokes: "prefs.loader.spokes", dotring: "prefs.loader.dotring", orb: "prefs.loader.orb", matrix: "prefs.loader.matrix", snake: "prefs.loader.snake" };

/** One loader running for real: the timeline's overlay (css in web/restyle-css.ts) scoped to this tile instead of the whole page. */
function LoaderTile({ theme, id, on, onPress }: { theme: PluginTheme; id: Loader; on: boolean; onPress(): void }) {
  const s = useStyles(theme);
  const t = useT();
  const reducedMotion = useReducedMotion();
  const c = theme.colors;
  const vars = { "--cp-fg": c.foreground, "--cp-accent": c.accent, "--cp-mono": "ui-monospace, Menlo, monospace" } as CSSProperties;
  const dot = 10 / 3;
  const box: CSSProperties = { position: "relative", width: 14, height: 14, transform: "scale(1.7)", ...vars };
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={t(LOADER_LABELS[id])}
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
      <Text style={[s.small, { fontSize: 12, color: on ? c.foreground : c.foregroundMuted }]}>{t(LOADER_LABELS[id])}</Text>
    </Pressable>
  );
}

// What a user does with html_render pages, in the order they meet it.
const HTML_GUIDE: Array<[MessageKey, MessageKey]> = [
  ["prefs.guide.ask.title", "prefs.guide.ask.text"],
  ["prefs.guide.mermaid.title", "prefs.guide.mermaid.text"],
  ["prefs.guide.use.title", "prefs.guide.use.text"],
  ["prefs.guide.later.title", "prefs.guide.later.text"],
];

const mb = (bytes: number) => Math.round(bytes / 1e6);

/**
 * The switch for the tools, and the headless browser pages are checked in before they show: optional, so HTML pages work without it
 * (unchecked, and no html_preview). Download shows its progress, polled while it runs; Remove deletes it.
 */
function HtmlSwitch({ theme, prefs, onChange }: { theme: PluginTheme; prefs: Prefs; onChange(p: Prefs): void }) {
  const s = useStyles(theme);
  const c = theme.colors;
  const t = useT();
  const read = useRpc(browserStatus);
  const install = useRpc(installBrowser);
  const remove = useRpc(removeBrowser);
  const [status, setStatus] = useState<BrowserStatus>();
  const [error, setError] = useState<string>();
  // Shown, with Refresh, until a call succeeds; a failed poll stops polling rather than retrying behind the user's back.
  const failed = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
  const done = (next: BrowserStatus) => {
    setError(undefined);
    setStatus(next);
  };
  useEffect(() => void read({}).then(done, failed), [read]);
  useEffect(() => {
    if (status?.state !== "downloading" || error) return;
    const timer = setTimeout(() => read({}).then(done, failed), 500);
    return () => clearTimeout(timer);
  }, [status, error, read]);
  const browserHint = error
    ? error
    : !status
      ? t("prefs.browser.checking")
      : {
          installed: t("prefs.browser.installed", { version: status.version ?? "" }),
          downloading:
            status.total && status.received === status.total
              ? t("prefs.browser.unpacking")
              : t("prefs.browser.downloading", {
                  received: mb(status.received ?? 0),
                  total: status.total ? t("prefs.browser.downloadingTotal", { total: mb(status.total) }) : "",
                }),
          missing: t("prefs.browser.missing"),
          failed: t("prefs.browser.failed", { error: status.error ?? "" }),
          unsupported: t("prefs.browser.unsupported"),
        }[status.state];
  const percent = status?.total ? Math.floor(((status.received ?? 0) / status.total) * 100) : undefined;
  return (
    <>
      <Row theme={theme} first label={t("prefs.row.htmlPages")} hint={t("prefs.hint.htmlPages")}>
        <Switch theme={theme} label={t("prefs.row.htmlPages")} value={prefs.html === "on"} onChange={(on) => onChange({ ...prefs, html: on ? "on" : "off" })} />
      </Row>
      <Row theme={theme} label={t("prefs.row.headlessBrowser")} hint={browserHint}>
        {error ? (
          <Button theme={theme} icon="RotateCw" label={t("prefs.button.refresh")} onPress={() => void read({}).then(done, failed)} />
        ) : status?.state === "downloading" ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <ActivityIndicator size="small" color={c.accent} />
            {percent !== undefined ? <Text style={[s.small, { fontSize: 12, fontVariant: ["tabular-nums"] }]}>{`${percent}%`}</Text> : null}
          </View>
        ) : status?.state === "installed" ? (
          <Button theme={theme} icon="Trash2" label={t("prefs.button.remove")} onPress={() => void remove({}).then(done, failed)} />
        ) : status?.state === "missing" || status?.state === "failed" ? (
          <Button theme={theme} icon={status.state === "failed" ? "RotateCw" : "ArrowDownToLine"} label={status.state === "failed" ? t("prefs.button.retry") : t("prefs.button.download")} onPress={() => void install({}).then(done, failed)} />
        ) : null}
      </Row>
    </>
  );
}

/** The HTML pages page: the switch for the tools, then how to use them. */
function HtmlGuide({ theme, prefs, onChange }: { theme: PluginTheme; prefs: Prefs; onChange(p: Prefs): void }) {
  const s = useStyles(theme);
  const t = useT();
  return (
    <View style={{ gap: 24 }}>
      <Group theme={theme} title={t("prefs.group.htmlTool")}>
        <HtmlSwitch theme={theme} prefs={prefs} onChange={onChange} />
      </Group>
      <Group theme={theme} title={t("prefs.group.howToUse")}>
        {HTML_GUIDE.map(([title, text], i) => (
          <View key={title} style={{ flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: theme.colors.border }}>
            <Text style={[s.verb, { fontSize: 13, width: 14, color: theme.colors.foregroundMuted, fontVariant: ["tabular-nums"] }]}>{i + 1}</Text>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[s.verb, { fontSize: 13 }]}>{t(title)}</Text>
              <Text style={[s.small, { fontSize: 12, lineHeight: 17 }]}>{t(text)}</Text>
            </View>
          </View>
        ))}
      </Group>
      <Notice theme={theme}>{t("prefs.notice.openInBrowser")}</Notice>
    </View>
  );
}

/** Settings for one page: grouped cards (Messages, Steps), a tile picker per markdown element (Rich text) or the HTML pages guide. */
export function PrefsEditor({ theme, page, prefs, onChange }: { theme: PluginTheme; page: Exclude<Page, "theme">; prefs: Prefs; onChange(p: Prefs): void }) {
  const set = <K extends keyof Prefs>(key: K) => (value: Prefs[K]) => onChange({ ...prefs, [key]: value });
  const s = useStyles(theme);
  const c = theme.colors;
  const t = useT();
  if (page === "general") {
    return (
      <View style={{ gap: 24 }}>
        <Group theme={theme} title={t("general.group.language")}>
          <Row theme={theme} first label={t("general.language.label")} hint={t("general.language.hint")}>
            <Segmented
              theme={theme}
              value={prefs.language}
              onChange={set("language")}
              options={[
                ["en", "", t("general.language.en")],
                ["zh", "", t("general.language.zh")],
              ]}
            />
          </Row>
        </Group>
        <Notice theme={theme}>{t("general.language.note")}</Notice>
      </View>
    );
  }
  if (page === "html") return <HtmlGuide theme={theme} prefs={prefs} onChange={onChange} />;
  if (page === "messages") {
    const paseoSyntax = readSyntaxTheme();
    return (
      <View style={{ gap: 24 }}>
        <Group theme={theme} title={t("prefs.group.spacing")}>
          <Row theme={theme} first label={t("prefs.row.density")} hint={t("prefs.hint.density")}>
            <Segmented
              theme={theme}
              value={prefs.density}
              onChange={set("density")}
              options={[
                ["compact", "", t("prefs.density.compact")],
                ["normal", "", t("prefs.density.normal")],
                ["spacious", "", t("prefs.density.spacious")],
              ]}
            />
          </Row>
        </Group>
        {/* These change Paseo's own icons, replies and bubbles, which native apps draw without a DOM to restyle. */}
        {canSetAppTheme ? (
          <>
            <Group theme={theme} title={t("prefs.group.icons")}>
              <Row theme={theme} first stacked label={t("prefs.row.iconSet")} hint={t("prefs.hint.iconSet")}>
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
            <Group theme={theme} title={t("prefs.group.replies")}>
              <Row theme={theme} first label={t("prefs.row.copyPopup")} hint={t("prefs.hint.copyPopup")}>
                <Switch theme={theme} label={t("prefs.row.copyPopup")} value={prefs.selectionCopy === "on"} onChange={(on) => set("selectionCopy")(on ? "on" : "off")} />
              </Row>
            </Group>
            <Group theme={theme} title={t("prefs.group.userMessages")}>
              <Row theme={theme} first label={t("prefs.row.longMessages")} hint={t("prefs.hint.longMessages")}>
                <Segmented
                  theme={theme}
                  value={prefs.userMessages}
                  onChange={set("userMessages")}
                  options={[
                    ["clamp", "", t("prefs.option.clamp")],
                    ["full", "", t("prefs.option.full"), true],
                  ]}
                />
              </Row>
            </Group>
          </>
        ) : null}
        <Group theme={theme} title={t("prefs.group.images")}>
          <Row theme={theme} first label={t("prefs.row.imageOnly")} hint={t("prefs.hint.imageOnly")}>
            <Segmented
              theme={theme}
              value={prefs.images}
              onChange={set("images")}
              options={[
                ["small", "", t("prefs.option.small")],
                ["large", "", t("prefs.option.large")],
                ["xlarge", "", t("prefs.option.xlarge")],
                ["native", "", t("prefs.option.inline"), true],
              ]}
            />
          </Row>
          <Row theme={theme} label={t("prefs.row.imageStacks")} hint={t("prefs.hint.imageStacks")}>
            <Switch theme={theme} label={t("prefs.row.imageStacks")} value={prefs.imageStacks === "on"} onChange={(on) => set("imageStacks")(on ? "on" : "off")} />
          </Row>
          {prefs.imageStacks === "on" ? (
            <Row theme={theme} label={t("prefs.row.spreadOn")} hint={t("prefs.hint.spreadOn")}>
              <Segmented
                theme={theme}
                value={prefs.imageStackOpen}
                onChange={set("imageStackOpen")}
                options={[
                  ["hover", "", t("prefs.option.hover")],
                  ["click", "", t("prefs.option.click")],
                ]}
              />
            </Row>
          ) : null}
        </Group>
        {canSetAppTheme ? (
          <Group theme={theme} title={t("prefs.group.working")}>
            <Row theme={theme} first stacked label={t("prefs.row.loader")} hint={t("prefs.hint.loader")}>
              {prefs.nativeStyle === "paseo" ? (
                <Notice theme={theme}>{t("prefs.notice.loaders")}</Notice>
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
            <Row theme={theme} label={t("prefs.row.size")} hint={t("prefs.hint.size")}>
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
          <Notice theme={theme} action={paseoSyntax === "one" ? null : <Button theme={theme} label={t("prefs.button.useOne")} icon="Code" onPress={() => updateAppSettings({ syntaxTheme: "one" })} />}>
            {paseoSyntax === "one" ? t("prefs.notice.syntaxOne") : t("prefs.notice.syntaxOther", { name: paseoSyntax })}
          </Notice>
        ) : (
          <Notice theme={theme}>{t("prefs.notice.nativeText")}</Notice>
        )}
        <Legend theme={theme} />
      </View>
    );
  }
  if (page === "steps") {
    const paseo = readHostAppearance().autoExpandReasoning;
    return (
      <View style={{ gap: 24 }}>
        <Group
          theme={theme}
          title={t("prefs.group.layout")}
          top={
            readHostAppearance().chatDisplay === "collapseTurns" ? (
              <Notice theme={theme}>{t("prefs.notice.collapseTurns")}</Notice>
            ) : null
          }
        >
          <Row theme={theme} first label={t("prefs.row.merge")} hint={t("prefs.hint.merge")}>
            <Switch theme={theme} label={t("prefs.row.merge")} value={prefs.merge === "on"} onChange={(on) => set("merge")(on ? "on" : "off")} />
          </Row>
          <Row theme={theme} label={t("prefs.row.strength")} hint={t("prefs.hint.strength")}>
            <Segmented
              theme={theme}
              value={prefs.steps}
              onChange={set("steps")}
              options={[
                ["dim", "", "30%"],
                ["faded", "", "45%"],
                ["soft", "", "65%"],
                ["full", "", t("prefs.strength.full"), true],
              ]}
            />
          </Row>
          <Row theme={theme} stacked label={t("prefs.row.rowIcons")} hint={t("prefs.hint.rowIcons")}>
            {ICON_KINDS.map((k) => {
              const shown = prefs.rowIcons[k] === "show";
              return <Chip key={k} theme={theme} on={shown} label={t(ICON_LABELS[k])} onPress={() => onChange({ ...prefs, rowIcons: { ...prefs.rowIcons, [k]: shown ? "hide" : "show" } })} />;
            })}
          </Row>
        </Group>
        <Group theme={theme} title={t("prefs.group.reasoning")}>
          <Row theme={theme} first stacked label={t("prefs.row.startsAs")} hint={t("prefs.hint.startsAs", { state: paseo ? t("prefs.state.on") : t("prefs.state.off") })}>
            <Segmented
              theme={theme}
              value={prefs.reasoning}
              onChange={set("reasoning")}
              options={[
                ["paseo", "", "Paseo", true],
                ["collapsed", "", t("prefs.option.collapsed")],
                ["expanded", "", t("prefs.option.expanded")],
              ]}
            />
          </Row>
        </Group>
        <Group
          theme={theme}
          title={t("prefs.group.toolCalls")}
          top={
            readHostAppearance().chatDisplay !== "full" ? (
              <Notice theme={theme}>{t("prefs.notice.collapsedTools")}</Notice>
            ) : null
          }
        >
          <Row theme={theme} first label={t("prefs.row.openDetails")} hint={t("prefs.hint.openDetails")}>
            <Segmented
              theme={theme}
              value={prefs.toolDetails}
              onChange={set("toolDetails")}
              options={[
                ["collapsed", "", t("prefs.option.none"), true],
                ["failed", "", t("prefs.option.failures")],
                ["expanded", "", t("prefs.option.all")],
              ]}
            />
          </Row>
          <Row theme={theme} label={t("prefs.row.commandColors")} hint={t("prefs.hint.commandColors")}>
            <Segmented
              theme={theme}
              value={prefs.commandColors}
              onChange={set("commandColors")}
              options={[
                ["expanded", "", t("prefs.option.whenOpen"), true],
                ["always", "", t("prefs.option.always")],
              ]}
            />
          </Row>
          <Row theme={theme} label={t("prefs.row.diffWrap")} hint={t("prefs.hint.diffWrap")}>
            <Switch theme={theme} label={t("prefs.row.diffWrap")} value={prefs.diffWrap === "on"} onChange={(on) => set("diffWrap")(on ? "on" : "off")} />
          </Row>
          <Row theme={theme} stacked label={t("prefs.row.showInTimeline")} hint={t("prefs.hint.showInTimeline")}>
            {HIDEABLE.map((k) => {
              const shown = !prefs.hidden.includes(k);
              return <Chip key={k} theme={theme} on={shown} label={t(HIDEABLE_LABELS[k])} onPress={() => onChange({ ...prefs, hidden: shown ? [...prefs.hidden, k] : prefs.hidden.filter((h) => h !== k) })} />;
            })}
          </Row>
        </Group>
        <Group theme={theme} title={t("prefs.group.phones")}>
          <Row theme={theme} first label={t("prefs.row.phoneChat")} hint={t("prefs.hint.phoneChat")}>
            <Switch theme={theme} label={t("prefs.switch.phoneChat")} value={prefs.phoneChat === "on"} onChange={(on) => set("phoneChat")(on ? "on" : "off")} />
          </Row>
        </Group>
        <Legend theme={theme} />
      </View>
    );
  }
  return (
    <View style={{ gap: 20 }}>
      {prefs.nativeStyle === "paseo" ? <Notice theme={theme}>{t("prefs.notice.restyleOff")}</Notice> : null}
      {RICH_TEXT.map((k) => (
        <View key={k} style={{ gap: 8 }}>
          <Text style={[s.verb, { fontSize: 13 }]}>{t(RICH_TEXT_OPTIONS[k].title)}</Text>
          <Grid n={k === "table" ? 4 : 3}>
            {RICH_TEXT_OPTIONS[k].options.map((label, j) => {
              const id = (["a", "b", "c", "d"] as const)[j]!;
              const on = prefs.richText[k] === id;
              const text = t(label);
              return (
                <Pressable key={id} accessibilityRole="radio" accessibilityLabel={text} accessibilityState={{ checked: on }} onPress={() => onChange({ ...prefs, richText: { ...prefs.richText, [k]: id } })} style={{ flex: 1, gap: 6 }}>
                  <View style={{ height: 52, paddingHorizontal: 10, justifyContent: "center", alignItems: "flex-start", borderRadius: 8, backgroundColor: c.surface0, borderWidth: on ? 1.5 : StyleSheet.hairlineWidth, borderColor: on ? c.accent : c.border }}>{RICH_DRAWINGS[k][j]!(c)}</View>
                  <Text style={[s.small, { fontSize: 12, color: on ? c.foreground : c.foregroundMuted, fontWeight: on ? "500" : "400" }]} numberOfLines={1}>
                    {text}
                  </Text>
                </Pressable>
              );
            })}
          </Grid>
        </View>
      ))}
      <Group theme={theme} title={t("prefs.group.diagrams")}>
        <Row theme={theme} first label={t("prefs.row.renderer")} hint={t("prefs.hint.renderer")}>
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

// The settings on the Messages, Steps, Tool calls, Rich text, HTML pages and Extras pages.
import type { PluginTheme } from "@getpaseo/plugin";
import type { CSSProperties } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { HIDEABLE, ICON_KINDS, LOADERS, RICH_TEXT, type Hideable, type IconKind, type Loader, type Prefs, type RichText } from "../../shared/timeline";
import { useReducedMotion, useStyles } from "../views";
import { canSetAppTheme, readHostAppearance, readSyntaxTheme, updateAppSettings } from "../web";
import { Button, Chip, Grid, Group, Legend, Notice, Row, Segmented, Switch } from "./controls";
import { RICH_DRAWINGS } from "./drawings";
import type { Page } from "./nav";

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

/** One loader running for real: the timeline's overlay (css in web/restyle-css.ts) scoped to this tile instead of the whole page. */
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

// What a user does with html_render pages, in the order they meet it.
const HTML_GUIDE: Array<[string, string]> = [
  ["Ask for a visual", "Ask the agent to draw, chart, visualize, simulate or mock up something, in any language. Other questions get a text answer, so pages are only made when you ask. If Chrome, Edge or Brave is installed, each page is laid out there first and the agent fixes overlapping text, script errors or overflow before you see it."],
  ["Diagrams come as mermaid", "Flowcharts and sequence diagrams are drawn by the chat from a mermaid block, which lays them out better and costs less than a page."],
  ["Use the page", "Hover it for Full screen (Esc closes), Open in browser and Copy HTML. Links open in your browser and app shortcuts keep working. Its scripts run in a sandbox, away from Paseo and your files."],
  ["Find it later", "Pages are kept with the chat and show again, in the current theme, when you reopen it. Desktop and web; phones show the page's title."],
];

/** The HTML pages page: the switch for the tool, then how to use it. */
function HtmlGuide({ theme, prefs, onChange }: { theme: PluginTheme; prefs: Prefs; onChange(p: Prefs): void }) {
  const s = useStyles(theme);
  return (
    <View style={{ gap: 24 }}>
      <Group theme={theme} title="Tool">
        <Row theme={theme} first label="HTML pages" hint="Off by default. Gives agents created from now on the html_render tool; existing agents keep the tools they started with.">
          <Switch theme={theme} label="HTML pages" value={prefs.html === "on"} onChange={(on) => onChange({ ...prefs, html: on ? "on" : "off" })} />
        </Row>
      </Group>
      <Group theme={theme} title="How to use">
        {HTML_GUIDE.map(([title, text], i) => (
          <View key={title} style={{ flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: theme.colors.border }}>
            <Text style={[s.verb, { fontSize: 13, width: 14, color: theme.colors.foregroundMuted, fontVariant: ["tabular-nums"] }]}>{i + 1}</Text>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[s.verb, { fontSize: 13 }]}>{title}</Text>
              <Text style={[s.small, { fontSize: 12, lineHeight: 17 }]}>{text}</Text>
            </View>
          </View>
        ))}
      </Group>
      <Notice theme={theme}>Open in browser serves the page from the computer running Paseo's daemon (127.0.0.1), so it works when that is this computer.</Notice>
    </View>
  );
}

/** Settings for one page: grouped cards (Messages, Steps), a tile picker per markdown element (Rich text) or the HTML pages guide. */
export function PrefsEditor({ theme, page, prefs, onChange }: { theme: PluginTheme; page: Exclude<Page, "theme">; prefs: Prefs; onChange(p: Prefs): void }) {
  const set = <K extends keyof Prefs>(key: K) => (value: Prefs[K]) => onChange({ ...prefs, [key]: value });
  const s = useStyles(theme);
  const c = theme.colors;
  if (page === "html") return <HtmlGuide theme={theme} prefs={prefs} onChange={onChange} />;
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

// The Rich text page's preview: a reply using every markdown element, and a diagram.
import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";
import type { ThemeDraft } from "../../shared/theme";
import type { Prefs } from "../../shared/timeline";
import { Icon } from "../icons";
import { alpha, PMONO, sunken, useStyles } from "../views";
import { diagramDoc, drawDiagram, loadMermaidDoc } from "../web";
import { InlineCode, MockChat, PreviewHead, previewTheme, type Viewport } from "./preview";
import { SAMPLE_CODE, SAMPLE_DIAGRAM, SAMPLE_TABLE } from "./samples";

/** The sample reply's diagram, drawn the way chats draw it (desktop and web, with the restyle on). */
function DiagramSample({ theme, pele }: { theme: PluginTheme; pele: boolean }) {
  const s = useStyles(theme);
  const c = theme.colors;
  const [frame, setFrame] = useState<unknown>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [failed, setFailed] = useState(false);
  // Paseo's mermaid: undefined while it loads, null if it can't be found.
  const [mermaid, setMermaid] = useState<string | null | undefined>(() => diagramDoc(false));
  useEffect(() => {
    if (pele || mermaid !== undefined) return;
    let live = true;
    void loadMermaidDoc().then((doc) => live && setMermaid(doc ?? null));
    return () => {
      live = false;
    };
  }, [pele, mermaid]);
  const doc = pele ? diagramDoc(true) : (mermaid ?? undefined);
  // The drawing takes the applied app theme's colors (not an unapplied draft), so a theme change draws it again.
  const key = `${pele}:${Object.values(c).join()}`;
  useEffect(() => {
    setSize(null);
    setFailed(false);
  }, [key]);
  // A failed drawing unmounts the frame, which leaves it failed rather than drawing again.
  useEffect(() => (frame ? drawDiagram(frame, SAMPLE_DIAGRAM, (drawn) => (drawn ? setSize(drawn) : setFailed(true))) : undefined), [frame]);
  const note = failed ? "Couldn't draw the diagram." : doc ? null : mermaid === null ? "Couldn't find Paseo's mermaid in this version of Paseo." : "Loading Paseo's mermaid…";
  return (
    <View style={{ padding: 12, borderRadius: 8, backgroundColor: sunken(c.surface0), borderWidth: 1, borderColor: alpha(c.border, 0.6), alignItems: "center" }}>
      {note ? (
        <Text style={[s.small, { fontSize: 12, paddingVertical: 24 }]}>{note}</Text>
      ) : (
        <iframe
          key={key}
          ref={setFrame}
          title="Diagram preview"
          sandbox="allow-scripts"
          srcDoc={doc}
          style={{ display: "block", border: 0, width: "100%", pointerEvents: "none", background: "transparent", ...(size ? { maxWidth: size.width, aspectRatio: `${size.width} / ${size.height}` } : { height: 120, opacity: 0 }) }}
        />
      )}
    </View>
  );
}

function RichSample({ theme, rt, pele }: { theme: PluginTheme; rt: Prefs["richText"]; pele?: boolean }) {
  const s = useStyles(theme);
  const c = theme.colors;
  const rule = alpha(c.border, 0.6);
  const prose = [s.prose, { color: c.foreground }];
  const muted = [s.prose, { color: c.foregroundMuted }];

  const heading = (level: 1 | 2 | 3, text: string) => {
    if (rt.heading === "b") {
      const size = [18, 15, 12][level - 1]!;
      return <Text style={[s.title, { fontSize: size, color: level === 3 ? c.foregroundMuted : c.foreground, ...(level === 3 ? { textTransform: "uppercase", letterSpacing: 0.7 } : {}), ...(level === 1 ? { paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: rule } : {}) }]}>{text}</Text>;
    }
    const title = <Text style={[s.title, { fontSize: [24, 20, 16][level - 1]! }]}>{text}</Text>;
    if (rt.heading === "a") return title;
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {level < 3 ? <View style={{ width: 3, alignSelf: "stretch", borderRadius: 2, backgroundColor: c.accent }} /> : <Text {...PMONO} style={[s.code, { color: c.foregroundMuted }]}>###</Text>}
        {title}
      </View>
    );
  };

  const quote = (() => {
    const text = "Never read the token before refresh() runs — it may already be rotated.";
    if (rt.quote === "b")
      return (
        <View style={{ flexDirection: "row", gap: 10, padding: 12, borderRadius: 8, backgroundColor: c.surface1 }}>
          <Text style={[s.title, { fontSize: 20, lineHeight: 22, color: c.accent }]}>“</Text>
          <Text style={[prose, { flex: 1 }]}>{text}</Text>
        </View>
      );
    return (
      <View style={rt.quote === "a" ? { borderLeftWidth: 2, borderLeftColor: c.accent, paddingLeft: 14 } : { paddingLeft: 20 }}>
        <Text style={[muted, { fontStyle: "italic" }]}>{text}</Text>
      </View>
    );
  })();

  const callout = (tone: string, icon: string, label: string, text: string) => {
    if (rt.callout === "b")
      return (
        <View key={label} style={{ borderLeftWidth: 2, borderLeftColor: tone, paddingLeft: 14, gap: 2 }}>
          <Text style={[s.small, { fontSize: 11, fontWeight: "600", letterSpacing: 0.7, color: tone }]}>{label.toUpperCase()}</Text>
          <Text style={prose}>{text}</Text>
        </View>
      );
    if (rt.callout === "c")
      return (
        <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name={icon} size={14} color={tone} />
          <Text style={[prose, { flex: 1 }]}>
            <Text style={{ color: tone, fontWeight: "600" }}>{label} — </Text>
            {text}
          </Text>
        </View>
      );
    return (
      <View key={label} style={{ flexDirection: "row", gap: 10, padding: 12, borderRadius: 8, backgroundColor: alpha(tone, 0.12) }}>
        <Icon name={icon} size={14} color={tone} />
        <View style={{ flex: 1, gap: 2, marginTop: -3 }}>
          <Text style={[s.title, { fontSize: 13, color: tone }]}>{label}</Text>
          <Text style={prose}>{text}</Text>
        </View>
      </View>
    );
  };

  const marker = (ordered: number | undefined) => {
    const text = rt.list === "c" ? "·" : ordered ? (rt.list === "b" ? `${ordered})` : `${ordered}.`) : rt.list === "b" ? "–" : "•";
    return <Text {...(ordered && rt.list !== "c" ? PMONO : null)} style={[ordered && rt.list !== "c" ? s.code : s.prose, { width: 20, color: c.foregroundMuted, fontWeight: rt.list === "c" ? "700" : "400" }]}>{text}</Text>;
  };
  const listItem = (text: string, ordered?: number, nested?: boolean) => (
    <View key={text} style={{ flexDirection: "row", alignItems: "baseline", paddingLeft: nested ? 22 : 0 }}>
      {marker(ordered)}
      <Text style={prose}>{text}</Text>
    </View>
  );
  const task = (text: string, done: boolean) => {
    const icon = rt.list === "b" ? (done ? "CircleCheck" : "Circle") : done ? "SquareCheck" : "Square";
    const tone = !done ? c.foregroundMuted : rt.list === "b" ? c.statusSuccess : rt.list === "c" ? c.foregroundMuted : c.accent;
    return (
      <View key={text} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: rt.list === "c" ? 26 : undefined }}>
        <Icon name={icon} size={15} color={tone} />
        <Text style={[prose, done && rt.list === "c" ? { color: c.foregroundMuted } : null]}>{text}</Text>
      </View>
    );
  };

  const divider =
    rt.rule === "b" ? (
      <Text style={[s.small, { textAlign: "center", letterSpacing: 3 }]}>• • •</Text>
    ) : (
      <View style={{ height: 1, width: rt.rule === "c" ? 48 : "100%", backgroundColor: rt.rule === "c" ? c.border : rule }} />
    );

  const widths = [3, 2, 0.6, 0.6];
  const bordered = rt.table === "a" || rt.table === "d";
  const grid = rt.table === "d";
  const cell = (text: string, i: number, head: boolean) => (
    <Text
      key={i}
      numberOfLines={1}
      {...(head ? null : PMONO)}
      style={[
        head ? s.small : s.code,
        { flex: widths[i], fontSize: head ? 11 : undefined, fontWeight: head ? "600" : undefined, color: head ? c.foregroundMuted : i === 3 && text !== "0" ? c.statusDanger : c.foreground },
        grid ? { paddingHorizontal: 12, paddingVertical: 8, borderRightWidth: i < 3 ? 1 : 0, borderRightColor: rule } : null,
      ]}
    >
      {head ? text.toUpperCase() : text}
    </Text>
  );
  // Grid cells carry their own padding so the column rules run the full row height.
  const rowPad = grid ? { gap: 0 } : { gap: 12, paddingHorizontal: rt.table === "c" ? 0 : 12, paddingVertical: 8 };
  const table = (
    <View style={bordered ? { borderRadius: 8, borderWidth: 1, borderColor: rule, overflow: "hidden" } : { gap: rt.table === "b" ? 2 : 0 }}>
      <View style={{ flexDirection: "row", ...rowPad, backgroundColor: bordered ? c.surface1 : undefined, borderBottomWidth: rt.table === "b" ? 0 : 1, borderBottomColor: rule }}>
        {["File", "Change", "+", "-"].map((t, i) => cell(t, i, true))}
      </View>
      {SAMPLE_TABLE.map((row, r) => (
        <View
          key={row[0]}
          style={{ flexDirection: "row", ...rowPad, borderRadius: rt.table === "b" ? 6 : 0, backgroundColor: rt.table === "b" && r % 2 === 0 ? c.surface1 : undefined, borderTopWidth: bordered && r ? 1 : 0, borderTopColor: rule }}
        >
          {row.map((t, i) => cell(t, i, false))}
        </View>
      ))}
    </View>
  );

  const codeBody = (
    <View style={{ flexDirection: "row", gap: 12, padding: 12 }}>
      {rt.code === "c" ? (
        <View>
          {SAMPLE_CODE.map((_, i) => (
            <Text {...PMONO} key={i} style={[s.code, { color: c.foregroundMuted, opacity: 0.6, textAlign: "right" }]}>
              {i + 1}
            </Text>
          ))}
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        {SAMPLE_CODE.map((line) => (
          <Text {...PMONO} key={line} style={s.code}>
            {line}
          </Text>
        ))}
      </View>
      {rt.code === "b" ? <Text {...PMONO} style={[s.code, { fontSize: 11, color: alpha(c.foregroundMuted, 0.6) }]}>ts</Text> : null}
      {rt.code === "a" ? null : <Icon name="Copy" size={13} color={rt.code === "b" ? alpha(c.foregroundMuted, 0.4) : c.foregroundMuted} />}
    </View>
  );
  const codeBlock = (
    <View style={{ borderRadius: 8, backgroundColor: rt.code === "c" ? undefined : sunken(c.surface0), borderWidth: rt.code === "b" ? 0 : 1, borderColor: rule }}>
      {rt.code === "a" ? (
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: rule }}>
          <Text {...PMONO} style={[s.code, { flex: 1, fontSize: 12, color: c.foregroundMuted }]}>typescript</Text>
          <Icon name="Copy" size={13} color={c.foregroundMuted} />
        </View>
      ) : null}
      {codeBody}
    </View>
  );

  return (
    <View style={{ gap: 14 }}>
      {heading(1, "Auth middleware")}
      {heading(2, "What changed")}
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 5 }}>
        <Text style={prose}>Auth now lives in</Text>
        <InlineCode theme={theme} variant={rt.inline}>
          requireAuth
        </InlineCode>
        <Text style={prose}>and runs once.</Text>
      </View>
      {quote}
      {callout(c.accent, "Info", "Note", "Public routes opt out with skipAuth.")}
      {callout(c.statusWarning, "TriangleAlert", "Warning", "Tokens rotate on refresh; never cache them.")}
      {heading(3, "Routes")}
      <View style={{ gap: 6 }}>
        {listItem("Add requireAuth before the router", 1)}
        {listItem("Reads the rotated header", undefined, true)}
        {listItem("Delete the inline checks", 2)}
      </View>
      <View style={{ gap: 4 }}>
        {task("Middleware", true)}
        {task("Route cleanup", true)}
        {task("Docs", false)}
      </View>
      {divider}
      {table}
      {codeBlock}
      {pele === undefined ? null : <DiagramSample theme={theme} pele={pele} />}
    </View>
  );
}

export function RichPreview({ theme, draft, prefs, layout }: { theme: PluginTheme; draft: ThemeDraft; prefs: Prefs; layout: PluginScreenProps["layout"] }) {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const pt = previewTheme(draft, theme);
  return (
    <View style={{ gap: 14 }}>
      <PreviewHead theme={theme} layout={layout} viewport={viewport} setViewport={setViewport} />
      <MockChat theme={pt} layout={layout} viewport={viewport}>
        <RichSample theme={pt} rt={prefs.richText} pele={Platform.OS === "web" && prefs.nativeStyle === "design" ? prefs.diagrams === "pele" : undefined} />
      </MockChat>
    </View>
  );
}

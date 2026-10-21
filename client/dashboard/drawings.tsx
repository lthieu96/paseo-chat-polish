// The little drawings on the Rich text page's style tiles, one per variant.
import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactNode } from "react";
import { View, type DimensionValue } from "react-native";
import type { RichText } from "../../shared/timeline";
import { Icon } from "../icons";
import { alpha, sunken } from "../views";

type Colors = PluginTheme["colors"];

const bar = (w: DimensionValue, color: string, h = 3, key?: number) => <View key={key} style={{ width: w, height: h, borderRadius: 2, backgroundColor: color }} />;

const col = (...kids: ReactNode[]) => <View style={{ gap: 4 }}>{kids}</View>;

const line = (c: Colors, w: DimensionValue = 70) => <View style={{ width: w, height: 1, backgroundColor: c.border }} />;

const KEYWORD = "#c594c5";

const FUNCTION = "#5fb3b3";

/** A small drawing of each style variant, in the order of RICH_TEXT_OPTIONS. */
export const RICH_DRAWINGS: Record<RichText, Array<(c: Colors) => ReactNode>> = {
  quote: [
    (c) => (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 2, height: 24, backgroundColor: c.accent }} />
        {col(bar(56, c.foregroundMuted), bar(38, c.foregroundMuted))}
      </View>
    ),
    (c) => (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, padding: 8, borderRadius: 5, backgroundColor: c.surface2 }}>
        <Icon name="Quote" size={9} color={c.foregroundMuted} />
        {col(bar(40, c.foregroundMuted), bar(28, c.foregroundMuted))}
      </View>
    ),
    (c) => <View style={{ paddingLeft: 14 }}>{col(bar(56, c.foregroundMuted), bar(38, c.foregroundMuted))}</View>,
  ],
  table: [
    (c) => (
      <View style={{ alignSelf: "stretch", borderRadius: 4, borderWidth: 1, borderColor: c.border, overflow: "hidden" }}>
        <View style={{ height: 9, backgroundColor: c.surface2, borderBottomWidth: 1, borderBottomColor: c.border }} />
        <View style={{ height: 9, borderBottomWidth: 1, borderBottomColor: c.border }} />
        <View style={{ height: 9 }} />
      </View>
    ),
    (c) => (
      <View style={{ alignSelf: "stretch", gap: 2 }}>
        {[c.surface2, undefined, c.surface2].map((bg, i) => (
          <View key={i} style={{ height: 8, borderRadius: 2, backgroundColor: bg }} />
        ))}
      </View>
    ),
    (c) => line(c, 66),
    (c) => (
      <View style={{ alignSelf: "stretch", height: 28, borderRadius: 4, borderWidth: 1, borderColor: c.border, flexDirection: "row" }}>
        <View style={{ flex: 1, borderRightWidth: 1, borderRightColor: c.border }} />
        <View style={{ flex: 1, borderRightWidth: 1, borderRightColor: c.border }} />
        <View style={{ flex: 1 }} />
      </View>
    ),
  ],
  code: [
    (c) => (
      <View style={{ width: 76, borderRadius: 4, borderWidth: 1, borderColor: c.border, overflow: "hidden" }}>
        <View style={{ height: 7, backgroundColor: c.surface2 }} />
        <View style={{ padding: 6, gap: 3 }}>
          {bar(40, KEYWORD)}
          {bar(28, FUNCTION)}
        </View>
      </View>
    ),
    (c) => (
      <View style={{ width: 76, padding: 7, gap: 3, borderRadius: 4, backgroundColor: sunken(c.surface0) }}>
        {bar(44, KEYWORD)}
        {bar(30, FUNCTION)}
      </View>
    ),
    (c) => (
      <View style={{ width: 76, flexDirection: "row", gap: 6, padding: 7, borderRadius: 4, borderWidth: 1, borderColor: c.border }}>
        {col(bar(3, c.foregroundMuted), bar(3, c.foregroundMuted))}
        {col(bar(40, KEYWORD), bar(28, FUNCTION))}
      </View>
    ),
  ],
  inline: [
    (c) => (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {bar(12, c.foregroundMuted)}
        <View style={{ padding: 3, borderRadius: 3, backgroundColor: c.surface2 }}>{bar(14, c.foregroundMuted)}</View>
        {bar(10, c.foregroundMuted)}
      </View>
    ),
    (c) => (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {bar(12, c.foregroundMuted)}
        {bar(18, c.statusWarning)}
        {bar(10, c.foregroundMuted)}
      </View>
    ),
    (c) => (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {bar(12, c.foregroundMuted)}
        <View style={{ padding: 3, borderRadius: 3, borderWidth: 1, borderColor: c.border }}>{bar(14, c.foreground)}</View>
        {bar(10, c.foregroundMuted)}
      </View>
    ),
  ],
  heading: [
    (c) => col(bar(46, c.foreground, 6), bar(30, c.foregroundMuted, 4)),
    (c) => (
      <View style={{ gap: 4 }}>
        {bar(34, c.foreground, 5)}
        {bar(24, c.foregroundMuted, 3)}
        {line(c, 62)}
      </View>
    ),
    (c) => (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View style={{ width: 2, height: 14, backgroundColor: c.accent }} />
        {bar(40, c.foreground, 6)}
      </View>
    ),
  ],
  list: [
    (c) => (
      <View style={{ gap: 4 }}>
        {[c.foregroundMuted, c.foregroundMuted, c.statusSuccess].map((m, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View style={{ width: 4, height: 4, borderRadius: i === 2 ? 1 : 2, backgroundColor: m }} />
            {bar(i === 1 ? 26 : 38, c.foregroundMuted)}
          </View>
        ))}
      </View>
    ),
    (c) => (
      <View style={{ gap: 4 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            {i === 2 ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.statusSuccess }} /> : bar(5, c.foregroundMuted, 1)}
            {bar(i === 1 ? 26 : 38, c.foregroundMuted)}
          </View>
        ))}
      </View>
    ),
    (c) => (
      <View style={{ gap: 3 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: c.foregroundMuted }} />
            {bar(i === 1 ? 30 : 42, c.foregroundMuted, i === 2 ? 2 : 3)}
          </View>
        ))}
      </View>
    ),
  ],
  callout: [
    (c) => (
      <View style={{ width: 76, flexDirection: "row", alignItems: "center", gap: 6, padding: 7, borderRadius: 5, backgroundColor: alpha(c.accent, 0.14), borderWidth: 1, borderColor: alpha(c.accent, 0.35) }}>
        <Icon name="Info" size={9} color={c.accent} />
        {col(bar(28, c.foregroundMuted), bar(20, c.foregroundMuted))}
      </View>
    ),
    (c) => (
      <View style={{ flexDirection: "row", gap: 6 }}>
        <View style={{ width: 2, height: 18, backgroundColor: c.accent }} />
        {col(bar(22, c.accent), bar(44, c.foregroundMuted))}
      </View>
    ),
    (c) => (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        <Icon name="Info" size={9} color={c.accent} />
        {bar(12, c.accent)}
        {bar(34, c.foregroundMuted)}
      </View>
    ),
  ],
  rule: [
    (c) => line(c),
    (c) => (
      <View style={{ flexDirection: "row", gap: 6 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: c.foregroundMuted }} />
        ))}
      </View>
    ),
    (c) => <View style={{ width: 70 }}>{line(c, 24)}</View>,
  ],
};

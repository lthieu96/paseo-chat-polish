import type { PluginServerContext } from "@getpaseo/plugin/server";
import { renderDiagramSvg } from "./server/diagram";
import { readImageFile } from "./server/image";
import { renderDiagram } from "./shared/diagram";
import { readImage } from "./shared/image";
import { recapData } from "./shared/recap";
import { getTheme, themeSchema, themeSettings } from "./shared/theme";
import { getPrefs, prefsSchema, prefsSettings } from "./shared/timeline";
import { applyUpdate, checkUpdate } from "./shared/update";
import { checkForUpdate, installUpdate } from "./server/update";

export default function contribute(server: PluginServerContext) {
  const theme = server.registerSettings(themeSettings);
  server.handle(readImage, readImageFile);
  server.handle(renderDiagram, renderDiagramSvg);
  server.handle(getTheme, async () => {
    const current = await theme.read();
    return current.status === "ready" ? current.values : themeSchema.parse({});
  });
  const prefs = server.registerSettings(prefsSettings);
  server.handle(getPrefs, async () => {
    const current = await prefs.read();
    return current.status === "ready" ? current.values : prefsSchema.parse({});
  });
  server.handle(checkUpdate, checkForUpdate);
  server.handle(applyUpdate, installUpdate);
  server.on("agent.turn_ended", async (event, { paseo }) => {
    const current = await prefs.read();
    if (current.status === "ready" && current.values.recap === "off") return;
    const data = recapData(event.timeline, event.agent.cwd);
    if (!data) return;
    // turnId can be null or repeat across turns, and a reused id replaces the older row, so the end time keeps each recap.
    const id = `recap-${Date.now()}`;
    await paseo.agents.ref(event.agent.id).timeline.append({ type: "plugin", id, kind: "chat-polish-recap", version: 1, data });
  });
  return () => {};
}

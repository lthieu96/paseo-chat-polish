import type { PluginServerContext } from "@getpaseo/plugin/server";
import { renderDiagramSvg } from "./server/diagram";
import { readImageFile } from "./server/image";
import { renderDiagram } from "./shared/diagram";
import { readImage } from "./shared/image";
import { recapData } from "./shared/recap";
import { getTheme, themeSchema, themeSettings } from "./shared/theme";
import { getIconSet, getPrefs, prefsSchema, prefsSettings } from "./shared/timeline";
import { loadIconSet } from "./server/icons";
import { installHeadlessShell, removeHeadlessShell, shellStatus, staleShell } from "./server/headless-shell";
import { baseProvider, closeLocalServer, openHtmlPage, startHtmlTool, withHtmlTool } from "./server/html";
import { browserStatus, installBrowser, openHtml, removeBrowser } from "./shared/html";
import { applyUpdate, checkUpdate } from "./shared/update";
import { checkForUpdate, installUpdate } from "./server/update";
import { latestTurn } from "./server/turn";

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
  server.handle(getIconSet, ({ set }) => loadIconSet(set));
  const htmlTool = () => startHtmlTool().catch((error: unknown) => (console.error("[chat-polish] html_render tool unavailable", error), undefined));
  // Started even while the pref is off: agents created while it was on still call the tools.
  void htmlTool();
  server.handle(openHtml, openHtmlPage);
  server.handle(browserStatus, shellStatus);
  server.handle(installBrowser, () => (void installHeadlessShell(), shellStatus()));
  server.handle(removeBrowser, () => removeHeadlessShell().then(shellStatus));
  if (staleShell()) void installHeadlessShell();
  server.before("agent.create", async ({ request }, { paseo }) => {
    // Off by default, so unreadable prefs mean off; internal agents (commit and PR messages) never draw.
    const current = await prefs.read();
    if (current.status !== "ready" || current.values.html !== "on" || request.config.internal) return undefined;
    const tool = await htmlTool();
    if (!tool) return undefined;
    // Unreadable daemon config: judge the provider by its own id, so a derived one loses preapproval rather than failing to start.
    const providers = await paseo.config.get().then(({ config }) => config.providers, () => undefined);
    return { ...request, config: withHtmlTool(request.config, tool, baseProvider(request.config.provider, providers)) };
  });
  server.handle(checkUpdate, checkForUpdate);
  server.handle(applyUpdate, installUpdate);
  server.on("agent.turn_ended", async (event, { paseo }) => {
    const current = await prefs.read();
    if (current.status === "ready" && current.values.recap === "off") return;
    // Paseo 0.13 sends turn_ended with an empty timeline, so fetch the turn instead.
    const agent = paseo.agents.ref(event.agent.id);
    const data = recapData(await latestTurn(agent.timeline, event.turnId), event.agent.cwd);
    if (!data) return;
    // turnId can be null or repeat across turns, and a reused id replaces the older row, so the end time keeps each recap.
    const id = `recap-${Date.now()}`;
    await agent.timeline.append({ type: "plugin", id, kind: "chat-polish-recap", version: 1, data });
  });
  return () => closeLocalServer();
}

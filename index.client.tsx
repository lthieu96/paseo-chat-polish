import type { PluginTimelineData } from "@getpaseo/plugin";
import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { copyText, useToast, type ToastApi } from "@getpaseo/plugin/client/react-native";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useEffect } from "react";
import { Dashboard } from "./client/dashboard";
import { clearImageCache } from "./client/images";
import { sidebarIcon } from "./client/mark";
import { hideableKind, imageData, turnMarkdown, imagesSchema, noticeData, noticeSchema, planSchema, stepsSchema, thoughtSchema, todoData, todoSchema, toolData, toolSchema } from "./client/model";
import { followAgent, isTodo, onShownAgent, onStaleSteps, onUnplacedStep, placeStep, resetMade, setStepSkip, stepKey, type Phase } from "./client/steps";
import { renderDiagram } from "./shared/diagram";
import { currentPrefs, savePrefs, setPrefs, subscribePrefs, usePrefsSaver } from "./client/prefs";
import { bindThemeRegistry, currentTheme, registerTheme } from "./client/theme-registry";
import { addIconSet, bindPromptKeys, clampUserMessages, iconTwins, jumpToPrompt, openAgentIds, paintSidebar, redrawDiagrams, setCompactHandler, readHostAppearance, restyleNative, selectionCopyMenu, setNativeColors, setRailProviders, setRichText, stylePluginViews, nativeIconSet, watchDom } from "./client/web";
import { getTheme, THEME_CATALOG_ID, themeSchema } from "./shared/theme";
import { getIconSet, getPrefs, type Prefs } from "./shared/timeline";
import { HtmlItem, ImagesItem, NoticeItem, PlanItem, RecapItem, StepsItem, ThoughtItem, TodoItem, ToolItem } from "./client/views";
import { htmlData, htmlSchema } from "./client/html";
import { recapSchema } from "./shared/recap";

const KIND = "chat-polish";

// Toasts come from a hook; the sidebar item, always mounted on desktop, lends its toast to Command Center callbacks.
let toast: ToastApi | undefined;

function DashboardItem({ currentScreen, openScreen, theme }: PluginSidebarItemProps) {
  // Always mounted on desktop, so it is where the restyle learns the app theme's colors.
  useEffect(() => setNativeColors(theme.colors), [theme]);
  // Also always mounted, so it saves the prefs Command Center toggles change.
  usePrefsSaver();
  const hostToast = useToast();
  useEffect(() => {
    toast = hostToast;
  }, [hostToast]);
  return <SidebarRow icon={sidebarIcon} active={currentScreen?.screenId === "dashboard"} onPress={() => openScreen({ screenId: "dashboard" })} />;
}

export default function contribute(client: PluginClientContext) {
  const unbindTheme = bindThemeRegistry(client);
  // Register the default right away, then swap in the theme saved from the dashboard.
  registerTheme(themeSchema.parse({}));
  client
    .rpc(getTheme, {})
    .then(registerTheme)
    .catch((error: unknown) => console.warn("[chat-polish] Saved theme unavailable, using the default", error));
  const unpaintSidebar = paintSidebar(() => {
    const theme = currentTheme();
    const active = readHostAppearance().pluginThemeId === THEME_CATALOG_ID;
    return active && theme?.sidebar ? { sidebar: theme.sidebar } : undefined;
  });

  const unrestyle = restyleNative(() => currentPrefs().nativeStyle === "design", { render: (source) => client.rpc(renderDiagram, { source }), on: () => currentPrefs().diagrams === "pele" });
  const unstylePluginViews = stylePluginViews();
  const unclamp = clampUserMessages(() => currentPrefs().userMessages === "clamp");
  const unselect = selectionCopyMenu(() => currentPrefs().selectionCopy === "on");
  const unicons = nativeIconSet(() => currentPrefs().iconSet);

  // The composer's model selector rail lists every provider, which Paseo only renders for new chats.
  const loadProviders = () =>
    client.paseo.providers
      .snapshot()
      .then(({ entries }) =>
        setRailProviders(
          entries
            .filter((e) => e.enabled !== false)
            .map((e) => ({
              id: e.provider,
              label: e.label ?? e.provider,
              status: e.status,
              iconSvg: e.iconSvg,
              models: (e.models ?? []).map((m) => ({
                label: m.label,
                thinking: (m.thinkingOptions ?? []).map((t) => ({ label: t.label, description: t.description, isDefault: t.id === m.defaultThinkingOptionId })),
              })),
            })),
        ),
      )
      .catch((error: unknown) => console.warn("[chat-polish] Provider list unavailable for the model selector", error));
  void loadProviders();
  const unsubscribeProviders = client.paseo.providers.subscribe(() => void loadProviders());

  // Round-trip through JSON so optional fields left undefined never reach the host as non-JSON.
  const one = (kind: string, data: object) => ({
    items: [{ type: "plugin" as const, kind: `${KIND}-${kind}`, version: 1, data: JSON.parse(JSON.stringify(data)) as PluginTimelineData }],
  });

  // Merged steps: the run's first step becomes one row, the rest leave the list; unknown steps render as before.
  const merging = () => currentPrefs().merge === "on";
  const stepRow = (item: Parameters<typeof placeStep>[0], phase: Phase) => {
    if (!merging()) return undefined;
    const placed = placeStep(item, phase);
    if (!placed) return undefined;
    return placed.as === "none" ? { items: [] } : one("steps", { head: placed.key });
  };

  // A todo update on its own row. Paseo splits one update that completes a task and starts the next into two rows with the same list;
  // they are transformed one after the other in the same pass, so the second is left out. A later identical update (Paseo rewrites the row
  // in place) comes in another pass and still shows.
  let lastTodo: string | undefined;
  const ownTodo = (item: Parameters<typeof todoData>[0]) => {
    const key = stepKey(item);
    if (key === lastTodo) return { items: [] };
    if (lastTodo === undefined) queueMicrotask(() => (lastTodo = undefined));
    lastTodo = key;
    return one("todo", todoData(item));
  };

  // Transformers read prefs when they run; re-register when hiding or images change so Paseo re-transforms.
  const addTransformers = () => {
    const removers = [
      client.addTimelineTransformer({
        id: `${KIND}-tool`,
        query: { itemType: "tool_call" },
        transform: ({ item, phase }) => {
          const page = htmlData(item);
          if (page) return one("html", page);
          const kind = hideableKind(item);
          if (kind && currentPrefs().hidden.includes(kind)) return { items: [] };
          // Like Paseo: the approval card shows a pending plan, so the call itself stays out of the chat until resolved.
          if (item.name === "ExitPlanMode" || (item.name === "plan_approval" && item.status === "running")) return { items: [] };
          if (item.detail.type === "plan") return one("plan", { text: item.detail.text, phase });
          const merged = stepRow(item, phase);
          if (merged) return merged;
          // Summary mode: leave calls native so Paseo can group them ("Ran 4 commands"); a plugin row would split the group.
          return readHostAppearance().toolCallDetail === "overview" ? undefined : one("tool", toolData(item));
        },
      }),
      client.addTimelineTransformer({
        id: `${KIND}-reasoning`,
        query: { itemType: "reasoning" },
        transform: ({ item, phase }) => stepRow(item, phase) ?? one("thought", { text: item.text, phase }),
      }),
      client.addTimelineTransformer({
        id: `${KIND}-images`,
        query: { itemType: "assistant_message" },
        transform: ({ item }) => {
          const data = currentPrefs().images === "native" ? undefined : imageData(item.text);
          return data ? one("images", data) : undefined;
        },
      }),
      // Todo updates fold into the merged row around them (what changed comes from the followed timeline); otherwise each is one row.
      client.addTimelineTransformer({
        id: `${KIND}-todo`,
        query: { itemType: "todo" },
        transform: ({ item, phase }) => {
          if (currentPrefs().hidden.includes("todo") || (merging() && placeStep(item, phase)?.as === "none")) return { items: [] };
          return ownTodo(item);
        },
      }),
      client.addTimelineTransformer({ id: `${KIND}-error`, query: { itemType: "error" }, transform: ({ item }) => one("notice", noticeData(item)) }),
      client.addTimelineTransformer({ id: `${KIND}-compaction`, query: { itemType: "compaction" }, transform: ({ item }) => one("notice", noticeData(item)) }),
    ];
    return () => removers.forEach((r) => void r());
  };
  let removeTransformers = addTransformers();
  const inputs = () => [currentPrefs().images, currentPrefs().hidden.join(), currentPrefs().merge, readHostAppearance().toolCallDetail].join("|");
  let transformedWith = inputs();
  const retransform = (force = false) => {
    if (!force && inputs() === transformedWith) return;
    transformedWith = inputs();
    removeTransformers();
    resetMade();
    removeTransformers = addTransformers();
  };
  // A step transformed before its run was known renders wrong until Paseo transforms again; batch those.
  let staleTimer: ReturnType<typeof setTimeout> | undefined;
  onStaleSteps(() => {
    staleTimer ??= setTimeout(() => {
      staleTimer = undefined;
      retransform(true);
    }, 50);
  });
  const skipHidden = () => setStepSkip((item) => (isTodo(item) ? currentPrefs().hidden.includes("todo") : item.type === "tool_call" && currentPrefs().hidden.includes(hideableKind(item)!)));
  skipHidden();
  // Follows the timelines of agents with an open tab, plus the last few whose merged rows rendered (native can't read tabs); none when merging is off.
  const followed = new Map<string, () => void>();
  const shown: string[] = [];
  const follow = () => {
    const open = new Set(merging() ? [...openAgentIds(), ...shown] : []);
    for (const [id, stop] of followed) if (!open.has(id)) (stop(), followed.delete(id));
    for (const id of open) if (!followed.has(id)) followed.set(id, followAgent(client.paseo, id));
  };
  onShownAgent((id) => {
    if (shown[0] === id) return;
    shown.splice(0, shown.length, id, ...shown.filter((a) => a !== id).slice(0, 2));
    follow();
  });
  // A step from a tab opened since the last DOM settle: start following now, after Paseo's render, rather than up to 250ms later.
  let followQueued = false;
  onUnplacedStep(() => {
    if (followQueued) return;
    followQueued = true;
    queueMicrotask(() => {
      followQueued = false;
      follow();
    });
  });
  // Prefs Paseo's own rows follow too reach the restyle as <html> attributes.
  const markRoot = (p: Prefs) => setRichText({ ...p.richText, images: p.images, steps: p.steps, density: p.density === "normal" ? "a" : p.density, "icon-steps": p.rowIcons.steps === "hide" ? "hide" : "a", "icon-tool": p.rowIcons.tool === "hide" ? "hide" : "a", loader: p.loader === "dots" ? "a" : p.loader, "loader-size": p.loaderSize === "s" ? "a" : p.loaderSize, icons: p.iconSet === "lucide" ? "a" : p.iconSet });
  markRoot(currentPrefs());
  // The chosen icon set comes from the daemon once, the first time it's picked.
  const requestedIcons = new Set<string>();
  const loadIcons = () => {
    const set = currentPrefs().iconSet;
    if (set === "lucide" || iconTwins(set) || requestedIcons.has(set)) return;
    requestedIcons.add(set);
    client
      .rpc(getIconSet, { set })
      .then((twins) => addIconSet(set, twins))
      .catch((error: unknown) => {
        requestedIcons.delete(set);
        console.warn(`[chat-polish] Icon set ${set} unavailable, keeping Lucide`, error);
      });
  };
  loadIcons();
  let diagrams = currentPrefs().diagrams;
  const unsubscribePrefs = subscribePrefs(() => {
    markRoot(currentPrefs());
    loadIcons();
    if (diagrams !== currentPrefs().diagrams) {
      diagrams = currentPrefs().diagrams;
      redrawDiagrams();
    }
    skipHidden();
    retransform();
    follow();
  });
  // Paseo doesn't tell plugins when Tool call display changes; its settings screen re-renders, so check on DOM changes.
  const unwatchHost = watchDom(
    {
      settled: () => {
        retransform();
        follow();
      },
    },
    () => {},
  );
  client
    .rpc(getPrefs, {})
    .then(setPrefs)
    .catch((error: unknown) => console.warn("[chat-polish] Saved timeline prefs unavailable, using defaults", error));

  client.addTimelineRenderer({ kind: `${KIND}-tool`, version: 1, schema: toolSchema, Component: ToolItem });
  client.addTimelineRenderer({ kind: `${KIND}-plan`, version: 1, schema: planSchema, Component: PlanItem });
  client.addTimelineRenderer({ kind: `${KIND}-thought`, version: 1, schema: thoughtSchema, Component: ThoughtItem });
  client.addTimelineRenderer({ kind: `${KIND}-todo`, version: 1, schema: todoSchema, Component: TodoItem });
  client.addTimelineRenderer({ kind: `${KIND}-notice`, version: 1, schema: noticeSchema, Component: NoticeItem });
  client.addTimelineRenderer({ kind: `${KIND}-images`, version: 1, schema: imagesSchema, Component: ImagesItem });
  client.addTimelineRenderer({ kind: `${KIND}-steps`, version: 1, schema: stepsSchema, Component: StepsItem });
  client.addTimelineRenderer({ kind: `${KIND}-recap`, version: 1, schema: recapSchema, Component: RecapItem });
  client.addTimelineRenderer({ kind: `${KIND}-html`, version: 1, schema: htmlSchema, Component: HtmlItem });

  const unbindPromptKeys = bindPromptKeys();
  for (const [id, title, direction] of [["previous-prompt", "Previous prompt", -1], ["next-prompt", "Next prompt", 1]] as const) {
    client.addCommandCenterItem({ id, title, icon: direction < 0 ? "ArrowUpToLine" : "ArrowDownToLine", keywords: ["jump", "message", "chat polish"], context: "agent", onSelect: () => jumpToPrompt(direction) });
  }
  client.addCommandCenterItem({
    id: "copy-turn",
    title: "Copy last turn as Markdown",
    icon: "ClipboardCopy",
    keywords: ["markdown", "handoff", "pr", "chat polish"],
    context: "agent",
    async onSelect({ paseo, agent }) {
      try {
        const page = await paseo.agents.ref(agent.id).timeline.refetch({ direction: "tail", limit: 500, projection: "projected" });
        const markdown = turnMarkdown(page.entries.map((e) => e.item), agent.cwd);
        if (!markdown) return void toast?.show("There's no turn to copy yet.");
        await copyText(markdown);
        toast?.show("Copied the last turn as Markdown", { variant: "success" });
      } catch (error) {
        console.warn("[chat-polish] Copy last turn failed", error);
        toast?.error("Couldn't copy the last turn.");
      }
    },
  });
  const unsetCompact = setCompactHandler((agentId) => client.paseo.agents.ref(agentId).send("/compact"));
  client.addCommandCenterItem({ id: "open", title: "Open Chat Polish", icon: "Sparkles", context: "global", onSelect: ({ openScreen }) => openScreen({ screenId: "dashboard" }) });
  // Toggle titles name what selecting them does, so they are re-added whenever prefs change.
  const toggles = (p: Prefs): Array<[string, string, string, Partial<Prefs>]> => {
    const hidesReads = p.hidden.includes("read") && p.hidden.includes("search");
    const anyIcon = Object.values(p.rowIcons).includes("show");
    return [
      ["merge", p.merge === "on" ? "Show each thought and tool call as its own row" : "Merge thoughts and tool calls between replies", "Layers", { merge: p.merge === "on" ? "off" : "on" }],
      ["icons", anyIcon ? "Hide icons on thought and tool rows" : "Show icons on thought and tool rows", "Shapes", { rowIcons: anyIcon ? { steps: "hide", tool: "hide", thought: "hide" } : { steps: "show", tool: "show", thought: "show" } }],
      ["steps", p.steps !== "full" ? "Show thought and tool rows at full strength" : "Fade thought and tool rows", "Blend", { steps: p.steps !== "full" ? "full" : "faded" }],
      ["reads", hidesReads ? "Show finished reads and searches" : "Hide finished reads and searches", "EyeOff", { hidden: hidesReads ? p.hidden.filter((h) => h !== "read" && h !== "search") : [...new Set([...p.hidden, "read", "search"] as const)] }],
      ["copy", p.selectionCopy === "on" ? "Turn off the copy popup on selected text" : "Turn on the copy popup on selected text", "ClipboardCopy", { selectionCopy: p.selectionCopy === "on" ? "off" : "on" }],
      ["recap", p.recap === "on" ? "Turn off turn recaps" : "Turn on turn recaps", "FileDiff", { recap: p.recap === "on" ? "off" : "on" }],
      ["html", p.html === "on" ? "Stop giving new agents the HTML page tool (experimental)" : "Give new agents the HTML page tool (experimental)", "AppWindow", { html: p.html === "on" ? "off" : "on" }],
      ["diagrams", p.diagrams === "pele" ? "Draw diagrams with Paseo's mermaid" : "Draw diagrams with Pele", "Workflow", { diagrams: p.diagrams === "pele" ? "mermaid" : "pele" }],
      ["native", p.nativeStyle === "design" ? "Leave Paseo's own items as Paseo draws them" : "Restyle Paseo's own items", "Paintbrush", { nativeStyle: p.nativeStyle === "design" ? "paseo" : "design" }],
    ];
  };
  let removeToggles: Array<() => void> = [];
  const addToggles = () => {
    removeToggles.forEach((r) => void r());
    removeToggles = toggles(currentPrefs()).map(([id, title, icon, change]) =>
      client.addCommandCenterItem({ id: `toggle-${id}`, title: `Chat Polish: ${title}`, icon, keywords: ["chat polish", "toggle"], context: "global", onSelect: () => savePrefs({ ...currentPrefs(), ...change }) }),
    );
  };
  addToggles();
  const unsubscribeToggles = subscribePrefs(addToggles);

  client.addScreen({ id: "dashboard", title: "Chat Polish", Component: Dashboard });
  client.addSidebarHeaderItem({ id: "dashboard", title: "Chat Polish", Component: DashboardItem });
  return () => {
    clearImageCache();
    unsetCompact();
    unsubscribeToggles();
    removeToggles.forEach((r) => void r());
    unbindPromptKeys();
    unsubscribePrefs();
    unwatchHost();
    clearTimeout(staleTimer);
    followed.forEach((stop) => stop());
    removeTransformers();
    unpaintSidebar();
    unclamp();
    unselect();
    unicons();
    unsubscribeProviders();
    unrestyle();
    unstylePluginViews();
    unbindTheme();
  };
}

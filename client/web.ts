// What the plugin does to Paseo's own app on desktop and web, through its DOM and settings; each part lives in client/web/.
export { clampUserMessages } from "./web/user-messages";
export { setCompactHandler } from "./web/context-card";
export { openAgentIds, watchDom } from "./web/dom";
export { canSetAppTheme, DEFAULTS, PASEO_FONT_STACKS, readHostAppearance, readSyntaxTheme, setAppTheme, updateAppSettings, type HostAppearance } from "./web/host";
export { addIconSet, iconTwins, nativeIconSet, subscribeIconSets } from "./web/icons";
export { diagramDoc, drawDiagram, loadMermaidDoc, redrawDiagrams, seriesFrom } from "./web/mermaid";
export { setRailProviders, type RailProvider } from "./web/model-picker";
export { stylePluginViews } from "./web/plugin-views";
export { bindPromptKeys, followExpansionAtBottom, jumpToPrompt } from "./web/prompts";
export { restyleNative, setNativeColors } from "./web/restyle";
export { setRichText } from "./web/rich-text";
export { selectionCopyMenu } from "./web/selection-copy";
export { paintSidebar } from "./web/sidebar";

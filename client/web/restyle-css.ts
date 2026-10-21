// The Chat Polish design for what Paseo draws itself: chat chrome, composer, cards, popovers, tool rows and markdown.
import { icon } from "./icons";
import { CHIP, CODE_BLOCK, CTX, CTX_HEAD, HEADING, INLINE_CODE, LANG, LIMIT, MARK, MARK_OL, md, MD, MSG, PERMISSION, PLAN, PRIMARY, QUESTION, ROW, ROW_ICON, SECONDARY, SLASH, SLASH_GLIDE_MS, SURFACE, TAG, USAGE, WORKING_BOX } from "./selectors";

// Values come from CSS variables set by setNativeColors (restyle.ts), so a theme switch restyles without re-tagging.

const FOOTER = '[data-cp-part="footer"]';
const FOOTER_ICON = ':is(button[aria-label="Copy turn"], [data-testid="assistant-fork-menu-trigger"])';
const COMPOSER_BUTTON =
  ':is([data-testid="message-input-attach-button"], [data-testid^="agent-feature-"], [data-testid="workspace-create-submit"], [data-testid="context-window-meter"], button:is([aria-label="Open agent features"], [aria-label="Start dictation"], [aria-label="Send message"], [aria-label="Queue message"], [aria-label="Stop agent"], [aria-label$="Voice mode"]))';

// Paseo steps the working dots' opacity from JS every ~160ms, which reads as slow and choppy. The same
// clockwise chase (dots 4, 6, 5, 3, 1, 2) as a CSS animation runs smoothly on the compositor.
// WORKING_BOX is the indicator's 14px box (tagged by tagParts; the dashboard preview draws one too), its first child Paseo's 2 × 3 grid.
// The dashboard's "Dots" loader tile ([data-cp-dots]) shares the animation.
const DOT = `:is(${WORKING_BOX}, [data-cp-dots]) > div:first-child > div`;
const WORKING_DOTS = `${DOT} { animation: cp-dots 0.8s linear infinite !important; }
${[4, 5, 3, 0, 2, 1].map((step, i) => `${DOT}:nth-child(${i + 1}) { animation-delay: ${((step - 6) * 0.8) / 6}s !important; }`).join("\n")}
@keyframes cp-dots { 0% { opacity: 1; } 70%, 90% { opacity: 0.15; } 100% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { ${DOT} { animation: none !important; } }`;

// Other loaders (Dashboard → Messages → Working indicator): tagParts puts nine <i> over the box, Paseo's grid hides,
// and each loader draws with the dots it needs (or the overlay's ::before). Sizes scale the whole box.
// The dashboard's loader tiles carry their own overlay ([data-cp-loader][data-cp-tile="name"]) so each tile animates whatever is chosen globally.
const L = (name: string) => `:is(:root[data-cp-rt-loader="${name}"] [data-cp-loader]:not([data-cp-tile]), [data-cp-loader][data-cp-tile="${name}"])`;
const RING = [0, 1, 2, 3, 4, 5, 6, 7];
const LOADERS = `
${WORKING_BOX} { position: relative; }
:root[data-cp-rt-loader-size="m"] ${WORKING_BOX} { transform: scale(1.15); }
:root[data-cp-rt-loader-size="l"] ${WORKING_BOX} { transform: scale(1.3); }
[data-cp-loader] { display: none; position: absolute; inset: 0; pointer-events: none; color: var(--cp-fg); }
:root[data-cp-rt-loader] ${WORKING_BOX} > div:first-child { visibility: hidden; }
:root[data-cp-rt-loader] [data-cp-loader], [data-cp-loader][data-cp-tile] { display: block; }
[data-cp-loader] > i { position: absolute; display: none; border-radius: 50%; background: currentColor; }
${[...Array(9)].map((_, i) => `[data-cp-loader] > i:nth-child(${i + 1}) { --i: ${i}; --c: ${i % 3}; --r: ${Math.floor(i / 3)}; --m: ${Math.max(Math.abs((i % 3) - 1), Math.abs(Math.floor(i / 3) - 1))}; --s: ${[0, 1, 2, 5, 4, 3, 6, 7, 8].indexOf(i)}; }`).join("\n")}
@keyframes cp-tail { 0% { opacity: 1; } 100% { opacity: 0.15; } }
@keyframes cp-spin { to { transform: rotate(360deg); } }
${L("sparkle")}::before { content: "·"; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font: 13px/1 var(--cp-mono); color: var(--cp-accent); animation: cp-sparkle 1.2s steps(1) infinite; }
@keyframes cp-sparkle { 0% { content: "·"; } 10% { content: "✢"; } 20% { content: "✳"; } 30% { content: "✶"; } 40% { content: "✻"; } 50% { content: "✽"; } 60% { content: "✻"; } 70% { content: "✶"; } 80% { content: "✳"; } 90% { content: "✢"; } }
${L("spokes")} > i:nth-child(-n+8) { display: block; left: 50%; top: 50%; width: 1.4px; height: 3.6px; margin: -1.8px 0 0 -0.7px; border-radius: 1px; transform: rotate(calc(var(--i) * 45deg)) translateY(-4.4px); animation: cp-tail 0.9s linear infinite; animation-delay: calc((var(--i) - 8) * 0.9s / 8); }
${L("dotring")} > i:nth-child(-n+8) { display: block; left: 50%; top: 50%; width: 2.4px; height: 2.4px; margin: -1.2px 0 0 -1.2px; transform: rotate(calc(var(--i) * 45deg)) translateY(-5px); animation: cp-tail 1s linear infinite; animation-delay: calc((var(--i) - 8) * 1s / 8); }
${L("orb")}::before { content: ""; position: absolute; inset: 3px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #fff 0, var(--cp-accent) 45%, color-mix(in srgb, var(--cp-accent), #000 40%) 100%); animation: cp-orb 2s ease-in-out infinite; }
@keyframes cp-orb { 0%, 100% { transform: scale(0.78); box-shadow: 0 0 0 0 transparent; opacity: 0.75; } 50% { transform: scale(1); box-shadow: 0 0 5px 1.5px color-mix(in srgb, var(--cp-accent) 45%, transparent); opacity: 1; } }
:is(${L("matrix")}, ${L("snake")}) > i { display: block; width: 2.6px; height: 2.6px; left: calc(1.5px + var(--c) * 4.2px); top: calc(1.5px + var(--r) * 4.2px); }
${L("matrix")} > i { animation: cp-matrix 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite; animation-delay: calc(var(--m) * 0.14s); }
@keyframes cp-matrix { 0%, 100% { opacity: 0.2; transform: scale(0.7); } 30% { opacity: 1; transform: scale(1.1); } 60% { opacity: 0.3; transform: scale(0.8); } }
${L("snake")} > i { animation: cp-snake 1.35s linear infinite; animation-delay: calc((var(--s) - 9) * 1.35s / 9); }
@keyframes cp-snake { 0% { opacity: 1; } 33% { opacity: 0.35; } 55%, 100% { opacity: 0.12; } }
@media (prefers-reduced-motion: reduce) { [data-cp-loader] > i, [data-cp-loader]::before { animation: none !important; } }`;
// Shown when a row was first drawn open, so its own icon was never seen.
const WRENCH_MASK = icon("Wrench", '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>');
const THUMBS = `:root:not([data-cp-rt-images="native"]) ${MSG} [data-paseo-markdown-tag="img"]`;
const CLOCK_MASK = icon("Clock", '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16.5 12"/>');
const REDRAW_MASK = icon("RefreshCw", '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>');
// Paseo renders a popover once hidden (inline opacity 0, or parked at -9999px) to measure it, then places it. Animating
// that first frame would override the hiding and flash the popover in the window corner, so motion starts once placed.
// On close, the context card is swapped for an exit copy without its FadeIn; animating that copy made it blink, so only
// the open card (FadeIn in its style) rises in.
// Floating surfaces drawn alike: pickers, Paseo's menus (tagged by tagParts), Command Center.
const POPOVER = `:is(:is([data-testid="combobox-desktop-container"], [data-testid="chat-outline-preview"]):not([style*="opacity: 0"]), [data-testid="context-window-details"][style*="FadeIn"], :is([data-cp-part="menu"], [role="menu"], [role="listbox"]):not([hidden]):not([aria-hidden="true"]):not([data-state="closed"]):not([style*="opacity: 0"])):not([style*="-9999"], [style*="FadeOut"], [data-cp-glide], [data-cp-swap], [data-cp-ghost])`;

// The chat's own chrome from the "Chat Surfaces" design: turn footer, composer, prompts, outline rail.
const CHAT_CHROME_CSS = `
${FOOTER} { gap: 8px !important; min-height: 26px !important; align-items: center !important; }
${FOOTER} > [data-cp-part="fork"] { width: 20px !important; height: 20px !important; }
${FOOTER} ${FOOTER_ICON} { width: 20px !important; height: 20px !important; padding: 3px !important; margin: 0 !important; }
${FOOTER} > :last-child, ${FOOTER} > :last-child * { font-size: 12px !important; }
[data-testid="user-message"] > div:first-child > div:first-child { transition: box-shadow 0.6s ease-out; }
[data-testid="user-message"][data-cp-flash] > div:first-child > div:first-child { box-shadow: 0 0 0 1.5px var(--cp-accent); transition: none; }
[data-testid="turn-working-indicator"] > div > div:first-child { width: 20px !important; margin-left: 0 !important; align-items: center !important; }
${WORKING_DOTS}
${LOADERS}

/* Queued messages: a dashed "not sent yet" row with a clock and label, quiet 26px icon actions; send-now keeps the accent. */
[data-cp-part="queued"] { min-height: 36px !important; padding: 0 6px 0 12px !important; gap: 8px !important; align-items: center !important; box-sizing: border-box !important; border: 1px dashed var(--cp-rule) !important; border-radius: 12px !important; background-color: transparent !important; }
[data-cp-part="queued"]::before { content: ""; order: -2; flex-shrink: 0; width: 13px; height: 13px; background-color: var(--cp-muted); -webkit-mask: ${CLOCK_MASK} center / contain no-repeat; mask: ${CLOCK_MASK} center / contain no-repeat; }
[data-cp-part="queued"]::after { content: "Queued"; order: -1; flex-shrink: 0; font-size: 11px; color: var(--cp-muted); }
[data-cp-part="queued"] > div:first-child { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 13px !important; color: var(--cp-fg) !important; }
[data-cp-part="queued"] > div:last-child { gap: 0 !important; align-items: center !important; }
/* The actions are matched by position (edit, then send-now): Paseo builds differ in their tags and labels. */
[data-cp-part="queued"] > div:last-child > * { width: 26px !important; height: 26px !important; min-width: 0 !important; border: 0 !important; border-radius: 8px !important; background-color: transparent !important; box-shadow: none !important; }
[data-cp-part="queued"] > div:last-child > * * { background-color: transparent !important; }
[data-cp-part="queued"] > div:last-child > *:hover { background-color: var(--cp-control) !important; }
[data-cp-part="queued"] > div:last-child svg { width: 14px !important; height: 14px !important; }
/* The icons carry their stroke as an attribute (dark, for Paseo's filled buttons); CSS stroke overrides it. */
[data-cp-part="queued"] > div:last-child :is(svg, svg *) { stroke: var(--cp-muted) !important; }
[data-cp-part="queued"] > div:last-child > :last-child :is(svg, svg *) { stroke: var(--cp-accent) !important; }
[data-cp-part="queued"] > div:last-child > :last-child:is(:disabled, [aria-disabled="true"]) :is(svg, svg *) { stroke: var(--cp-muted) !important; }
[data-cp-part="queued"] > div:last-child > :is(:disabled, [aria-disabled="true"]) { opacity: 0.45 !important; }
[data-cp-part="queued"] > div:last-child > :is(:disabled, [aria-disabled="true"]):hover { background-color: transparent !important; }

/* Popovers that open with no motion (pickers, the context card, the outline preview) rise in; Paseo's menus already animate. */
@keyframes cp-pop { from { opacity: 0; transform: translateY(2px) scale(0.99); } to { opacity: 1; transform: none; } }
${POPOVER} { animation: cp-pop 40ms cubic-bezier(0.16, 1, 0.3, 1) both !important; }
/* Menus open quickly; dismiss them immediately without a closing transition. */
${SURFACE} { transition: none !important; animation-duration: 40ms !important; }
${SURFACE}:is([hidden], [aria-hidden="true"], [data-state="closed"], [style*="opacity: 0"], [style*="-9999"]),
[data-testid="chat-outline-preview"]:is([hidden], [aria-hidden="true"], [data-state="closed"], [style*="opacity: 0"], [style*="-9999"]) { animation: none !important; transition: none !important; }
@media (prefers-reduced-motion: reduce) { ${POPOVER} { animation: none !important; } }
/* Every floating surface shares one shape: all pickers, menus/listboxes, and Command Center. */
${SURFACE} { border-radius: 12px !important; border-color: var(--colors-border) !important; box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45) !important; }
[data-cp-setting-menu] { box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22) !important; }
/* Dark raised sits too close to the page (1.15:1), so dark themes lift surfaces to control; light themes keep raised (white), as control is darker than the page there. */
${SURFACE} { background-color: var(--cp-control) !important; }
:root:is(.light, .pluginLight) ${SURFACE} { background-color: var(--cp-raised) !important; }
${SURFACE} :is(button, [role="button"], [role="menuitem"], [role="option"], a[href]) { border-radius: 16px !important; }
/* Reset inherited cursor styles throughout the popup; restore pointer only across active rows. */
${SURFACE}, ${SURFACE} * { cursor: default !important; }
${SURFACE} :is(input, textarea, [contenteditable="true"]) { cursor: text !important; }
${SURFACE} :is(button, [role="button"], [role="menuitem"], [role="option"], a[href]):not(:disabled):not([aria-disabled="true"]),
${SURFACE} :is(button, [role="button"], [role="menuitem"], [role="option"], a[href]):not(:disabled):not([aria-disabled="true"]) * { cursor: pointer !important; }
${SURFACE} :is(button, [role="button"], [role="menuitem"], [role="option"], a[href]):not(:disabled):not([aria-disabled="true"]):is(:hover, :focus-visible, [aria-selected="true"]) { background-color: color-mix(in srgb, var(--cp-control), var(--cp-fg) 12%) !important; }
:root:is(.light, .pluginLight) ${SURFACE} :is(button, [role="button"], [role="menuitem"], [role="option"], a[href]):not(:disabled):not([aria-disabled="true"]):is(:hover, :focus-visible, [aria-selected="true"]) { background-color: color-mix(in srgb, var(--cp-raised), var(--cp-fg) 8%) !important; }
/* Paseo lights a row with the raised color, which would vanish on a raised surface; markLitRows tags it to draw it a step up. */
[data-cp-lit] { background-color: color-mix(in srgb, var(--cp-control), var(--cp-fg) 12%) !important; }
:root:is(.light, .pluginLight) [data-cp-lit] { background-color: color-mix(in srgb, var(--cp-raised), var(--cp-fg) 8%) !important; }
/* The sidebar's workspace hover card is a menu too (role=menu), but its rows ran edge to edge, so their 16px hover fill missed the
   card's corners. Inset them 4px like menu rows: 28px tall, 13px text, 14px icons, title 13/600, divider inset too. */
[data-cp-part="ws-card"] { padding: 4px !important; }
[data-cp-part="ws-card"] > * { min-height: 28px !important; padding: 0 8px !important; gap: 8px !important; align-items: center !important; }
[data-cp-part="ws-card"] > :first-child { min-height: 0 !important; padding: 8px 8px 6px !important; }
[data-cp-part="ws-card"] > :empty { min-height: 0 !important; height: 1px !important; margin: 4px 0 !important; padding: 0 !important; background-color: var(--cp-rule, var(--colors-border)) !important; }
[data-cp-part="ws-card"] svg { width: 14px !important; height: 14px !important; flex-shrink: 0; }
[data-cp-part="ws-card"] [dir] { font-size: 13px !important; line-height: 18px !important; }
[data-cp-part="ws-card"] > :first-child [dir] { font-weight: 600 !important; color: var(--cp-fg) !important; }
/* Between sessions only the newest card shows, gliding from the last one (watchHoverCards). */
[data-cp-gone] { visibility: hidden !important; }
@keyframes cp-glide-a { from { transform: translateY(var(--cp-from)); } }
@keyframes cp-glide-b { from { transform: translateY(var(--cp-from)); } }
[data-cp-part="ws-card"][data-cp-glide="a"]:not([style*="FadeOut"]) { animation: cp-glide-a 100ms cubic-bezier(0.33, 1, 0.68, 1) both !important; }
[data-cp-part="ws-card"][data-cp-glide="b"]:not([style*="FadeOut"]) { animation: cp-glide-b 100ms cubic-bezier(0.33, 1, 0.68, 1) both !important; }
@keyframes cp-icon-a { from { opacity: 0; transform: scale(0.5); } }
@keyframes cp-icon-b { from { opacity: 0; transform: scale(0.5); } }
[data-cp-part="ws-card"][data-cp-swap="a"] svg { animation: cp-icon-a 100ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
[data-cp-part="ws-card"][data-cp-swap="b"] svg { animation: cp-icon-b 100ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
@keyframes cp-swap-text-a { from { opacity: 0.35; transform: translateY(var(--cp-shift, 0px)); } }
@keyframes cp-swap-text-b { from { opacity: 0.35; transform: translateY(var(--cp-shift, 0px)); } }
[data-cp-part="ws-card"][data-cp-swap="a"] [dir] { animation: cp-swap-text-a 100ms cubic-bezier(0.33, 1, 0.68, 1) both; }
[data-cp-part="ws-card"][data-cp-swap="b"] [dir] { animation: cp-swap-text-b 100ms cubic-bezier(0.33, 1, 0.68, 1) both; }
@media (prefers-reduced-motion: reduce) { [data-cp-part="ws-card"]:is([data-cp-glide], [data-cp-swap]), [data-cp-part="ws-card"][data-cp-swap] :is(svg, [dir]) { animation: none !important; } }
/* Command Center keeps its taller palette rows, inset like every other surface's. */
/* Command Center marks a query's match with a filled box (a nested Text, the only spans there with a style class besides the
   file row's name and path, which carry testIDs). Draw it as accent text instead, like the plugin's other menus. */
[data-testid="command-center-panel"] [dir] > span[class*="unistyles"]:not([data-testid]) { background-color: transparent !important; color: var(--cp-accent, var(--colors-accent-bright)) !important; }
[data-testid="command-center-panel"] button { margin: 0 6px !important; padding: 8px 10px !important; border-radius: 6px !important; }
[data-testid="combobox-desktop-container"]:not([${TAG}]) > div:first-child > div { padding: 4px 12px !important; }
[data-testid="combobox-desktop-container"]:not([${TAG}]) > div:nth-child(2) button { min-height: 28px !important; margin: 0 4px !important; padding: 0 8px !important; }
/* Picker rows sit 4px inside a 12px card with a 1px border: 12 - 1 - 4 = 7px keeps their corners concentric with the card's. */
[data-testid="combobox-desktop-container"]:not([${TAG}="models"]) button { border-radius: 7px !important; }
:is(:is([data-testid="combobox-desktop-container"]:not([${TAG}]) > div:nth-child(2) button, [data-cp-part="menu"] [role="menuitem"]) > div:nth-child(2), [data-testid="command-center-panel"] button > div > div:first-child > div:nth-child(2)) > :first-child { font-size: 13px !important; font-weight: 500 !important; }

/* Pin the bottom while the chat follows output. Paseo scrolls to the bottom a frame after a row grows (streaming text, a tool call
   finishing), so one frame painted with the bottom cut off: the jitter. With every child but the last (its bottom inset) out of
   scroll anchoring, the browser keeps that inset in place in the same layout. Scrolled up, Paseo sets overflow-anchor: none on the
   scroller, which turns this off. Measured on a streaming reply: off-bottom frames went from 12/33 to 0/69. */
[data-testid="agent-chat-scroll"] > div > :not(:last-child) { overflow-anchor: none !important; }

[data-cp-part="composer"] { border-radius: 12px !important; padding: 14px 10px 10px 16px !important; gap: 20px !important; }
@supports (corner-shape: squircle) { [data-cp-part="composer"] { border-radius: 28px !important; corner-shape: squircle; } }
/* Paseo keeps the box two lines tall even when empty; let it size to its text instead (one line, up to 400px). */
/* Paseo pulls the toolbar 6px past both sides; keep it on the left (the + lines up with the text) but not the right, so Send sits as far from the edge as from the bottom. */
[data-cp-part="composer"] > div:last-child { margin-right: 0 !important; }
[data-testid="message-input-root"] textarea { field-sizing: content !important; height: auto !important; min-height: 21px !important; }
[data-cp-part="input-extra"] { display: none !important; }
/* The / popup: one card like the plugin's pickers. Paseo stacks a detail card for the highlighted command over the list; the card
   turns them around so the detail is the list's footer, next to the input, with the argument hint as a mono chip beside the name. */
${SLASH} > div { background-color: var(--cp-raised, var(--colors-surface1)) !important; border: 1px solid var(--cp-rule, var(--colors-border)) !important; border-radius: 16px !important; padding: 4px !important; gap: 0 !important; flex-direction: column-reverse !important; overflow: hidden !important; box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35) !important; }
${SLASH} > div > div { background-color: transparent !important; border-width: 0 !important; border-radius: 0 !important; box-shadow: none !important; }
${SLASH} > div[data-cp-glide] { transition: height ${SLASH_GLIDE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1) !important; }
[data-cp-part="slash-list"] > div > div { padding: 0 !important; }
[data-cp-part="slash-list"] > div > div > div { min-height: 32px !important; padding: 0 10px !important; border-radius: 11px !important; }
@supports (corner-shape: squircle) {
  ${SLASH} > div { border-radius: 28px !important; corner-shape: squircle; }
  [data-cp-part="slash-list"] > div > div > div { border-radius: 18px !important; corner-shape: squircle; }
}
[data-cp-part="slash-list"] > div > div > div > div > :first-child { font-size: 13px !important; font-weight: 500 !important; color: var(--cp-fg, var(--colors-foreground)) !important; }
[data-cp-part="slash-detail"] { display: grid !important; grid-template-columns: auto minmax(0, 1fr); align-items: center; column-gap: 8px; row-gap: 4px; margin-top: 4px !important; padding: 10px 10px 8px !important; border-top: 1px solid var(--cp-rule, var(--colors-border)) !important; }
[data-cp-part="slash-detail"] > :first-child { grid-area: 1 / 1; font-family: var(--cp-mono, ui-monospace, monospace) !important; font-size: 12px !important; color: var(--cp-accent, var(--colors-accent-bright)) !important; }
/* Skill descriptions run to paragraphs; three lines, like the row above shows one. */
[data-cp-part="slash-detail"] > :nth-child(2) { grid-area: 2 / 1 / 3 / 3; margin-top: 0 !important; font-size: 12px !important; line-height: 1.45 !important; display: -webkit-box !important; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden !important; }
[data-cp-part="slash-detail"] > :nth-child(3) { grid-area: 1 / 2; justify-self: start; max-width: 100%; margin-top: 0 !important; padding: 1px 5px !important; border: 1px solid var(--cp-rule, var(--colors-border)) !important; border-radius: 4px !important; background-color: var(--cp-sunken, var(--colors-surface0)) !important; font-family: var(--cp-mono, ui-monospace, monospace) !important; font-size: 11px !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
${CHIP} { height: 24px !important; padding: 0 7px !important; border-radius: 8px !important; }
[data-cp-part="chip"] * { font-size: 13px !important; font-weight: 500 !important; }
[data-cp-part="chip"] > div > div:last-child:nth-child(3) { display: none !important; }
${CHIP}:hover { background-color: var(--cp-control) !important; }
[data-testid="message-input-root"] ${COMPOSER_BUTTON} { width: 26px !important; min-width: 26px !important; height: 26px !important; border-radius: 8px !important; }
[data-testid="message-input-root"] [data-testid="context-window-meter"] { border-radius: 999px !important; }
button[aria-label="Stop agent"] { background-color: var(--cp-control) !important; border: 1px solid var(--cp-rule) !important; }
button[aria-label="Stop agent"] svg { width: 11px !important; height: 11px !important; stroke: var(--cp-fg) !important; fill: var(--cp-fg) !important; }
:is([data-testid="subagents-track-header"], [data-testid="composer-diff-stat-pill"]) { height: 24px !important; padding: 0 10px !important; border-radius: 999px !important; border-color: var(--cp-rule) !important; }

${PERMISSION}, ${QUESTION} { padding: 12px 14px !important; border-color: var(--cp-rule) !important; border-radius: 12px !important; }
${PERMISSION} > div:first-child, [data-testid="question-form-current-question"] { font-weight: 500 !important; color: var(--cp-fg) !important; }
[data-cp-part="permission-body"] > div > div:first-child { background-color: var(--cp-sunken) !important; border: 1px solid var(--cp-rule) !important; border-radius: 8px !important; overflow: hidden !important; }
[data-testid="permission-request-question"] { font-size: 12px !important; margin: 0 !important; }
${PERMISSION} > div:last-child, ${QUESTION} > div:last-child, ${PLAN} > div:last-child > div:last-child { justify-content: flex-end !important; }
:is(${PRIMARY}, ${SECONDARY}) { height: 28px !important; padding: 0 12px !important; border-radius: 8px !important; justify-content: center !important; }
[data-cp-part="primary"] *, [data-cp-part="secondary"] * { font-size: 13px !important; font-weight: 500 !important; }
${SECONDARY} { background-color: transparent !important; border-color: var(--cp-rule) !important; }
${PRIMARY} { background-color: var(--cp-accent) !important; border-color: var(--cp-accent) !important; }
[data-cp-part="primary"] * { color: var(--cp-accent-fg) !important; font-weight: 600 !important; }
${PRIMARY} svg { stroke: var(--cp-accent-fg) !important; }
${PRIMARY}[aria-disabled="true"] { opacity: 0.45 !important; }
${QUESTION} [role="radio"] { padding: 7px 10px !important; }
${QUESTION} [role="radio"][aria-checked="true"] { background-color: var(--cp-control) !important; }
${QUESTION} [role="radio"] > div > div:first-child { width: 14px !important; height: 14px !important; margin-top: 4px !important; }
${QUESTION} [role="radio"][aria-checked="true"] > div > div:first-child { border-color: var(--cp-accent) !important; background-color: var(--cp-accent) !important; box-shadow: inset 0 0 0 3px var(--cp-control) !important; }
${QUESTION} [role="radio"] > div > div:nth-child(2) > :first-child { color: var(--cp-fg) !important; }
/* An option's description; an option with only a preview (0.12) has that in this slot, and it keeps Paseo's size. */
${QUESTION} [role="radio"] > div > div:nth-child(2) > :nth-child(2):not([data-testid="question-form-option-preview"]) { font-size: 12px !important; line-height: 18px !important; }
${PLAN} { border-radius: 12px !important; padding: 0 !important; gap: 0 !important; border-color: var(--cp-rule) !important; overflow: hidden !important; }
${PLAN} > button:first-child { padding: 12px 16px !important; border-bottom: 1px solid var(--cp-rule) !important; }
[data-cp-part="plan-head"] * { font-weight: 600 !important; }
${PLAN} > div:nth-child(2) { padding: 14px 16px !important; }
${PLAN} > div:last-child { padding: 10px 16px 12px !important; border-top: 1px solid var(--cp-rule) !important; }

[data-testid^="chat-outline-tick-"][aria-selected="true"] > div { background-color: var(--cp-accent) !important; }
[data-testid="chat-outline-preview"] { background-color: var(--cp-raised) !important; border-radius: 12px !important; box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45) !important; }
[data-cp-part="outline-preview"] * { font-size: 13px !important; }
/* Between ticks, a copy of the last preview glides to the hovered tick until Paseo's next one takes over (ghostOutlinePreview). */
[data-testid="chat-outline-preview"][data-cp-ghost] { pointer-events: none; animation: none !important; transition: transform 100ms cubic-bezier(0.33, 1, 0.68, 1), opacity 100ms ease-out !important; }
[data-cp-ghost="out"] { opacity: 0; }
@keyframes cp-outline-in { from { transform: translateY(var(--cp-from, 0px)); } }
/* Starts where the copy's dimmed text was, so the swap has no blank frame. */
@keyframes cp-text-in { from { opacity: 0.35; transform: translateY(var(--cp-shift, 0px)); } }
[data-testid="chat-outline-preview"][data-cp-swap] { animation: cp-outline-in 100ms cubic-bezier(0.33, 1, 0.68, 1) both !important; }
[data-testid="chat-outline-preview"][data-cp-swap="new"] > * { animation: cp-text-in 100ms cubic-bezier(0.33, 1, 0.68, 1) both; }
[data-testid="chat-outline-preview"][data-cp-ghost] > * { transition: opacity 100ms ease-out; }
[data-testid="chat-outline-preview"][data-cp-ghost][data-cp-moved] > * { opacity: 0.35; }
@media (prefers-reduced-motion: reduce) { [data-testid="chat-outline-preview"]:is([data-cp-ghost], [data-cp-swap]), [data-cp-swap] > * { animation: none !important; transition: none !important; } }

/* Context window hover card: caps label, big percent with a bar (from data-cp-pct), plan pill, rounded limit bars, footer under a hairline. */
${CTX} { padding: 14px !important; gap: 14px !important; border-radius: 12px !important; border: 1px solid var(--cp-rule) !important; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.3) !important; }
${CTX_HEAD} { display: grid !important; grid-template-columns: auto 1fr; column-gap: 6px; row-gap: 6px; align-items: baseline; }
${CTX_HEAD} > :nth-child(1) { grid-column: 1 / -1; font-size: 11px !important; font-weight: 600 !important; letter-spacing: 0.06em; text-transform: uppercase; color: var(--cp-muted) !important; }
${CTX_HEAD} > :nth-child(2) { grid-column: 1; grid-row: 2; }
${CTX_HEAD} > [data-cp-pct] { font-size: 0 !important; }
${CTX_HEAD} > [data-cp-pct]::before { content: attr(data-cp-pct) "%"; margin-right: 6px; font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--cp-fg); }
${CTX_HEAD} > [data-cp-pct]::after { content: "used"; font-size: 12px; color: var(--cp-muted); }
${CTX_HEAD} > :nth-child(3) { grid-column: 2; grid-row: 2; justify-self: end; font-family: var(--cp-mono) !important; font-size: 12px !important; }
${CTX_HEAD}[data-cp-level]::after { content: ""; grid-column: 1 / -1; grid-row: 3; height: 4px; margin-top: 2px; border-radius: 999px; background: linear-gradient(to right, var(--cp-accent) var(--cp-pct), var(--cp-control) 0); }
${CTX_HEAD}[data-cp-level="high"]::after { background: linear-gradient(to right, var(--cp-warn) var(--cp-pct), var(--cp-control) 0); }
${CTX_HEAD} > :nth-child(4) { grid-column: 1 / -1; grid-row: 4; font-size: 12px !important; color: var(--cp-muted) !important; }
${CTX} > div:nth-child(2) { background-color: var(--cp-rule) !important; }
${USAGE} > div:first-child > div:nth-child(2) { font-size: 13px !important; font-weight: 500 !important; color: var(--cp-fg) !important; }
${USAGE} > div:first-child > div:nth-child(3) { background-color: transparent !important; border: 1px solid var(--cp-rule) !important; padding: 0 7px !important; }
[data-cp-part="usage-plan"] > div { font-size: 11px !important; }
${USAGE} > div:nth-child(2) { gap: 10px !important; }
${LIMIT} { margin: 0 !important; padding: 0 !important; }
[data-cp-part="limit-body"] > div { gap: 6px !important; }
[data-cp-part="limit-body"] > div > div:first-child > div:nth-child(2) { font-variant-numeric: tabular-nums; }
[data-cp-part="limit-body"] > div > div:last-child { height: 4px !important; border-radius: 999px !important; background-color: var(--cp-control) !important; }
[data-cp-part="limit-body"] > div > div:last-child > div { border-radius: 999px !important; }
${USAGE} > div:nth-child(3) { padding-top: 12px !important; border-top: 1px solid var(--cp-rule) !important; }
[data-cp-compact] { margin: -6px -6px 0; }
[data-cp-compact] > button { display: flex; flex: 1; align-items: center; gap: 8px; height: 30px; padding: 0 8px; border: 0; border-radius: 8px; background: transparent; color: var(--cp-fg); font: inherit; font-size: 12px; font-weight: 500; text-align: left; cursor: pointer; }
[data-cp-compact] > button:hover { background-color: var(--cp-control); }
[data-cp-compact] > button > span:last-child { margin-left: auto; font-size: 11px; font-weight: 400; color: var(--cp-muted); }
[data-cp-compact][data-cp-level="high"] > button { color: var(--cp-warn); }
[data-cp-compact] > button[disabled] { opacity: 0.6; cursor: default; }
[data-cp-compact] svg { width: 13px; height: 13px; flex-shrink: 0; }
/* Paseo's card sits 8px above the meter and closes 100ms after the pointer leaves both; this strip bridges the gap. */
${CTX}::after { content: ""; position: absolute; left: 0; right: 0; top: 100%; height: 12px; }
${USAGE} > div:nth-child(4) { margin-top: -6px !important; }
`;

export const NATIVE_CSS = `
/* Settings pages (tagged by tagSettings): surfaces 12, controls 8, and one text field, 32px in a sunken well that lights up on focus.
   Settings has its own sidebar, so a reload there can come before the --cp-* colors are set: Paseo's own colors stand in. */
[data-cp-set="card"] { border-radius: 12px !important; }
[data-cp-set="control"] { height: 32px !important; min-height: 32px !important; padding-top: 0 !important; padding-bottom: 0 !important; border-radius: 8px !important; }
:is([data-cp-set="field"], [data-cp-set="area"]) { border: 1px solid var(--colors-border) !important; border-radius: 8px !important; background-color: var(--cp-sunken, color-mix(in srgb, var(--colors-surface0), #000 15%)) !important; transition: border-color 120ms ease-out, box-shadow 120ms ease-out; }
[data-cp-set="field"] { height: 32px !important; min-height: 32px !important; padding: 0 10px !important; }
:is([data-cp-set="field"], [data-cp-set="area"]):hover { border-color: color-mix(in srgb, var(--cp-muted, var(--colors-foreground-muted)) 55%, transparent) !important; }
:is([data-cp-set="field"], [data-cp-set="area"]):focus-within { border-color: var(--cp-accent, var(--colors-accent)) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--cp-accent, var(--colors-accent)) 25%, transparent) !important; }
/* The field draws focus; an input inside a wrapper field stays see-through. */
[data-cp-set-input] { outline: none !important; }
[data-cp-set-input]:not([data-cp-set]) { background-color: transparent !important; }
@supports (corner-shape: squircle) { [data-cp-set="card"] { border-radius: 28px !important; corner-shape: squircle; } }
/* Paseo's keyboard focus ring is its brand green on every theme; follow the theme's accent instead. */
:focus-visible { outline-color: var(--cp-accent, var(--colors-accent)) !important; }
${ROW} > button { padding: 2px 8px 2px 12px !important; }
${ROW} > button > div > div:first-child { width: 20px !important; height: 20px !important; margin-right: 8px !important; }
${ROW} > button > div > div:first-child svg { width: 15px !important; height: 15px !important; }
/* Paseo swaps a row's icon for a chevron on hover and while open. Like the plugin's rows, keep the icon (cached by tagParts) and show the chevron at the row's end. */
${ROW_ICON}[data-cp-chev] { position: static !important; justify-content: flex-start !important; }
${ROW_ICON}[data-cp-chev]::before { content: ""; align-self: flex-start; flex-shrink: 0; width: 15px; height: 15px; margin: 2.5px 0 0 2px; background-color: var(--cp-muted); -webkit-mask: var(--cp-row-icon, ${WRENCH_MASK}) center / 15px no-repeat; mask: var(--cp-row-icon, ${WRENCH_MASK}) center / 15px no-repeat; }
${ROW_ICON}[data-cp-chev] > div { position: absolute !important; right: 4px; top: 50%; width: 12px !important; height: 12px !important; margin-top: -6px; opacity: 0.7; display: flex !important; align-items: center !important; justify-content: center !important; }
${ROW_ICON}[data-cp-chev] svg { width: 9px !important; height: 9px !important; }
${ROW_ICON}[data-cp-chev] + div { padding-right: 18px !important; }
[data-cp-part="row-label"] > [dir]:first-child { color: var(--cp-fg) !important; }
/* Row icons hidden per kind (Paseo's groups count as merged rows, its single calls as tool calls): the slot collapses; an open or hovered row keeps its chevron at the row's end. */
${([["tool-call-group", "steps"], ["tool-call-badge", "tool"]] as const)
  .map(([testid, kind]) => {
    const slot = `:root[data-cp-rt-icon-${kind}="hide"] [data-testid="${testid}"] > button > div > div:first-child`;
    return `${slot} { width: 0 !important; margin-right: 0 !important; }\n${slot}:not([data-cp-chev]) > svg, ${slot}[data-cp-chev]::before { display: none !important; }`;
  })
  .join("\n")}
/* Running rows draw a shimmer from a transparent copy of the labels laid over them: type changes go to both so they stay aligned. */
[data-cp-part="row-label"] [dir]:first-child { font-weight: 500 !important; }
[data-testid="tool-call-badge"] > button > div > [data-cp-part="row-label"] [dir]:nth-child(2) { font-family: var(--cp-mono) !important; font-size: calc(var(--cp-code) + 1px) !important; }
/* Same pitch as the plugin's rows (TIGHT in views.tsx): 36 between rows, 20 to the reply text on either side. */
[data-testid="tool-call-group"] { margin-top: var(--cp-d-row-top) !important; margin-bottom: var(--cp-d-row-bottom) !important; }
/* The open-file button Paseo adds on hover is taller than the label; keep it from growing the row. */
[data-testid="tool-call-open-file"] { margin-top: -4px !important; margin-bottom: -4px !important; }
/* Expanded rows read like the plugin's: no filled header, children behind a 1px rule, details in a sunken block. */
${ROW} > button { background-color: transparent !important; border-color: transparent !important; border-radius: 6px !important; }
:root[data-cp-rt-steps="full"] ${ROW} > button:hover { background-color: var(--cp-raised) !important; }
/* Rows step back so the reply reads first: faded until hovered or opened (an open row's details follow its button), with no hover fill. Plugin rows do the same in views.tsx. */
:root:not([data-cp-rt-steps="full"]) ${ROW} > button:last-child:not(:hover) { opacity: var(--cp-quiet); }
[data-testid="tool-call-badge"] > button > div > [data-cp-part="row-label"] > [dir]:nth-child(2) { color: var(--cp-muted) !important; }
[data-cp-part="group-body"] > div { max-height: none !important; }
[data-cp-part="group-body"] > div > div { padding: 4px 13px 0 41px !important; position: relative !important; }
[data-cp-part="group-body"] > div > div::before { content: ""; position: absolute; left: 22px; top: 6px; bottom: 12px; width: 1px; background: var(--cp-rule); }
[data-testid="tool-call-badge"] > div:nth-child(2) { margin: 6px 13px 4px 41px !important; border: 1px solid var(--cp-rule) !important; border-radius: 8px !important; background-color: var(--cp-sunken) !important; }
[data-cp-part="badge-body"] > div > div > div { background-color: transparent !important; }
/* Paseo nests a horizontal scroller inside the vertical one, so long lines showed their scrollbar only below the last line. One box scrolls both ways instead. */
[data-cp-part="detail-scroll"] { max-height: 320px !important; overflow: auto !important; }
[data-cp-part="detail-scroll"] div { overflow: visible !important; }
[data-testid="tool-call-badge"] { margin-bottom: 10px !important; }

[data-testid="user-message"] > div > div:first-child { padding: 10px 14px !important; border-radius: 16px !important; }
@supports (corner-shape: squircle) { [data-testid="user-message"] > div > div:first-child { border-radius: 28px !important; corner-shape: squircle; } }
/* Prompts take at most 60% of the chat (never under 360px, so they stay readable in a narrow pane). */
[data-testid="user-message"] > div { max-width: max(60%, min(100%, 360px)) !important; }
/* Attachments leave the bubble: thumbnails and file cards stack above it, right-aligned, and the bubble wraps only the text.
   tagParts marks the bubble (data-cp-attach) and each row: att-images (thumbnails) or att-files (issues, PRs, reviews, text). */
[data-cp-attach] { display: flex !important; flex-direction: column !important; align-items: flex-end !important; gap: 6px; padding: 0 !important; border-radius: 0 !important; background-color: transparent !important; }
[data-cp-attach] > [data-message-text] { padding: 10px 14px; border-radius: 16px; background-color: var(--colors-surface3); }
@supports (corner-shape: squircle) { [data-cp-attach] > [data-message-text] { border-radius: 28px; corner-shape: squircle; } }
[data-cp-attach] > :is([data-cp-part="att-images"], [data-cp-part="att-files"]) { justify-content: flex-end !important; gap: 6px !important; margin: 0 !important; }
[data-cp-part="att-images"] > * { width: 104px !important; height: 104px !important; border-radius: 12px !important; border: 1px solid var(--cp-rule) !important; transition: filter 120ms; }
[data-cp-part="att-images"] > :only-child { width: 240px !important; height: 160px !important; }
[data-cp-part="att-images"] > *:hover { filter: brightness(1.08); }
[data-cp-part="att-images"] > * > div, [data-cp-part="att-images"] > * > div > * { width: 100% !important; height: 100% !important; }
[data-cp-part="att-files"] > * { border-radius: 10px !important; border: 1px solid var(--cp-rule) !important; }
[data-cp-part="att-files"] > * > div { height: 48px !important; max-width: 280px !important; padding: 0 14px 0 8px !important; gap: 10px !important; background-color: var(--cp-raised) !important; }
[data-cp-part="att-icon"] { width: 32px !important; height: 32px !important; border-radius: 8px; background-color: var(--cp-control); }
[data-cp-part="att-files"] > * > div > :last-child > :first-child { font-size: 13px !important; font-weight: 500 !important; color: var(--cp-fg) !important; }
[data-cp-part="att-files"] > * > div > :last-child > :last-child { font-size: 12px !important; color: var(--cp-muted) !important; }
/* Density (Prefs.density) and faded row strength (Prefs.steps) as variables the rules below read; views.tsx matches them (TIGHT, QUIET). */
:root { --cp-d-item: 6px; --cp-d-pad: 4px; --cp-d-row-top: 2px; --cp-d-row-bottom: -8px; --cp-d-footer: 16px; --cp-d-prompt: 8px; --cp-d-li: 6px; --cp-quiet: 0.45; }
:root[data-cp-rt-density="compact"] { --cp-d-item: 2px; --cp-d-pad: 2px; --cp-d-row-top: 0px; --cp-d-row-bottom: -12px; --cp-d-footer: 12px; --cp-d-prompt: 0px; --cp-d-li: 3px; }
:root[data-cp-rt-density="spacious"] { --cp-d-item: 12px; --cp-d-pad: 6px; --cp-d-row-top: 5px; --cp-d-row-bottom: -3px; --cp-d-footer: 22px; --cp-d-prompt: 18px; --cp-d-li: 10px; }
:root[data-cp-rt-steps="dim"] { --cp-quiet: 0.3; }
:root[data-cp-rt-steps="soft"] { --cp-quiet: 0.65; }
/* Chat rhythm (15px text): 18 between paragraphs, 20 between text and step rows, ~21 to the turn footer, 28 from a prompt to its
   reply, 46 between turns. Paseo stacks three spacings per reply block (its item's 12/16 margin, 12 padding at a reply's ends,
   12 under each paragraph), which left 28 between paragraphs and pushed rows and prompts apart. */
[data-cp-part="msg-item"] { margin-bottom: var(--cp-d-item) !important; }
[data-testid="assistant-message"] { padding-top: var(--cp-d-pad) !important; padding-bottom: var(--cp-d-pad) !important; }
/* A paragraph alone in its block; consecutive paragraphs (a quote, the plan card) keep Paseo's gap between them. */
[data-testid="assistant-message"] ${md("p")}:last-child { margin-bottom: 0 !important; }
/* The timestamp and rewind row under a prompt only shows on hover; let it overlap the gap below instead of adding 32px to it. */
[data-testid="user-message-trailing-row"] { margin-top: 2px !important; margin-bottom: -5px !important; }
/* The turn footer, and the working line while the agent runs (it has the same fork button): close under reply text, which ends
   with spare padding, and about 20 under a step row, whose -8 bottom margin (TIGHT) would otherwise pull it in. */
[data-cp-part="footer-gap"] { margin-top: var(--cp-d-footer) !important; }
[data-cp-part="footer-gap"][data-cp-tight] { margin-top: 2px !important; }
[data-testid="user-message"] { margin-top: var(--cp-d-prompt) !important; }
[data-testid="user-message"] > div > div:first-child > :last-child { line-height: 1.55 !important; }

${MSG} span { line-height: 1.6 !important; }
${MSG} ${INLINE_CODE} { border-radius: 4px !important; padding: 2px 5px !important; }
${MSG} ${md("strong")}, ${MSG} ${md("strong")} span { font-weight: 600 !important; }
${MSG} ${HEADING(1)} { font-size: 24px !important; line-height: 1.3 !important; }
${MSG} ${HEADING(2)} { font-size: 20px !important; line-height: 1.3 !important; }
${MSG} ${HEADING(3)} { font-size: 16px !important; line-height: 1.3 !important; }
${MSG} ${md("h1")}, ${MSG} ${md("h2")} { border-bottom-width: 0 !important; padding-bottom: 0 !important; }
${MSG} ${md("li")}:not(:last-child) { margin-bottom: var(--cp-d-li) !important; }
${MSG} ${md("li")}:last-child { margin-bottom: 0 !important; }
${MSG} ${MARK} { margin: 0 10px 0 4px !important; line-height: calc(var(--cp-content) * 1.6) !important; }
${MSG} ${MARK_OL} { font-family: var(--cp-mono) !important; font-size: calc(var(--cp-code) + 1px) !important; }
${MSG} ${md("blockquote")} { background: transparent !important; border-left: 2px solid var(--cp-accent) !important; border-radius: 0 !important; padding: 2px 0 2px 14px !important; margin: 4px 0 !important; }
${MSG} ${md("blockquote")} > :last-child { margin-bottom: 0 !important; }
${MSG} ${md("blockquote")} span { font-style: italic !important; color: var(--cp-muted) !important; }
${MSG} ${md("table")} { border-radius: 8px !important; border-color: var(--cp-rule) !important; overflow: hidden !important; }
${MSG} ${md("table")} > div > div { border-color: var(--cp-rule) !important; }
${MSG} ${md("table")} > div:last-child > div:last-child { border-bottom-width: 0 !important; }
${MSG} ${md("table")} > div > div > div { padding: 9px 14px !important; border-right-width: 0 !important; border-bottom-width: 0 !important; background: transparent !important; }
${MSG} ${md("table")} > div:first-child { background: var(--cp-raised) !important; }
${MSG} ${md("table")} span:not(${INLINE_CODE}) { font-size: calc(var(--cp-content) - 1px) !important; }
${MSG} ${md("table")} span { line-height: 1.45 !important; }
${MSG} ${md("table")} > div:first-child span:not(${INLINE_CODE}) { font-size: 12px !important; font-weight: 600 !important; color: var(--cp-muted) !important; }
${CODE_BLOCK} { background: var(--cp-sunken) !important; border-color: var(--cp-rule) !important; border-radius: 8px !important; padding: 12px 14px !important; }
${CODE_BLOCK} :is(div, span) { line-height: 1.5 !important; }
/* Code block A: the language in a header strip, with Paseo's copy button in it. B floats the language instead; C has none. */
:root:not([data-cp-rt-code="b"]):not([data-cp-rt-code="c"]) ${CODE_BLOCK}${LANG} { padding-top: 0 !important; }
:root:not([data-cp-rt-code="b"]):not([data-cp-rt-code="c"]) ${CODE_BLOCK}${LANG}::before { content: attr(data-paseo-markdown-language); margin: 0 -14px 10px; padding: 7px 14px; border-bottom: 1px solid var(--cp-rule); font-family: var(--cp-mono); font-size: 12px; line-height: 18px; color: var(--cp-muted); }
:root:not([data-cp-rt-code="b"]):not([data-cp-rt-code="c"]) ${CODE_BLOCK}${LANG} > button[aria-label="Copy code"] { top: 5px !important; opacity: 0.6 !important; }
:root:not([data-cp-rt-code="b"]):not([data-cp-rt-code="c"]) ${CODE_BLOCK}${LANG} > button[aria-label="Copy code"]:hover { opacity: 1 !important; }
/* Mermaid: the diagram itself is themed inside its frame (themeMermaid); the card matches code blocks, its zoom controls faint until hover. */
[data-testid="mermaid-viewport"] { background-color: var(--cp-sunken) !important; border-color: var(--cp-rule) !important; border-radius: 8px !important; }
[data-testid="mermaid-viewport"] [data-testid="zoomable-viewport-toolbar"] { opacity: 0.6; transition: opacity 0.15s; }
[data-testid="mermaid-viewport"]:hover [data-testid="zoomable-viewport-toolbar"] { opacity: 1; }
/* Over a diagram's source, Paseo puts its "View diagram" button where the code block's copy button is; it sits beside it instead. */
[data-cp-part="diagram-toggle"] { right: 34px !important; opacity: 0.6; }
[data-cp-part="diagram-toggle"]:hover { opacity: 1; }
:root:not([data-cp-rt-code="b"]):not([data-cp-rt-code="c"]) [data-cp-part="diagram-toggle"] { top: 5px !important; }
/* Redraw (redrawDiagram) takes the toggle's spot; when Paseo adds its toggle after it, the toggle moves one further left. */
[data-cp-redraw] { position: absolute; top: 8px; right: 34px; width: 22px; height: 22px; padding: 0; border: 0; cursor: pointer; opacity: 0.6; background-color: var(--cp-muted); -webkit-mask: ${REDRAW_MASK} center / 14px no-repeat; mask: ${REDRAW_MASK} center / 14px no-repeat; }
:root:not([data-cp-rt-code="b"]):not([data-cp-rt-code="c"]) [data-cp-redraw] { top: 5px; }
[data-cp-redraw]:hover { opacity: 1; }
[data-cp-redraw="failed"] { background-color: var(--cp-warn); opacity: 1; }
[data-cp-part="diagram-toggle"] ~ [data-cp-redraw], [data-cp-redrawn] > :is([data-paseo-markdown-language], [data-cp-redraw], [data-cp-part="diagram-toggle"]) { display: none !important; }
[data-cp-redraw] ~ [data-cp-part="diagram-toggle"] { right: 58px !important; }
[data-cp-redraw-card] { display: flex; justify-content: center; padding: 12px; cursor: zoom-in; border: 1px solid var(--cp-rule); border-radius: 8px; background-color: var(--cp-sunken); }
[data-cp-redraw-card] > iframe { display: block; width: 100%; height: 120px; border: 0; background: transparent; pointer-events: none; }
[data-cp-diagram-full] { position: fixed; inset: 0; z-index: 2147483000; padding: 32px; background-color: var(--cp-sunken); cursor: zoom-out; }
[data-cp-diagram-full] > iframe { display: block; width: 100%; height: 100%; border: 0; background: transparent; pointer-events: none; }
/* Images in a reply that also has text (tool screenshots land at the end of the text before them) get the plugin's thumbnail size; Paseo's own button still opens the full image. */
${THUMBS} { width: auto !important; min-height: 0 !important; margin: 6px 8px 2px 0 !important; }
:root:not([data-cp-rt-images="native"]) ${MSG} [data-cp-part="image-text"] > [dir] { flex-basis: 100% !important; }
${THUMBS} > button { width: var(--cp-thumb-w) !important; height: var(--cp-thumb-h) !important; aspect-ratio: auto !important; border: 1px solid var(--cp-rule) !important; border-radius: 8px !important; background-color: var(--cp-raised) !important; }
${THUMBS} > button div { width: 100% !important; height: 100% !important; background-size: cover !important; }
:root { --cp-thumb-w: 200px; --cp-thumb-h: 128px; }
:root[data-cp-rt-images="large"] { --cp-thumb-w: 320px; --cp-thumb-h: 200px; }

/* The same design on Paseo 0.12's renderer. A whole reply is one block now, so the gap between paragraphs is its children's
   margin: the 0.11 spacing (item margin plus padding on both ends), with the 1.6 line height's leading on top. */
${MD} > * { margin-bottom: calc(var(--cp-d-item) + 2 * var(--cp-d-pad)) !important; }
${MD} > :last-child, ${MD} :is(blockquote, .enrm-admonition, li) > p:last-child { margin-bottom: 0 !important; }
${MD} :is(p, li, blockquote) { line-height: 1.6 !important; }
${MD} code { border-radius: 4px !important; padding: 2px 5px !important; }
${MD} strong { font-weight: 600 !important; }
${MD} h1 { font-size: 24px !important; line-height: 1.3 !important; }
${MD} h2 { font-size: 20px !important; line-height: 1.3 !important; }
${MD} h3 { font-size: 16px !important; line-height: 1.3 !important; }
${MD} li { margin-top: 0 !important; }
${MD} li:not(:last-child) { margin-bottom: var(--cp-d-li) !important; }
${MD} ol > li::marker { font-family: var(--cp-mono); font-size: calc(var(--cp-code) + 1px); }
${MD} blockquote { background: transparent !important; border-inline-start: 2px solid var(--cp-accent) !important; border-radius: 0 !important; padding: 2px 0 2px 14px !important; }
${MD} blockquote p { font-style: italic !important; color: var(--cp-muted) !important; }
${MD} table { border-collapse: separate !important; border-spacing: 0 !important; border: 1px solid var(--cp-rule) !important; border-radius: 8px !important; overflow: hidden !important; }
${MD} > div:not(.enrm-admonition) { border-radius: 8px !important; }
${MD} :is(th, td) { padding: 9px 14px !important; border-width: 0 0 1px !important; border-color: var(--cp-rule) !important; line-height: 1.45 !important; }
${MD} tbody > tr:last-child > td { border-bottom-width: 0 !important; }
${MD} tbody > tr { background: transparent !important; }
${MD} td { font-size: calc(var(--cp-content) - 1px) !important; }
${MD} th { background: var(--cp-raised) !important; font-size: 12px !important; font-weight: 600 !important; color: var(--cp-muted) !important; }
${MD} hr { border-top-color: var(--cp-rule) !important; }
:root:not([data-cp-rt-images="native"]) ${MD} img { width: var(--cp-thumb-w) !important; height: var(--cp-thumb-h) !important; object-fit: cover !important; border: 1px solid var(--cp-rule) !important; border-radius: 8px !important; background-color: var(--cp-raised) !important; margin: 6px 8px 2px 0 !important; }
${CHAT_CHROME_CSS}`;

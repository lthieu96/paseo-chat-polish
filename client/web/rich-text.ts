// Rich text variants (Dashboard → Rich text): callouts, tasks and line numbers marked in replies, and each variant's CSS.
import { Platform } from "react-native";
import { t } from "../i18n";
import { within, type DomElement, type WebDocument } from "./dom";
import { icon } from "./icons";
import { redrawDiagram } from "./mermaid";
import { ADMONITION, CODE_BLOCK, LANG, md, DOC, MERMAID_SOURCE, TASK_BOX } from "./selectors";

declare const document: WebDocument;

const CALLOUT_KIND: Record<string, [string, string]> = { note: ["note", "Note"], important: ["important", "Important"], tip: ["tip", "Tip"], warning: ["warning", "Warning"], caution: ["caution", "Caution"] };

/**
 * Marks what the markdown leaves for the restyle to find: a callout's kind (only in its header text), code blocks' line
 * numbers, and a redraw button on a diagram's source.
 * Runs on added nodes and again once streaming settles.
 */
export function markBlocks(roots: DomElement[]) {
  const find = (selector: string) => roots.flatMap((root) => (root === document.documentElement ? Array.from(root.querySelectorAll(selector)) : [root.closest(selector) ?? null, ...within([root], selector)].filter((el): el is DomElement => !!el)));
  // Paseo draws callouts itself (an icon and the kind's name over the text); its kind is only in that name.
  for (const box of find(`${ADMONITION}:not([data-cp-callout])`)) {
    const head = box.firstElementChild;
    const kind = CALLOUT_KIND[head?.textContent?.trim().toLowerCase() ?? ""];
    if (!head || !kind) continue;
    box.setAttribute("data-cp-callout", kind[0]);
    head.setAttribute("data-cp-callout-head", "");
  }
  for (const code of find(`${CODE_BLOCK} > div:first-child`)) {
    const count = (code.textContent ?? "").replace(/\n$/, "").split("\n").length;
    if (code.getAttribute("data-cp-lines")?.split("\n").length !== count) code.setAttribute("data-cp-lines", Array.from({ length: count }, (_, i) => i + 1).join("\n"));
  }
  // The source block only: from Paseo 0.18 a drawn diagram's display: contents wrapper carries the same language mark.
  for (const pre of find(MERMAID_SOURCE)) {
    const box = pre.parentElement;
    if (!box || box.querySelector(":scope > [data-cp-redraw]")) continue;
    const button = document.createElement("button");
    button.setAttribute("data-cp-redraw", "");
    button.setAttribute("aria-label", t("web.redrawDiagram"));
    button.setAttribute("title", t("web.redrawDiagram"));
    button.addEventListener("click", () => redrawDiagram(box, button));
    box.appendChild(button);
  }
}

/** Sets the plugin's UI language on <html>, for the few strings the injected CSS has to word itself ("Copy", "Queued"). */
export function setLanguage(language: string) {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  document.documentElement.setAttribute("data-cp-lang", language);
}

/** Shows the chosen variant of each markdown element, and the image size; "a" needs no attribute. */
export function setRichText(choices: Record<string, string>) {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  for (const [element, variant] of Object.entries(choices)) {
    if (variant === "a") document.documentElement.removeAttribute(`data-cp-rt-${element}`);
    else document.documentElement.setAttribute(`data-cp-rt-${element}`, variant);
  }
}

const INFO_MASK = icon("Info", '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>');
const ALERT_MASK = icon("TriangleAlert", '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>');
const TIP_MASK = icon("Lightbulb", '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>');
const CHECK_MASK = icon("Check", '<path d="M20 6 9 17l-5-5"/>');
const IMPORTANT_MASK = icon("MessageSquareWarning", '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M12 15h.01"/><path d="M12 7v4"/>');
const CAUTION_MASK = icon("OctagonAlert", '<path d="M12 16h.01"/><path d="M12 8v4"/><path d="M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z"/>');

// DOC: the variants also reach a .md file open in the file pane.
const RT = (element: string, variant: string) => `:root[data-cp-rt-${element}="${variant}"] ${DOC}`;

export const RICH_TEXT_CSS = `
${RT("code", "b")} ${md("pre")} { border-width: 0 !important; }
${RT("code", "b")} button[aria-label="Copy code"] { opacity: 0.35; transition: opacity 120ms; }
${RT("code", "b")} ${md("pre")}:hover button[aria-label="Copy code"] { opacity: 1; }
${RT("code", "b")} ${md("pre")}${LANG}::before { content: attr(data-paseo-markdown-language); position: absolute; top: 11px; right: 38px; font-family: var(--cp-mono); font-size: 11px; line-height: 16px; color: var(--cp-muted); opacity: 0.6; transition: opacity 120ms; }
${RT("code", "b")} ${md("pre")}${LANG}:hover::before { opacity: 1; }
${RT("code", "c")} ${md("pre")} { background: transparent !important; }
${RT("code", "c")} ${md("pre")} > div:first-child { position: relative !important; padding-left: 32px !important; }
${RT("code", "c")} ${md("pre")} > div:first-child::before { content: attr(data-cp-lines); position: absolute; left: 0; top: 0; width: 18px; text-align: right; white-space: pre; font-family: var(--cp-mono); font-size: var(--cp-code); line-height: 1.5; color: var(--cp-muted); opacity: 0.6; }

/* Callouts and task boxes are Paseo's own; markBlocks tags a callout's kind. */
${RT("quote", "b")} .enrm-text blockquote { border-inline-start-width: 0 !important; border-radius: 8px !important; background: var(--cp-raised) !important; padding: 10px 14px 10px 36px !important; position: relative !important; }
${RT("quote", "b")} .enrm-text blockquote::before { content: "\\201C"; position: absolute; left: 13px; top: 6px; font-size: 24px; line-height: 1; font-weight: 600; color: var(--cp-accent); }
${RT("quote", "b")} .enrm-text blockquote p { font-style: normal !important; color: var(--cp-fg) !important; }
${RT("quote", "c")} .enrm-text blockquote { border-inline-start-width: 0 !important; padding: 0 0 0 20px !important; }

${RT("table", "b")} .enrm-text table { border-width: 0 !important; border-radius: 6px !important; }
${RT("table", "b")} .enrm-text th { background: transparent !important; }
${RT("table", "b")} .enrm-text :is(th, td) { border-bottom-width: 0 !important; }
${RT("table", "b")} .enrm-text tbody > tr:nth-child(odd) > td { background: var(--cp-raised) !important; }
${RT("table", "b")} .enrm-text td:first-child { border-radius: 6px 0 0 6px !important; }
${RT("table", "b")} .enrm-text td:last-child { border-radius: 0 6px 6px 0 !important; }
${RT("table", "c")} .enrm-text table { border-width: 0 !important; border-radius: 0 !important; }
${RT("table", "c")} .enrm-text th { background: transparent !important; }
${RT("table", "c")} .enrm-text td { border-bottom-width: 0 !important; }
${RT("table", "c")} .enrm-text :is(th, td) { padding: 7px 12px 7px 0 !important; }
${RT("table", "d")} .enrm-text :is(th, td):not(:last-child) { border-right: 1px solid var(--cp-rule) !important; }

${RT("inline", "b")} .enrm-text code { background: transparent !important; padding: 0 1px !important; color: var(--cp-warn) !important; }
${RT("inline", "c")} .enrm-text code { background: transparent !important; box-shadow: inset 0 0 0 1px var(--cp-rule) !important; }

${RT("heading", "b")} .enrm-text h1 { font-size: 18px !important; padding-bottom: 6px !important; border-bottom: 1px solid var(--cp-rule) !important; }
${RT("heading", "b")} .enrm-text h2 { font-size: 15px !important; }
${RT("heading", "b")} .enrm-text h3 { font-size: 12px !important; text-transform: uppercase !important; letter-spacing: 0.06em !important; color: var(--cp-muted) !important; }
${RT("heading", "c")} .enrm-text :is(h1, h2) { border-left: 3px solid var(--cp-accent) !important; padding-left: 10px !important; }
${RT("heading", "c")} .enrm-text h3::before { content: "### "; font-family: var(--cp-mono); font-size: var(--cp-code); font-weight: 400; color: var(--cp-muted); }

${RT("list", "b")} .enrm-text ul > li::marker { content: "\\2013  "; color: var(--cp-muted); }
${RT("list", "b")} .enrm-text ol > li::marker { content: counter(list-item) ") "; color: var(--cp-muted); }
${RT("list", "c")} .enrm-text li::marker { content: "\\00B7  "; font-weight: 700; color: var(--cp-muted); }
${RT("list", "c")} .enrm-text li:not(:last-child) { margin-bottom: 2px !important; }

${TASK_BOX} { appearance: none !important; position: relative !important; flex: none; box-sizing: border-box !important; border: 1.5px solid var(--cp-muted) !important; border-radius: 3px !important; margin: 0 10px 0 0 !important; vertical-align: -2px !important; }
${TASK_BOX}:checked { background: var(--cp-accent) !important; border-color: var(--cp-accent) !important; }
${TASK_BOX}:checked::after { content: ""; position: absolute; inset: 1px; background: var(--cp-accent-fg); -webkit-mask: ${CHECK_MASK} center / contain no-repeat; mask: ${CHECK_MASK} center / contain no-repeat; }
:root[data-cp-rt-list="b"] ${TASK_BOX} { border-radius: 999px !important; }
:root[data-cp-rt-list="b"] ${TASK_BOX}:checked { background: transparent !important; border-color: var(--cp-ok) !important; }
:root[data-cp-rt-list="b"] ${TASK_BOX}:checked::after { background: var(--cp-ok); }

${ADMONITION} { --cp-tone: var(--cp-accent); --cp-icon: ${INFO_MASK}; position: relative !important; border-inline-start-width: 0 !important; border-radius: 8px !important; padding: 10px 14px 10px 36px !important; background: color-mix(in srgb, var(--cp-tone) 12%, transparent) !important; }
${ADMONITION}[data-cp-callout="important"] { --cp-tone: var(--colors-status-merged); --cp-icon: ${IMPORTANT_MASK}; }
${ADMONITION}[data-cp-callout="tip"] { --cp-tone: var(--cp-ok); --cp-icon: ${TIP_MASK}; }
${ADMONITION}[data-cp-callout="warning"] { --cp-tone: var(--cp-warn); --cp-icon: ${ALERT_MASK}; }
${ADMONITION}[data-cp-callout="caution"] { --cp-tone: var(--colors-status-danger); --cp-icon: ${CAUTION_MASK}; }
${ADMONITION} p { color: var(--cp-fg) !important; }
${ADMONITION} [data-cp-callout-head] { margin-bottom: 2px !important; font-size: 13px !important; font-weight: 600 !important; line-height: 1.6 !important; color: var(--cp-tone) !important; }
/* Paseo's markdown library draws Octicons; the svg box stays as the slot and shows the plugin's Lucide icon instead. */
${ADMONITION} [data-cp-callout-head] svg { position: absolute; left: 13px; top: 13px; width: 14px; height: 14px; background: var(--cp-tone); -webkit-mask: var(--cp-icon) center / contain no-repeat; mask: var(--cp-icon) center / contain no-repeat; }
${ADMONITION} [data-cp-callout-head] svg > * { display: none; }
${RT("callout", "b")} .enrm-admonition { background: transparent !important; border-radius: 0 !important; border-inline-start: 2px solid var(--cp-tone) !important; padding: 2px 0 2px 14px !important; }
${RT("callout", "b")} .enrm-admonition [data-cp-callout-head] { font-size: 11px !important; text-transform: uppercase; letter-spacing: 0.06em; }
${RT("callout", "b")} .enrm-admonition [data-cp-callout-head] svg { display: none; }
${RT("callout", "c")} .enrm-admonition { background: transparent !important; border-radius: 0 !important; padding: 0 0 0 24px !important; }
${RT("callout", "c")} .enrm-admonition [data-cp-callout-head] { display: inline !important; }
${RT("callout", "c")} .enrm-admonition [data-cp-callout-head] svg { left: 0; top: calc(var(--cp-content) * 0.8 - 7px); }
${RT("callout", "c")} .enrm-admonition [data-cp-callout-head]::after { content: " \\2014  "; }
${RT("callout", "c")} .enrm-admonition p { display: inline !important; }

${RT("rule", "b")} .enrm-text hr { border-top-width: 0 !important; height: auto !important; text-align: center; }
${RT("rule", "b")} .enrm-text hr::before { content: "\\2022  \\2022  \\2022"; font-size: 12px; letter-spacing: 0.2em; color: var(--cp-muted); }
${RT("rule", "c")} .enrm-text hr { width: 48px !important; border-top-color: var(--cp-border, var(--cp-rule)) !important; }
`;

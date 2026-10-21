/** Paseo's DOM as the restyle knows it: testIDs, markdown marks and the parts tagParts tags. One place to fix when Paseo's markup moves. */

export const TAG = "data-chat-polish";
// Assistant replies, plus the plan body Paseo renders with the same markdown (tagged in tagParts: a positional pseudo-class here
// would be tested on every ancestor of every markdown node).
export const MSG = ':is([data-testid="assistant-message"], [data-cp-plan-md])';
export const ROW = ':is([data-testid="tool-call-group"], [data-testid="tool-call-badge"])';
export const ROW_ICON = `${ROW} > button > div > div:first-child`;
// Parts Paseo marks only through a child, and containers whose every descendant is restyled, are tagged by tagParts.
// :has(), and "X *" where X is only known by data-testid (on nearly every ancestor), re-match the whole timeline
// on every node a scroll mounts, which made fast scrolling stutter.
// Paseo marks each markdown part for its copy-as-markdown feature; the restyle keys on those marks.
export const md = (tag: string) => `[data-paseo-markdown-tag="${tag}"]`;
export const INLINE_CODE = `span${md("code")}`;
export const HEADING = (n: number) => `${md(`h${n}`)} > [dir] > span`;
export const MARK = "[data-paseo-markdown-list-marker]";
export const MARK_UL = `${md("ul")} > ${md("li")} > ${MARK}`;
export const MARK_OL = `${md("ol")} > ${md("li")} > ${MARK}`;
export const CODE_BLOCK = `${MSG} ${md("pre")}`;
// Paseo 0.12 renders markdown as plain HTML (p, h1, li, table, …) inside .enrm-text, styled inline and without the marks above,
// except code fences, which keep them. The md() rules for other elements only match 0.11's renderer (plugin v0.2.x).
export const MD = `${MSG} .enrm-text`;
export const TASK_BOX = `${MD} li > span > input[type="checkbox"]`;
export const ADMONITION = `${MD} .enrm-admonition`;
// Fences that name a language (```ts); Paseo leaves the attribute off otherwise.
export const LANG = '[data-paseo-markdown-language]:not([data-paseo-markdown-language=""])';
export const SLASH = '[data-testid="composer-autocomplete-popover"]';
export const SLASH_GLIDE_MS = 140;
export const CHIP = ':is([data-testid="combined-model-selector"], [data-testid="agent-thinking-selector"], [data-testid="mode-control"])';
export const PERMISSION = '[data-cp-part="permission"]';
export const PLAN = '[data-testid="permission-plan-card"]';
export const CTX = '[data-cp-part="context"]';
export const CTX_HEAD = `${CTX} > div:first-child`;
export const USAGE = `${CTX} > [data-testid^="usage-report-"]`;
export const LIMIT = '[data-cp-part="usage-limits"] > div';
export const QUESTION = '[data-testid="question-form-card"]';
export const PRIMARY = ':is([data-testid="permission-request-accept"], [data-testid="question-form-primary-action"])';
export const SECONDARY = ':is([data-testid="permission-request-deny"], [data-testid="question-form-dismiss"])';
export const WORKING_BOX = '[data-cp-part="loader"]';
export const SURFACE = ':is([data-testid="combobox-desktop-container"], [data-cp-part="menu"], [role="menu"], [role="listbox"], [data-testid="command-center-panel"])';
export const SETTINGS_PANE = '[data-testid="settings-detail-pane"]';
export const POP = '[data-testid="combobox-desktop-container"]';

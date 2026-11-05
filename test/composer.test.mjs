import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { prefsSchema } from "../shared/timeline.ts";

const modules = {};
function load(name) {
  if (modules[name]) return modules[name];
  const exports = modules[name] = {};
  const source = ts.transpileModule(readFileSync(new URL(`../client/${name}.ts`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const resolve = (id) => id.split("/").reduce((path, part) => part === ".." ? path.slice(0, -1) : part === "." ? path : [...path, part], name.split("/").slice(0, -1)).join("/");
  new Function("exports", "require", source)(exports, (id) => id === "react-native" ? { Platform: { OS: "web" } } : id.startsWith(".") ? load(resolve(id)) : require(id));
  return exports;
}
const { COMPOSER_BUTTON_CSS, nativeRestyleCss, NATIVE_CSS } = load("web/restyle-css");

test("composer defaults keep every existing surface and use one track style", async () => {
  const prefs = prefsSchema.parse({});
  const css = nativeRestyleCss(prefs);
  const actual = css.prefixCss + css.toolRowsCss + css.userMessagesCss + css.baseCss + css.markdownCss + css.composerCss;
  const expected = NATIVE_CSS + COMPOSER_BUTTON_CSS;
  assert.equal(actual.replace(/\s+/g, " "), expected.replace(/\s+/g, " "));
  assert.equal(prefs.composerButtonIconSize, "13");
  assert.equal(prefs.composerButtonSize, "24");
  assert.equal(prefs.sidebarEntry, "show");
  assert.deepEqual(prefs.surfaces, { composer: "show", userMessages: "show", toolRows: "show", markdown: "show" });
  assert.doesNotMatch(COMPOSER_BUTTON_CSS, /--cp-native-icon|--cp-plugin-icon/);
  assert.match(COMPOSER_BUTTON_CSS, /--cp-track-icon: 13px/);
  assert.match(COMPOSER_BUTTON_CSS, /--cp-track-height: 24px/);
  for (const size of [12, 13, 14, 16]) assert.match(COMPOSER_BUTTON_CSS, new RegExp(`data-cp-rt-track-icon="${size}"`));
  for (const size of [26, 28]) assert.match(COMPOSER_BUTTON_CSS, new RegExp(`data-cp-rt-track-height="${size}"`));
  assert.match(COMPOSER_BUTTON_CSS, /composer-diff-stat-pill/);
  assert.doesNotMatch(COMPOSER_BUTTON_CSS, /plugin-button-/);
  assert.match(COMPOSER_BUTTON_CSS, /:has\(> \[data-testid="composer-diff-stat-pill"\]\)/);
  assert.doesNotMatch(COMPOSER_BUTTON_CSS, /message-input-attach-button|Stop agent|Start dictation|Send message/);
});

test("each surface can independently fall back without changing the others", async () => {
  const { ROW, BUBBLE, MSG } = await import("../client/web/selectors.ts");
  const prefs = prefsSchema.parse({ surfaces: { composer: "hide", userMessages: "hide", toolRows: "hide", markdown: "hide" } });
  const css = nativeRestyleCss(prefs);
  assert.equal(css.composerCss, "");
  assert.equal(css.userMessagesCss, "");
  assert.equal(css.toolRowsCss, "");
  assert.equal(css.markdownCss, "");
  assert.ok(css.baseCss.length > 0);
  assert.ok(!css.baseCss.includes(`${ROW} > button`));
  assert.ok(!css.baseCss.includes(`${BUBBLE} { padding`));
  assert.ok(!css.baseCss.includes(`${MSG} span`));
});

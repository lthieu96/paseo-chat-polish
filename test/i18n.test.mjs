import assert from "node:assert/strict";
import { test } from "node:test";
import { toolData } from "../client/model.ts";
import { stepSummary } from "../client/steps.ts";
import { currentLanguage, followLocale, languageFor } from "../client/i18n.ts";
import { translate, translator } from "../shared/i18n.ts";

const tool = (detail, extra = {}) => ({ type: "tool_call", callId: "1", name: "Bash", status: "completed", error: null, detail, ...extra });

test("messages translate with placeholders in both languages", () => {
  assert.equal(translate("en", "prefs.status.failed", { error: "disk full" }), "Save failed: disk full");
  assert.equal(translate("zh", "prefs.status.failed", { error: "磁盘已满" }), "保存失败：磁盘已满");
  assert.equal(translate("en", "theme.copySuffix", { name: "Mariana" }), "Mariana copy");
  assert.equal(translate("zh", "theme.copySuffix", { name: "Mariana" }), "Mariana 副本");
  // A bound translator words many strings in one language.
  const zh = translator("zh");
  assert.equal(zh("chat.tasks"), "任务");
  assert.equal(zh("tool.canceled"), "已取消");
});

test("counts follow each language's grammar", () => {
  assert.equal(translate("en", "summary.commands", { n: 1 }), "ran 1 command");
  assert.equal(translate("en", "summary.commands", { n: 3 }), "ran 3 commands");
  assert.equal(translate("zh", "summary.commands", { n: 3 }), "运行 3 条命令");
  assert.equal(translate("zh", "web.modelCount", { n: 2 }), "2 个模型");
});

test("the language follows Paseo's: Chinese for any zh locale, English otherwise and before plugin i18n", () => {
  assert.equal(languageFor("zh-CN"), "zh");
  assert.equal(languageFor("zh-Hant-TW"), "zh");
  assert.equal(languageFor("ja"), "en");
  assert.equal(languageFor(undefined), "en");
  // Paseo's locale source notifies on change; the language is read live from it.
  const listeners = [];
  const source = { locale: "en", subscribe: (l) => (listeners.push(l), () => listeners.splice(listeners.indexOf(l), 1)) };
  let changes = 0;
  const stop = followLocale(source, () => changes++);
  assert.equal(currentLanguage(), "en");
  source.locale = "zh-CN";
  listeners.forEach((l) => l());
  assert.equal(currentLanguage(), "zh");
  assert.equal(changes, 1);
  stop();
  assert.equal(listeners.length, 0);
  followLocale(undefined, () => {});
  assert.equal(currentLanguage(), "en");
});

test("tool rows and merged summaries follow the language", () => {
  assert.equal(toolData(tool({ type: "shell", command: "npm test" }), "zh").verb, "已运行");
  assert.equal(toolData(tool({ type: "shell", command: "npm test" }, { status: "running" }), "zh").verb, "正在运行");
  const items = [{ type: "reasoning", text: "thinking" }, tool({ type: "shell", command: "ls" })];
  assert.equal(stepSummary(items, undefined, "en"), "Thought 1 time and ran 1 command");
  assert.equal(stepSummary(items, undefined, "zh"), "思考 1 次和运行 1 条命令");
});

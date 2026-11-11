import assert from "node:assert/strict";
import { test } from "node:test";
import { toolData } from "../client/model.ts";
import { stepSummary } from "../client/steps.ts";
import { translate, translator } from "../shared/i18n.ts";
import { prefsSchema } from "../shared/timeline.ts";

const tool = (detail, extra = {}) => ({ type: "tool_call", callId: "1", name: "Bash", status: "completed", error: null, detail, ...extra });

test("messages translate with placeholders in both languages", () => {
  assert.equal(translate("en", "prefs.status.failed", { error: "disk full" }), "Save failed: disk full");
  assert.equal(translate("zh", "prefs.status.failed", { error: "磁盘已满" }), "保存失败：磁盘已满");
  assert.equal(translate("en", "theme.copySuffix", { name: "Mariana" }), "Mariana copy");
  assert.equal(translate("zh", "theme.copySuffix", { name: "Mariana" }), "Mariana 副本");
  // A bound translator words many strings in one language.
  const zh = translator("zh");
  assert.equal(zh("chat.tasks"), "任务");
  assert.equal(zh("general.language.label"), "界面语言");
});

test("counts follow each language's grammar", () => {
  assert.equal(translate("en", "summary.commands", { n: 1 }), "ran 1 command");
  assert.equal(translate("en", "summary.commands", { n: 3 }), "ran 3 commands");
  assert.equal(translate("zh", "summary.commands", { n: 3 }), "运行 3 条命令");
  assert.equal(translate("zh", "web.modelCount", { n: 2 }), "2 个模型");
});

test("language pref: English by default, Chinese when saved, unknown falls back", () => {
  assert.equal(prefsSchema.parse({}).language, "en");
  assert.equal(prefsSchema.parse({ language: "zh" }).language, "zh");
  assert.equal(prefsSchema.parse({ language: "fr" }).language, "en");
});

test("tool rows and merged summaries follow the language", () => {
  assert.equal(toolData(tool({ type: "shell", command: "npm test" }), "zh").verb, "已运行");
  assert.equal(toolData(tool({ type: "shell", command: "npm test" }, { status: "running" }), "zh").verb, "正在运行");
  const items = [{ type: "reasoning", text: "thinking" }, tool({ type: "shell", command: "ls" })];
  assert.equal(stepSummary(items, undefined, "en"), "Thought 1 time and ran 1 command");
  assert.equal(stepSummary(items, undefined, "zh"), "思考 1 次和运行 1 条命令");
});

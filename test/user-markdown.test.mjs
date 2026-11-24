import assert from "node:assert/strict";
import { test } from "node:test";
import { inlineCode, parseUserMarkdown } from "../shared/user-markdown.ts";

test("parseUserMarkdown: plain prompts stay null, so Paseo's text is left alone", () => {
  assert.equal(parseUserMarkdown("Looks good, ship it"), null);
  assert.equal(parseUserMarkdown("costs 3*4, a_b_c, **not touched**"), null);
  assert.equal(parseUserMarkdown("a lone ` backtick"), null);
});

test("parseUserMarkdown: fenced blocks split the prose and keep their language", () => {
  assert.deepEqual(parseUserMarkdown("Getting this:\n\n```\nTypeError: x\n    at f (a.ts:1:2)\n```\n\nany idea?"), [
    { kind: "text", parts: [{ text: "Getting this:" }] },
    { kind: "code", lang: "", code: "TypeError: x\n    at f (a.ts:1:2)" },
    { kind: "text", parts: [{ text: "any idea?" }] },
  ]);
  assert.deepEqual(parseUserMarkdown("~~~py\nprint(1)\n~~~"), [{ kind: "code", lang: "py", code: "print(1)" }]);
  // A longer closing fence closes; a shorter one is code; a backtick fence can hold ``` lines when opened with four.
  assert.deepEqual(parseUserMarkdown("````md\n```\ninner\n```\n`````"), [{ kind: "code", lang: "md", code: "```\ninner\n```" }]);
});

test("parseUserMarkdown: an unclosed fence runs to the end, and an indented fence drops its indent", () => {
  assert.deepEqual(parseUserMarkdown("see:\n```js\nconst a = 1;"), [{ kind: "text", parts: [{ text: "see:" }] }, { kind: "code", lang: "js", code: "const a = 1;" }]);
  assert.deepEqual(parseUserMarkdown("  ```\n    two\n  one\n  ```"), [{ kind: "code", lang: "", code: "  two\none" }]);
});

test("inlineCode: matching backtick runs, CommonMark padding, unmatched runs stay text", () => {
  assert.deepEqual(inlineCode("rename `fetchUser` to `loadUser`"), [{ text: "rename " }, { text: "fetchUser", code: true }, { text: " to " }, { text: "loadUser", code: true }]);
  assert.deepEqual(inlineCode("``a ` b``"), [{ text: "a ` b", code: true }]);
  assert.deepEqual(inlineCode("`` `x` ``"), [{ text: "`x`", code: true }]);
  assert.deepEqual(inlineCode("one `` and `two"), [{ text: "one `` and `two" }]);
  assert.deepEqual(inlineCode("a ```inline triple``` b"), [{ text: "a " }, { text: "inline triple", code: true }, { text: " b" }]);
});

test("Command Center toggle ids are lowercase kebab-case (Paseo rejects others and fails the whole plugin)", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../index.client.tsx", import.meta.url), "utf8");
  const ids = [...source.matchAll(/^\s*\["([^"]+)", (?:p\.|any|hides)/gm)].map((m) => m[1]);
  assert.ok(ids.includes("user-code") && ids.length >= 10, `found ${ids.join(", ")}`);
  for (const id of ids) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, id);
});

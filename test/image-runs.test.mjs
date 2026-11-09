import assert from "node:assert/strict";
import { test } from "node:test";
import { imageRuns } from "../client/web/image-runs.ts";

const el = (nodeName, ...childNodes) => ({ nodeType: 1, nodeName, nodeValue: null, childNodes });
const text = (nodeValue) => ({ nodeType: 3, nodeName: "#text", nodeValue, childNodes: [] });
const img = (id) => Object.assign(el("IMG"), { id });
const ids = (root) => imageRuns(root).map((run) => run.map((n) => n.id).join(""));

// ## Login screen / text / img1 img2 / text / img3 / ## Settings / img4 img5
const reply = el("DIV",
  el("H2", text("Login screen")), el("P", text("Here is the new login page:")), el("P", img("1"), img("2")),
  el("P", text("And the error state:")), el("P", img("3")),
  el("H2", text("Settings")), el("P", img("4"), img("5")));

test("any text ends a stack", () => {
  assert.deepEqual(ids(reply), ["12", "3", "45"]);
  assert.deepEqual(ids(el("DIV", el("P", img("a"), img("b"), img("c")), el("P", text("t")), el("P", img("d"), img("e"), img("f")))), ["abc", "def"]);
});

test("line breaks and separate paragraphs don't end a stack; links around images count", () => {
  assert.deepEqual(ids(el("DIV", el("P", img("a"), text("\n"), el("BR"), img("b")), el("P", img("c")))), ["abc"]);
  assert.deepEqual(ids(el("DIV", el("P", el("A", img("a")), img("b")))), ["ab"]);
});

test("the plugin's own stack element (a row of cards and a fold button, no text) doesn't split the run it stands for", () => {
  const stack = el("DIV", el("DIV", el("SPAN"), el("SPAN")), el("BUTTON"));
  assert.deepEqual(ids(el("DIV", el("P", stack, img("a"), img("b")), el("P", img("c")))), ["abc"]);
});

test("a block ends the run on both sides, but images inside it still stack", () => {
  assert.deepEqual(ids(el("DIV", el("P", img("a"), img("b")), el("HR"), el("P", img("c"), img("d")))), ["ab", "cd"]);
  assert.deepEqual(ids(el("DIV", el("UL", el("LI", img("p"), img("q"))), el("P", img("r")))), ["pq", "r"]);
});

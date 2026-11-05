import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
import { prefsSchema } from "../shared/timeline.ts";

const modules = {};
function load(name) {
  if (modules[name]) return modules[name];
  const exports = modules[name] = {};
  const source = ts.transpileModule(readFileSync(new URL(`../client/${name}.ts`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const resolve = (id) => id === "../shared/timeline" ? "../shared/timeline" : id.split("/").reduce((path, part) => part === ".." ? path.slice(0, -1) : part === "." ? path : [...path, part], name.split("/").slice(0, -1)).join("/");
  new Function("exports", "require", source)(exports, (id) => {
    if (id === "@getpaseo/plugin") return { settingsRpc: (id) => ({ read: { name: `settings.${id}.read` }, write: { name: `settings.${id}.write` } }), defineRpc: (value) => value, defineSettings: (value) => value };
    if (id.startsWith(".")) return load(resolve(id));
    return require(id);
  });
  return exports;
}
const { bindPrefsSaver, currentPrefs, savePrefs, setPrefs } = load("prefs");

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("preferences persist through settings RPC without a mounted component", async () => {
  const writes = [];
  const client = { rpc: async (contract, input) => {
    if (contract.name === "settings.timeline.read") return { status: "ready", revision: "r1", values: prefsSchema.parse({}) };
    if (contract.name === "settings.timeline.write") {
      writes.push(input);
      return { status: "saved", revision: `r${writes.length + 1}`, values: input.values };
    }
    throw new Error(`Unexpected RPC ${contract.name}`);
  } };
  const unbind = bindPrefsSaver(client);
  try {
    savePrefs({ ...currentPrefs(), sidebarEntry: "hide" });
    await flush();
    assert.equal(writes.length, 1);
    assert.equal(writes[0].revision, "r1");
    assert.equal(writes[0].values.sidebarEntry, "hide");
    assert.equal(currentPrefs().sidebarEntry, "hide");
  } finally {
    unbind();
    setPrefs(prefsSchema.parse({}));
  }
});

test("a settings conflict rereads the revision and retries once", async () => {
  const writes = [];
  let reads = 0;
  const client = { rpc: async (contract, input) => {
    if (contract.name === "settings.timeline.read") {
      reads++;
      return { status: "ready", revision: reads === 1 ? "r1" : "r2", values: prefsSchema.parse({}) };
    }
    if (contract.name === "settings.timeline.write") {
      writes.push(input);
      return writes.length === 1 ? { status: "conflict", error: "stale" } : { status: "saved", revision: "r3", values: input.values };
    }
    throw new Error(`Unexpected RPC ${contract.name}`);
  } };
  const unbind = bindPrefsSaver(client);
  try {
    savePrefs({ ...currentPrefs(), composerButtonIconSize: "16" });
    await flush();
    await flush();
    assert.equal(reads, 2);
    assert.equal(writes.length, 2);
    assert.equal(writes[0].revision, "r1");
    assert.equal(writes[1].revision, "r2");
    assert.equal(writes[1].values.composerButtonIconSize, "16");
  } finally {
    unbind();
    setPrefs(prefsSchema.parse({}));
  }
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";
import { isPhone, PHONE_WIDTH, polishesChat } from "../client/phone.ts";

test("phones: the iOS and Android apps at any width, web windows under Paseo's compact breakpoint", () => {
  assert.equal(isPhone("ios", 1024), true);
  assert.equal(isPhone("android", 1280), true);
  assert.equal(isPhone("web", 390), true);
  assert.equal(isPhone("web", PHONE_WIDTH - 1), true);
  assert.equal(isPhone("web", PHONE_WIDTH), false);
  assert.equal(isPhone("macos", 1440), false);
  // Off only matters on a phone; on keeps today's behaviour everywhere.
  assert.equal(polishesChat({ phoneChat: "off" }, true), false);
  assert.equal(polishesChat({ phoneChat: "off" }, false), true);
  assert.equal(polishesChat({ phoneChat: "on" }, true), true);
});

test("the pref defaults to on, and a bad saved value falls back to on", async () => {
  const { prefsSchema } = await import("../shared/timeline.ts");
  assert.equal(prefsSchema.parse({}).phoneChat, "on");
  assert.equal(prefsSchema.parse({ phoneChat: "off" }).phoneChat, "off");
  assert.equal(prefsSchema.parse({ phoneChat: "maybe" }).phoneChat, "on");
});

/**
 * Runs the real client entry against a fake Paseo client. Local modules that touch the app (views, DOM, steps) are stubs whose
 * functions do nothing; prefs, phone detection and the prefs schema are the real ones. `followAgent` and `onShownAgent` are recorded.
 */
function loadEntry({ os, width }) {
  const require = createRequire(import.meta.url);
  const transpile = (file) => ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const run = (code, req) => {
    const module = { exports: {} };
    new Function("exports", "require", "module", code)(module.exports, req, module);
    return module.exports;
  };
  const dims = { width, listeners: new Set() };
  const reactNative = {
    Platform: { OS: os },
    Dimensions: {
      get: () => ({ width: dims.width, height: 800 }),
      addEventListener: (_type, l) => (dims.listeners.add(l), { remove: () => dims.listeners.delete(l) }),
    },
  };
  const followed = [];
  const shown = [];
  const noop = () => () => {};
  // Any export of a stubbed module is a function that returns a no-op cleanup.
  const stub = (extra = {}) => new Proxy(extra, { get: (t, k) => (k in t ? t[k] : k === "__esModule" ? true : noop) });
  const steps = stub({ followAgent: (_paseo, id) => (followed.push(id), () => {}), onShownAgent: (l) => shown.push(l), placeStep: () => undefined });
  const web = stub({ readHostAppearance: () => ({ chatDisplay: "full", autoExpandReasoning: false }), openAgentIds: () => ["open-tab"], subagentPaneShown: () => false, iconTwins: () => undefined });
  const real = {};
  // Inside client/, the schema is "../shared/timeline".
  const loadReal = (name, file) => (real[name] ??= run(transpile(file), (id) => (id === "react-native" ? reactNative : id === "../shared/timeline" ? loadReal("timeline", "../shared/timeline.ts") : require(id))));
  const entry = run(transpile("../index.client.tsx"), (id) => {
    if (id === "react-native") return reactNative;
    if (id === "./client/phone") return loadReal("phone", "../client/phone.ts");
    if (id === "./shared/timeline") return loadReal("timeline", "../shared/timeline.ts");
    if (id === "./client/prefs") return loadReal("prefs", "../client/prefs.ts");
    if (id === "./client/steps") return steps;
    if (id === "./client/web") return web;
    if (id === "./shared/theme") return stub({ themeSchema: { parse: () => ({}) } });
    if (id.startsWith(".")) return stub();
    if (id === "react") return { useEffect() {} };
    return stub();
  });
  const transformers = new Map();
  const client = {
    rpc: () => new Promise(() => {}),
    paseo: { providers: { snapshot: () => new Promise(() => {}), subscribe: noop } },
    addTimelineTransformer: (t) => (transformers.set(t.id, t), () => transformers.delete(t.id)),
    addTimelineRenderer: noop,
    addCommandCenterItem: noop,
    addScreen: noop,
    addSidebarHeaderItem: noop,
  };
  const dispose = entry.default(client);
  const prefs = real.prefs;
  const resize = (w) => {
    dims.width = w;
    dims.listeners.forEach((l) => l());
  };
  return { transformers, followed, shown, prefs, resize, dispose };
}

test("off on a phone: no timeline transformers and no followed timelines; on, both come back without a reload", () => {
  const app = loadEntry({ os: "android", width: 412 });
  const { prefs } = app;
  // Default (on): today's behaviour, the transformers and the open tab's timeline.
  assert.equal(app.transformers.size, 6);
  app.shown.forEach((l) => l("agent-a"));
  assert.deepEqual(app.followed, ["open-tab", "agent-a"]);

  app.followed.length = 0;
  prefs.setPrefs({ ...prefs.currentPrefs(), phoneChat: "off" });
  assert.equal(app.transformers.size, 0);
  app.shown.forEach((l) => l("agent-b"));
  assert.deepEqual(app.followed, []);

  prefs.setPrefs({ ...prefs.currentPrefs(), phoneChat: "on" });
  assert.equal(app.transformers.size, 6);
  assert.ok(app.followed.includes("agent-b"));
  app.dispose();
  assert.equal(app.transformers.size, 0);
});

test("off on phones leaves desktop alone, and a web window narrowing to phone width drops the rows", () => {
  const app = loadEntry({ os: "web", width: 1280 });
  const { prefs } = app;
  prefs.setPrefs({ ...prefs.currentPrefs(), phoneChat: "off" });
  assert.equal(app.transformers.size, 6);
  app.resize(390);
  assert.equal(app.transformers.size, 0);
  app.followed.length = 0;
  app.shown.forEach((l) => l("agent-c"));
  assert.deepEqual(app.followed, []);
  app.resize(1024);
  assert.equal(app.transformers.size, 6);
  app.dispose();
});

test("a browser that last saw off skips the transformers before the saved prefs arrive, and remembers the next choice", () => {
  const store = new Map([["chat-polish.phoneChat", "off"]]);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } });
  try {
    const app = loadEntry({ os: "web", width: 390 });
    const { prefs } = app;
    // Prefs still at their defaults (on): the remembered off wins until saved prefs arrive.
    assert.equal(prefs.currentPrefs().phoneChat, "on");
    assert.equal(app.transformers.size, 0);
    assert.deepEqual(app.followed, []);
    // Saved prefs arrive with on: the rows come back and the choice is remembered.
    prefs.setPrefs({ ...prefs.currentPrefs(), phoneChat: "on" });
    assert.equal(app.transformers.size, 6);
    assert.equal(store.get("chat-polish.phoneChat"), "on");
    app.dispose();
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { HUGEICONS, UNTITLED, hugeicon, roundPath, untar, untitledIcon } from "../server/icons.ts";

test("rounding keeps packed path numbers apart", () => {
  assert.equal(roundPath("l-.17.213"), "l-.17 0.21");
  assert.equal(roundPath("l-.334.998a2"), "l-0.33 1a2");
  assert.equal(roundPath("l.003.02"), "l0 .02");
  assert.equal(roundPath("M12 2v3"), "M12 2v3");
});

test("untar reads a package's files, long paths included", () => {
  const dir = mkdtempSync(join(tmpdir(), "cp-untar-"));
  const deep = `package/${"d".repeat(60)}/${"e".repeat(60)}`;
  mkdirSync(join(dir, deep), { recursive: true });
  writeFileSync(join(dir, "package/icons.json"), '{"icons":{}}');
  writeFileSync(join(dir, deep, "Check.mjs"), "x".repeat(700));
  // npm packs ustar with pax records for long names; GNU and BSD tar both write either on request.
  for (const format of ["ustar", "pax"]) {
    execFileSync("tar", [`--format=${format}`, "-czf", join(dir, `${format}.tgz`), "-C", dir, "package"]);
    const files = untar(gunzipSync(readFileSync(join(dir, `${format}.tgz`))));
    assert.equal(files.get("package/icons.json"), '{"icons":{}}', format);
    assert.equal(files.get(`${deep}/Check.mjs`), "x".repeat(700), format);
  }
});

test("icons read from each package's format", () => {
  const component = 'e.createElement("path",{d:"M20 6 9 17l-5-5"}),e.createElement("path",{fillRule:"evenodd",d:"M1 1h2"})';
  assert.equal(untitledIcon(component, "Check"), '<path d="M20 6 9 17l-5-5"/><path fill-rule="evenodd" d="M1 1h2"/>');
  assert.throws(() => untitledIcon(undefined, "Missing"));
  const set = { icons: { check: { body: '<path stroke="currentColor" d="m5 13.261 2.5 2.5"/>' } }, aliases: { tick: { parent: "check" } } };
  assert.equal(hugeicon(set, "tick"), '<path d="m5 13.26 2.5 2.5"/>');
  assert.throws(() => hugeicon(set, "missing"));
});

test("icon maps: Lucide names are PascalCase, twin names have each package's shape, and the icons Paseo 0.17 added are mapped", () => {
  for (const [map, twin] of [[UNTITLED, /^[A-Z][A-Za-z]*\d*$/], [HUGEICONS, /^[a-z0-9]+(-[a-z0-9]+)*$/]]) {
    for (const [lucide, name] of Object.entries(map)) {
      assert.match(lucide, /^[A-Z][A-Za-z0-9]*$/, lucide);
      assert.match(name, twin, `${lucide} -> ${name}`);
    }
  }
  // Paseo 0.17 draws these; a missing key leaves the icon Lucide beside the chosen set (Untitled UI has no twin for some).
  for (const key of ["Plug", "Heart", "Import", "Pin", "MessageCircle", "CornerDownLeft", "Files", "Stethoscope", "Trash", "House"]) assert.ok(HUGEICONS[key], `Hugeicons ${key}`);
  for (const key of ["Heart", "Pin", "MessageCircle", "CornerDownLeft", "Trash", "House"]) assert.ok(UNTITLED[key], `Untitled UI ${key}`);
});

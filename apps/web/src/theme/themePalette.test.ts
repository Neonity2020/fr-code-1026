import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  BUILT_IN_THEMES,
  GROVE_THEME,
  isKnownThemePreference,
  parseThemeFile,
  parseThemeHalves,
  resolveThemeHalf,
  serializeThemeFile,
} from "./themePalette.ts";

test("BUILT_IN_THEMES contains all 5 official themes", () => {
  const ids = BUILT_IN_THEMES.map((t) => t.id);
  assert.equal(BUILT_IN_THEMES.length, 5);
  assert.deepEqual(ids, ["t3-chat", "grove", "ocean", "ember", "iris"]);
});

test("isKnownThemePreference recognises built-in themes", () => {
  assert.equal(isKnownThemePreference("t3-chat"), true);
  assert.equal(isKnownThemePreference("grove"), true);
  assert.equal(isKnownThemePreference("ocean"), true);
  assert.equal(isKnownThemePreference("ember"), true);
  assert.equal(isKnownThemePreference("iris"), true);
  assert.equal(isKnownThemePreference("unknown-xyz"), false);
});

test("parseThemeHalves parses valid pairs and gracefully handles invalid data", () => {
  assert.equal(parseThemeHalves(null), null);
  assert.equal(parseThemeHalves(""), null);
  assert.equal(parseThemeHalves("{ bad json }"), null);
  assert.equal(parseThemeHalves("[]"), null);

  const parsed = parseThemeHalves(JSON.stringify({ light: "grove", dark: "ocean" }));
  assert.deepEqual(parsed, { light: "grove", dark: "ocean" });
});

test("resolveThemeHalf resolves appropriate appearance half", () => {
  const halves = { light: "grove", dark: "ocean" };
  assert.equal(resolveThemeHalf("t3-chat", halves, "light"), "grove");
  assert.equal(resolveThemeHalf("t3-chat", halves, "dark"), "ocean");
  assert.equal(resolveThemeHalf("t3-chat", null, "light"), "t3-chat");
  assert.equal(resolveThemeHalf("t3-chat", {}, "dark"), "t3-chat");
});

test("serializeThemeFile and parseThemeFile round-trip custom themes correctly", () => {
  const customTheme = {
    ...GROVE_THEME,
    id: "custom-nordic",
    label: "Custom Nordic",
  };
  const serialized = serializeThemeFile(customTheme);
  const parsed = JSON.parse(serialized);
  assert.equal(parsed.name, customTheme.label);

  const themeDef = parseThemeFile(parsed);
  assert.equal(themeDef.id, customTheme.id);
  assert.equal(themeDef.label, customTheme.label);
  assert.ok(themeDef.colors);
});

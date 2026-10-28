import { strict as assert } from "node:assert";
import { test } from "node:test";
import { applyThemeHalf, applyThemePreference, readThemePreference, resolveActiveThemeForAppearance } from "./appearancePreference.ts";

const values = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  },
  matchMedia: () => ({ matches: false }),
};

test("默认黑白主题及单独选择的亮暗半区可恢复", () => {
  values.clear();
  assert.equal(readThemePreference(), "default");
  applyThemePreference("t3-chat");
  applyThemeHalf("light", "default");
  assert.equal(resolveActiveThemeForAppearance("light"), "default");
  assert.equal(resolveActiveThemeForAppearance("dark"), "t3-chat");
  applyThemeHalf("dark", "default");
  assert.equal(resolveActiveThemeForAppearance("light"), "default");
  assert.equal(resolveActiveThemeForAppearance("dark"), "default");
});

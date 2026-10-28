import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  mixThemePreviewBase,
  STANDARD_THEME_PREVIEW_COLORS,
  THEME_PREVIEW_RENDER_SPECS,
} from "./themePreview.ts";

test("STANDARD_THEME_PREVIEW_COLORS contains light and dark colors", () => {
  assert.ok(STANDARD_THEME_PREVIEW_COLORS.light);
  assert.ok(STANDARD_THEME_PREVIEW_COLORS.dark);
  assert.equal(typeof STANDARD_THEME_PREVIEW_COLORS.light.canvas, "string");
  assert.equal(typeof STANDARD_THEME_PREVIEW_COLORS.dark.canvas, "string");
});

test("THEME_PREVIEW_RENDER_SPECS defines geometry and weight for light and dark", () => {
  assert.equal(THEME_PREVIEW_RENDER_SPECS.light.baseWeight, 0.8);
  assert.equal(THEME_PREVIEW_RENDER_SPECS.dark.baseWeight, 0.8);
  assert.equal(THEME_PREVIEW_RENDER_SPECS.light.accent.center.length, 2);
  assert.equal(THEME_PREVIEW_RENDER_SPECS.dark.accent.center.length, 2);
});

test("mixThemePreviewBase mixes canvas color with target in Oklab", () => {
  const mixedLight = mixThemePreviewBase(
    { canvas: "#ffffff", accent: "#f4f4f5", messageAction: "#1b4ed8" },
    "light",
  );
  assert.match(mixedLight, /^#[0-9a-f]{6}$/i);

  const mixedDark = mixThemePreviewBase(
    { canvas: "#0a0a0a", accent: "#141414", messageAction: "#346bf1" },
    "dark",
  );
  assert.match(mixedDark, /^#[0-9a-f]{6}$/i);
});

test("mixThemePreviewBase safely falls back when given an unparseable color", () => {
  const fallback = mixThemePreviewBase(
    { canvas: "var(--custom-color)", accent: "#141414", messageAction: "#346bf1" },
    "dark",
  );
  assert.equal(fallback, "var(--custom-color)");
});

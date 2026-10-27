import { strict as assert } from "node:assert";
import { test } from "node:test";
import { filterMentionFiles } from "./composerMention.ts";

test("filterMentionFiles returns top files when query is empty", () => {
  const files = [
    "src/index.ts",
    "src/App.tsx",
    "src/components/chat/Composer.tsx",
    "package.json",
  ];
  const results = filterMentionFiles(files, "");
  assert.equal(results.length, 4);
  assert.equal(results[0]?.name, "index.ts");
  assert.equal(results[0]?.dir, "src");
  assert.equal(results[2]?.name, "Composer.tsx");
  assert.equal(results[2]?.dir, "src/components/chat");
});

test("filterMentionFiles prioritizes filename exact match over partial path match", () => {
  const files = [
    "packages/protocol/src/index.ts",
    "apps/web/src/index.ts",
    "apps/web/src/components/chat/Composer.tsx",
    "apps/web/src/components/chat/ComposerMentionPopup.tsx",
  ];

  const results = filterMentionFiles(files, "composer.tsx");
  assert.ok(results.length >= 1);
  assert.equal(results[0]?.name, "Composer.tsx");
});

test("filterMentionFiles matches prefix on filename", () => {
  const files = [
    "src/App.tsx",
    "src/App.test.tsx",
    "src/api/auth.ts",
  ];
  const results = filterMentionFiles(files, "app");
  assert.equal(results.length, 2);
  assert.ok(results.some((r) => r.name === "App.tsx"));
  assert.ok(results.some((r) => r.name === "App.test.tsx"));
});

test("filterMentionFiles matches path substrings", () => {
  const files = [
    "packages/protocol/src/types.ts",
    "apps/server/src/types.ts",
    "apps/web/src/types.ts",
  ];
  const results = filterMentionFiles(files, "protocol");
  assert.equal(results.length, 1);
  assert.equal(results[0]?.path, "packages/protocol/src/types.ts");
});

test("filterMentionFiles returns empty when no files match", () => {
  const files = ["src/index.ts", "package.json"];
  const results = filterMentionFiles(files, "nonexistent_file_xyz");
  assert.equal(results.length, 0);
});

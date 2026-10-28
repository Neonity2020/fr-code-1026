import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  filterProjectFiles,
  normalizeFilePickerQuery,
} from "./ProjectFilePicker.logic.ts";

const FILES = [
  "README.md",
  "apps/web/src/components/chat/ChatView.tsx",
  "apps/web/src/components/command-palette/CommandPalette.tsx",
  "apps/server/src/index.ts",
  "packages/shared/src/index.ts",
];

test("query normalization strips whitespace and leading @ . / separators", () => {
  assert.equal(normalizeFilePickerQuery("  @./Chat View "), "chatview");
  assert.equal(normalizeFilePickerQuery("CMD"), "cmd");
});

test("empty query returns the first files without highlights", () => {
  const matches = filterProjectFiles(FILES.slice(0, 2), "");
  assert.deepEqual(
    matches.map((match) => match.name),
    ["README.md", "ChatView.tsx"],
  );
  assert.deepEqual(matches[0]!.nameMatchIndices, []);
});

test("matches are fuzzy subsequences with highlight indices", () => {
  const matches = filterProjectFiles(["apps/web/src/components/chat/ChatView.tsx"], "chatvw");
  assert.equal(matches.length, 1);
  const { name, nameMatchIndices } = matches[0]!;
  assert.equal(name, "ChatView.tsx");
  // C-h-a-t-V(ie)w — ordered subsequence over the file name
  assert.deepEqual(nameMatchIndices, [0, 1, 2, 3, 4, 7]);
});

test("non-matching query yields no rows", () => {
  assert.equal(filterProjectFiles(FILES, "zzzz").length, 0);
});

test("exact name beats prefix beats subsequence beats path-only match", () => {
  const files = [
    "deep/nested/my-exact-file.ts",
    "some/exact/dirs/only.ts",
    "nested/exact-extra.ts",
    "exact.ts",
  ];
  const matches = filterProjectFiles(files, "exact").map((match) => match.path);
  assert.deepEqual(matches, [
    "exact.ts",
    "nested/exact-extra.ts",
    "deep/nested/my-exact-file.ts",
    "some/exact/dirs/only.ts",
  ]);
});

test("shorter paths win among equal match tiers", () => {
  const matches = filterProjectFiles(
    ["very/deeply/nested/dirs/utils.ts", "lib/utils.ts"],
    "utils",
  );
  assert.equal(matches[0]!.path, "lib/utils.ts");
});

test("result limit is respected", () => {
  const many = Array.from({ length: 50 }, (_, index) => `file${index}.ts`);
  assert.equal(filterProjectFiles(many, "", 10).length, 10);
  assert.equal(filterProjectFiles(many, "file", 10).length, 10);
});

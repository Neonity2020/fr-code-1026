import { strict as assert } from "node:assert";
import { test } from "node:test";
import { getDiffLineStat, getRenderablePatch } from "./diffRendering.ts";

test("ignores whitespace-only changes while retaining meaningful edits", () => {
  const patch = "diff --git a/example.txt b/example.txt\n--- a/example.txt\n+++ b/example.txt\n@@ -1,2 +1,2 @@\n-hello world\n-old\n+hello  world\n+new\n";
  const normal = getRenderablePatch(patch);
  const filtered = getRenderablePatch(patch, "test", { ignoreWhitespace: true });
  assert.equal(normal?.kind, "files");
  assert.equal(filtered?.kind, "files");
  if (normal?.kind !== "files" || filtered?.kind !== "files") return;
  assert.deepEqual(getDiffLineStat(normal.files), { additions: 2, deletions: 2 });
  assert.deepEqual(getDiffLineStat(filtered.files), { additions: 1, deletions: 1 });
});

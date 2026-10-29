import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";
import { createWorkspace, workspaceRoot } from "./workspaces.ts";

test("unselected workspaces receive unique dated directories under the default root", () => {
  const home = mkdtempSync(join(tmpdir(), "fr-workspace-test-"));
  try {
    const root = workspaceRoot(home);
    assert.equal(root, join(home, "fr-code"));
    assert.equal(workspaceRoot(home, join(home, "custom")), join(home, "custom"));
    const first = createWorkspace(root, new Date(2026, 9, 29));
    const second = createWorkspace(root, new Date(2026, 9, 29));
    assert.match(basename(first), /^2026-10-29-[a-zA-Z0-9]+$/);
    assert.notEqual(first, second);
    assert.ok(statSync(first).isDirectory());
    assert.ok(statSync(second).isDirectory());
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

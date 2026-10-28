import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { clearProjectFilesCache, listProjectFiles } from "./project-files.ts";

const execFileAsync = promisify(execFile);

function makeProject(files: Array<string>): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-web-files-"));
  for (const file of files) {
    const fullPath = join(dir, file);
    mkdirSync(join(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, "");
  }
  return dir;
}

test("non-git projects enumerate recursively with ignores and hidden-file skips", async () => {
  const dir = makeProject([
    "README.md",
    "src/index.ts",
    "src/lib/helper.ts",
    "node_modules/pkg/index.js",
    "dist/bundle.js",
    ".hidden/secret.txt",
    ".github/workflows/ci.yml",
  ]);
  try {
    clearProjectFilesCache();
    const files = await listProjectFiles(dir);
    assert.deepEqual(files, [".github/workflows/ci.yml", "README.md", "src/index.ts", "src/lib/helper.ts"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("git projects list tracked and untracked files while respecting gitignore", async () => {
  const dir = makeProject(["tracked.ts", "untracked.ts", "ignored.ts", ".gitignore"]);
  try {
    writeFileSync(join(dir, ".gitignore"), "ignored.ts\n");
    await execFileAsync("git", ["init", "-q"], { cwd: dir });
    await execFileAsync("git", ["add", "tracked.ts", ".gitignore"], { cwd: dir });
    clearProjectFilesCache();
    const files = await listProjectFiles(dir);
    assert.ok(files.includes("tracked.ts"), "tracked file listed");
    assert.ok(files.includes("untracked.ts"), "untracked file listed");
    assert.ok(!files.includes("ignored.ts"), "gitignored file excluded");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("invalid directory rejects", async () => {
  await assert.rejects(listProjectFiles(join(tmpdir(), "pi-web-definitely-missing")));
});

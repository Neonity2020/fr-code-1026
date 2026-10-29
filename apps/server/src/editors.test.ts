import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { editorLaunch, validateWorkspaceDirectory } from "./editors.ts";

test("editor launch accepts only known editors and keeps paths as arguments", () => {
  assert.deepEqual(editorLaunch("vscode", "/project with spaces", "darwin"), { command: "open", args: ["-a", "Visual Studio Code", "/project with spaces"] });
  assert.deepEqual(editorLaunch("cursor", "/project", "linux"), { command: "cursor", args: ["/project"] });
  assert.equal(editorLaunch("__proto__", "/project", "darwin"), null);
  assert.equal(editorLaunch("vscode", "/project", "win32"), null);
});


test("workspace folder opens with the platform file manager and rejects missing or non-directory paths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-web-workspace-"));
  try {
    assert.deepEqual(editorLaunch("folder", dir, "darwin"), { command: "open", args: [dir] });
    assert.deepEqual(editorLaunch("folder", dir, "linux"), { command: "xdg-open", args: [dir] });
    assert.equal(editorLaunch("folder", dir, "win32"), null);
    await validateWorkspaceDirectory(dir);
    const file = join(dir, "file");
    await writeFile(file, "");
    await assert.rejects(validateWorkspaceDirectory(file), /not a directory/);
    await assert.rejects(validateWorkspaceDirectory(join(dir, "missing")), /does not exist/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { editorLaunch } from "./editors.ts";

test("editor launch accepts only known editors and keeps paths as arguments", () => {
  assert.deepEqual(editorLaunch("vscode", "/project with spaces", "darwin"), { command: "open", args: ["-a", "Visual Studio Code", "/project with spaces"] });
  assert.deepEqual(editorLaunch("cursor", "/project", "linux"), { command: "cursor", args: ["/project"] });
  assert.equal(editorLaunch("__proto__", "/project", "darwin"), null);
  assert.equal(editorLaunch("vscode", "/project", "win32"), null);
});

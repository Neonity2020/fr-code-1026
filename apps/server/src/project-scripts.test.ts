import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ProjectScripts } from "./project-scripts.ts";

test("scripts persist per project and runs can be stopped", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-web-scripts-"));
  const store = new ProjectScripts(dir);
  try {
    assert.throws(() => store.save(dir, { name: "", command: "echo hi" }));
    assert.throws(() => store.save(dir, { name: "Invalid", command: "true", icon: "unknown" }), /icon/);
    const script = store.save(dir, { name: "Test", command: "sleep 30 & printf hello; wait" });
    assert.deepEqual(new ProjectScripts(dir).list(dir), [script]);
    assert.deepEqual(store.list(join(dir, "other")), []);
    store.run("thread", dir, script.id);
    assert.throws(() => store.run("thread", dir, script.id), /already running/);
    for (let i = 0; i < 100 && !store.status("thread")?.output; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(store.status("thread")?.output, "hello");
    store.stop("thread");
    for (let i = 0; i < 500 && store.status("thread")?.running; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(store.status("thread")?.running, false);
    assert.equal(store.status("thread")?.stopped, true);
    store.delete(dir, script.id);
    assert.deepEqual(new ProjectScripts(dir).list(dir), []);
  } finally {
    if (store.status("thread")?.running) store.stop("thread");
    await rm(dir, { recursive: true, force: true });
  }
});

test("imports only matching scripts from t3.json without running or modifying it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-web-t3-scripts-"));
  const store = new ProjectScripts(dir);
  const file = join(dir, "t3.json");
  try {
    assert.deepEqual(store.fileScripts(dir), { fileScripts: [], fileError: null });
    await writeFile(file, "not json");
    assert.ok(store.fileScripts(dir).fileError);
    const source = JSON.stringify({ scripts: [{ name: " Build ", command: " echo build ", icon: "build", runOnSettle: true }, { name: "Test", command: "echo test" }] });
    await writeFile(file, source);
    assert.deepEqual(store.fileScripts(dir).fileScripts, [{ name: "Build", command: "echo build", icon: "build" }, { name: "Test", command: "echo test", icon: "play" }]);
    assert.throws(() => store.importFileScript(dir, "Build", "changed"), /changed/);
    store.importFileScript(dir, "Build", "echo build");
    assert.equal(store.list(dir)[0]?.icon, "build");
    assert.deepEqual(store.list(dir).map(({ name, command }) => ({ name, command })), [{ name: "Build", command: "echo build" }]);
    assert.deepEqual(store.fileScripts(dir).fileScripts, [{ name: "Test", command: "echo test", icon: "play" }]);
    assert.throws(() => store.importFileScript(dir, "Build", "echo build"), /already been imported/);
    assert.equal(await readFile(file, "utf8"), source);
    assert.equal(store.status("thread"), null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("reports nonzero script exits as failures", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-web-script-fail-"));
  const store = new ProjectScripts(dir);
  try {
    const script = store.save(dir, { name: "Fail", command: "exit 7", icon: "test" });
    store.run("thread", dir, script.id);
    for (let i = 0; i < 500 && store.status("thread")?.running; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(store.status("thread")?.exitCode, 7);
    assert.equal(store.status("thread")?.stopped, false);
  } finally { store.dispose(); await rm(dir, { recursive: true, force: true }); }
});

test("existing scripts without an icon remain editable", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-web-script-legacy-"));
  try {
    await writeFile(join(dir, "project-scripts.json"), JSON.stringify({ [dir]: [{ id: "old", name: "Old", command: "true" }] }));
    const store = new ProjectScripts(dir);
    const existing = store.list(dir)[0];
    assert.ok(existing);
    assert.equal(store.save(dir, existing).icon, "play");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

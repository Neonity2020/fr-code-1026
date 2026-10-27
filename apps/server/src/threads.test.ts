import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { ThreadStore } from "./threads.ts";

test("ThreadStore creates, forks, updates, and deletes threads with persistence", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "thread-store-test-"));
  try {
    const store = new ThreadStore(tmpDir, tmpDir);

    // 1. Create thread
    const created = store.createThread(tmpDir, "Initial Exploration", {
      model: "anthropic/claude-3-5-sonnet",
      thinkingLevel: "high",
    });
    assert.ok(created.id.startsWith("th-"));
    assert.equal(created.title, "Initial Exploration");
    assert.equal(created.model, "anthropic/claude-3-5-sonnet");
    assert.equal(created.thinkingLevel, "high");

    // Add a turn item
    store.emit(created.id, {
      type: "turn_item.updated",
      threadId: created.id,
      turnItem: {
        id: "ti-1",
        threadId: created.id,
        ordinal: 0,
        status: "completed",
        startedAt: Date.now(),
        completedAt: Date.now(),
        type: "user_message",
        text: "Please inspect project structure",
      },
    });

    const projection = store.get(created.id);
    assert.ok(projection);
    assert.equal(projection.items.size, 1);
    const item1 = projection.items.get("ti-1");
    assert.ok(item1 && item1.type === "user_message");
    assert.equal(item1.text, "Please inspect project structure");

    // 2. Fork thread
    const forked = store.forkThread(created.id, "Branch experiment");
    assert.ok(forked.id.startsWith("th-"));
    assert.notEqual(forked.id, created.id);
    assert.equal(forked.title, "Branch experiment");
    assert.equal(forked.cwd, tmpDir);
    assert.equal(forked.model, "anthropic/claude-3-5-sonnet");
    assert.equal(forked.thinkingLevel, "high");

    const forkedProjection = store.get(forked.id);
    assert.ok(forkedProjection);
    assert.equal(forkedProjection.items.size, 1);
    const forkedItem = [...forkedProjection.items.values()][0];
    assert.ok(forkedItem && forkedItem.type === "user_message");
    assert.equal(forkedItem.text, "Please inspect project structure");
    assert.equal(forkedItem.threadId, forked.id);

    // 3. Reload store from disk
    const reloadedStore = new ThreadStore(tmpDir, tmpDir);
    const reloadedList = reloadedStore.listThreads();
    assert.equal(reloadedList.length, 2);
    const reloadedCreated = reloadedStore.get(created.id);
    assert.ok(reloadedCreated);
    assert.equal(reloadedCreated.items.size, 1);
    const reloadedItem1 = reloadedCreated.items.get("ti-1");
    assert.ok(reloadedItem1 && reloadedItem1.type === "user_message");
    assert.equal(reloadedItem1.text, "Please inspect project structure");

    // 4. Delete thread
    const deleted = store.deleteThread(forked.id);
    assert.equal(deleted, true);
    assert.equal(store.get(forked.id), undefined);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

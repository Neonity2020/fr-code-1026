import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { TurnItem } from "@pi-web/protocol";
import { useAppStore } from "./store.ts";

test("useAppStore manages thread state, snapshots, and sequence-gated events", () => {
  const store = useAppStore.getState();

  // 1. Initial snapshot application
  const initialItems: TurnItem[] = [
    {
      id: "ti-1",
      threadId: "th-sync-1",
      ordinal: 0,
      status: "completed",
      startedAt: 1000,
      completedAt: 2000,
      type: "user_message",
      text: "Hello",
    },
  ];
  store.applySnapshot("th-sync-1", 5, initialItems);

  let threadState = useAppStore.getState().byThread["th-sync-1"];
  assert.ok(threadState);
  assert.equal(threadState.sequence, 5);
  assert.equal(threadState.items.length, 1);
  const item0 = threadState.items[0];
  assert.ok(item0 && item0.type === "user_message");
  assert.equal(item0.text, "Hello");

  // 2. Sequence gating: event with sequence <= 5 should be ignored
  store.applyEvent("th-sync-1", 4, "turn_item.updated", () => [
    ...initialItems,
    {
      id: "ti-stale",
      threadId: "th-sync-1",
      ordinal: 1,
      status: "completed",
      startedAt: 2000,
      completedAt: 3000,
      type: "assistant_message",
      text: "Stale message",
    },
  ]);

  threadState = useAppStore.getState().byThread["th-sync-1"];
  assert.equal(threadState?.sequence, 5);
  assert.equal(threadState?.items.length, 1); // Not updated

  // 3. New event with sequence > 5 should be applied
  store.applyEvent("th-sync-1", 6, "turn_item.updated", () => [
    ...initialItems,
    {
      id: "ti-2",
      threadId: "th-sync-1",
      ordinal: 1,
      status: "completed",
      startedAt: 2000,
      completedAt: 3000,
      type: "assistant_message",
      text: "Hi there!",
    },
  ]);

  threadState = useAppStore.getState().byThread["th-sync-1"];
  assert.equal(threadState?.sequence, 6);
  assert.equal(threadState?.items.length, 2);
  const item1 = threadState?.items[1];
  assert.ok(item1 && item1.type === "assistant_message");
  assert.equal(item1.text, "Hi there!");

  // 4. Thread selection and request flag
  store.setActiveThread("th-sync-1");
  assert.equal(useAppStore.getState().activeThreadId, "th-sync-1");

  store.markNewThreadRequested();
  assert.equal(useAppStore.getState().newThreadRequested, true);
});

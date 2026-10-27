import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { DomainEvent, ThreadId, ThreadSummary, TurnItem } from "@pi-web/protocol";
import { PiThreadRunner, type PiThreadStorePort } from "./adapter.ts";
import { parsePiModelSlug } from "./rpc.ts";

test("parsePiModelSlug parses valid provider/modelId pairs and rejects invalid ones", () => {
  assert.deepEqual(parsePiModelSlug("anthropic/claude-3-5-sonnet"), {
    provider: "anthropic",
    modelId: "claude-3-5-sonnet",
  });
  assert.deepEqual(parsePiModelSlug("minimax/MiniMax-M3.1-Flash"), {
    provider: "minimax",
    modelId: "MiniMax-M3.1-Flash",
  });
  assert.deepEqual(parsePiModelSlug("openai/gpt-4o"), {
    provider: "openai",
    modelId: "gpt-4o",
  });

  assert.equal(parsePiModelSlug("claude"), null);
  assert.equal(parsePiModelSlug("/claude"), null);
  assert.equal(parsePiModelSlug("anthropic/"), null);
  assert.equal(parsePiModelSlug(""), null);
});

test("PiThreadRunner initializes idle and manages approval responses", () => {
  const events: DomainEvent[] = [];
  const items = new Map<string, TurnItem>();
  const summary: ThreadSummary = {
    id: "th-mock-1",
    title: "Mock thread",
    cwd: "/mock/cwd",
    status: "idle",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const store: PiThreadStorePort = {
    emit(threadId: ThreadId, event: DomainEvent) {
      events.push(event);
      if (event.type === "turn_item.updated") {
        items.set(event.turnItem.id, event.turnItem);
      }
    },
    get(threadId: ThreadId) {
      if (threadId !== "th-mock-1") return undefined;
      return { summary, items };
    },
    updateSummary(threadId: ThreadId, patch: Partial<ThreadSummary>) {
      Object.assign(summary, patch);
    },
  };

  const runner = new PiThreadRunner(store, "th-mock-1", () => "/mock/cwd");
  assert.equal(runner.status, "idle");

  // Non-existent approval response returns false
  const responded = runner.respondApproval("non-existent-req", "accept");
  assert.equal(responded, false);

  // Stop & dispose can be safely invoked anytime
  runner.stop();
  runner.dispose();
  assert.equal(runner.status, "idle");
});

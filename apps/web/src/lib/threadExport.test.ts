import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { ThreadSummary, TurnItem } from "@pi-web/protocol";
import { formatThreadJson, formatThreadMarkdown } from "./threadExport.ts";

test("formats thread into Markdown and JSON", () => {
  const summary: ThreadSummary = {
    id: "th-test-1",
    title: "Refactor database queries",
    cwd: "/workspace/project",
    status: "idle",
    createdAt: 1700000000000,
    updatedAt: 1700001000000,
    model: "minimax/MiniMax-M3.1-Flash",
  };

  const items: TurnItem[] = [
    {
      id: "ti-1",
      threadId: "th-test-1",
      ordinal: 0,
      status: "completed",
      startedAt: 1700000000000,
      completedAt: 1700000001000,
      type: "user_message",
      text: "How do I optimize this query?",
      attachments: [{ id: "a-1", name: "query.sql", mimeType: "text/plain", size: 120 }],
    },
    {
      id: "ti-2",
      threadId: "th-test-1",
      ordinal: 1,
      status: "completed",
      startedAt: 1700000002000,
      completedAt: 1700000005000,
      type: "reasoning",
      text: "Analyzing indexing strategies...",
    },
    {
      id: "ti-3",
      threadId: "th-test-1",
      ordinal: 2,
      status: "completed",
      startedAt: 1700000006000,
      completedAt: 1700000009000,
      type: "command_execution",
      title: "run query plan",
      input: "EXPLAIN ANALYZE SELECT * FROM users;",
      output: "Seq Scan on users (cost=0.00..35.50 rows=2550 width=68)",
    },
    {
      id: "ti-4",
      threadId: "th-test-1",
      ordinal: 3,
      status: "completed",
      startedAt: 1700000010000,
      completedAt: 1700000015000,
      type: "assistant_message",
      text: "You can add an index on `created_at`.",
    },
  ];

  const md = formatThreadMarkdown(summary, items);
  assert.ok(md.includes("# Refactor database queries"));
  assert.ok(md.includes("### 👤 User"));
  assert.ok(md.includes("How do I optimize this query?"));
  assert.ok(md.includes("`query.sql` (text/plain)"));
  assert.ok(md.includes("<details>"));
  assert.ok(md.includes("Analyzing indexing strategies..."));
  assert.ok(md.includes("EXPLAIN ANALYZE SELECT * FROM users;"));
  assert.ok(md.includes("### 🤖 Assistant"));
  assert.ok(md.includes("You can add an index on `created_at`."));

  const jsonStr = formatThreadJson(summary, items);
  const parsed = JSON.parse(jsonStr) as { summary: ThreadSummary; items: TurnItem[] };
  assert.equal(parsed.summary.id, "th-test-1");
  assert.equal(parsed.items.length, 4);
});

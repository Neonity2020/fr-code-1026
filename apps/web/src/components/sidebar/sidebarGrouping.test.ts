import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ThreadId, ThreadSummary } from "@pi-web/protocol";
import { groupThreadsByProject, moveProject, partitionWorkingThreads } from "./sidebarGrouping.ts";

function makeThread(
  id: string,
  cwd: string,
  overrides: Partial<ThreadSummary> = {},
): ThreadSummary {
  return {
    id: id as ThreadId,
    title: `Thread ${id}`,
    cwd,
    createdAt: 1000,
    updatedAt: 1000,
    status: "idle",
    ...overrides,
  };
}

describe("sidebarGrouping", () => {
  it("moves projects in either direction without changing the other projects", () => {
    assert.deepEqual(moveProject(["a", "b", "c"], "a", "c"), ["b", "c", "a"]);
    assert.deepEqual(moveProject(["a", "b", "c"], "c", "a"), ["c", "a", "b"]);
    assert.deepEqual(moveProject(["a", "b"], "missing", "a"), ["a", "b"]);
  });
  it("partitions running, unread, and woke threads when workingSectionEnabled is true", () => {
    const t1 = makeThread("1", "/repo/a", { status: "running" });
    const t2 = makeThread("2", "/repo/a", { status: "idle" });
    const t3 = makeThread("3", "/repo/b", { unread: true });

    const disabled = partitionWorkingThreads([t1, t2, t3], false);
    assert.equal(disabled.workingThreads.length, 0);
    assert.deepEqual(
      disabled.remainingActiveThreads.map((t) => t.id),
      ["1", "2", "3"],
    );

    const enabled = partitionWorkingThreads([t1, t2, t3], true);
    assert.deepEqual(
      enabled.workingThreads.map((t) => t.id),
      ["1", "3"],
    );
    assert.deepEqual(
      enabled.remainingActiveThreads.map((t) => t.id),
      ["2"],
    );
  });

  it("groups threads by project and orders by activity, alphabetical, or manual", () => {
    const threads = [
      makeThread("a1", "/work/zebra", { updatedAt: 5000 }),
      makeThread("b1", "/work/alpha", { updatedAt: 9000 }),
      makeThread("a2", "/work/zebra", { updatedAt: 7000 }),
    ];

    const byActivity = groupThreadsByProject(threads, "last-activity");
    assert.deepEqual(
      byActivity.map((g) => g.name),
      ["alpha", "zebra"],
    );
    assert.deepEqual(
      byActivity[1]?.threads.map((t) => t.id),
      ["a2", "a1"],
    );

    const byAlpha = groupThreadsByProject(threads, "alphabetical");
    assert.deepEqual(
      byAlpha.map((g) => g.name),
      ["alpha", "zebra"],
    );

    const byManual = groupThreadsByProject(threads, "manual", ["/work/zebra", "/work/alpha"]);
    assert.deepEqual(
      byManual.map((g) => g.name),
      ["zebra", "alpha"],
    );
  });
});

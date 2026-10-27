import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { TurnItem } from "@pi-web/protocol";
import {
  formatDurationLabel,
  groupTimelineItems,
  summarizeWorkGroup,
  workGroupDuration,
  type WorkTurnItem,
} from "./timelineGrouping.ts";

type Overrides = Record<string, unknown>;

function baseItem(overrides: Overrides & { id: string; type: TurnItem["type"] }): TurnItem {
  return {
    threadId: "t1",
    ordinal: 0,
    status: "completed",
    startedAt: 1_000,
    completedAt: 2_000,
    ...overrides,
  } as TurnItem;
}

function command(id: string, overrides: Overrides = {}): WorkTurnItem {
  return baseItem({
    id,
    type: "command_execution",
    title: "npm test",
    input: "npm test",
    ...overrides,
  }) as WorkTurnItem;
}

function fileChange(id: string, overrides: Overrides = {}): TurnItem {
  return baseItem({
    id,
    type: "file_change",
    title: "edit",
    fileName: "src/app.ts",
    ...overrides,
  }) as TurnItem;
}

function assistant(id: string, overrides: Overrides = {}): TurnItem {
  return baseItem({ id, type: "assistant_message", text: "done", ...overrides });
}

test("连续的工作条目折叠成一个分组", () => {
  const rows = groupTimelineItems([command("a"), command("b"), fileChange("c") as WorkTurnItem]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.kind, "work_group");
  if (rows[0]?.kind !== "work_group") return;
  assert.equal(rows[0].items.length, 3);
  assert.equal(rows[0].summary.counts.command, 2);
  assert.equal(rows[0].summary.counts.file_change, 1);
  assert.equal(rows[0].summary.counts.tool, 0);
});

test("单个工作条目保持单行渲染", () => {
  const rows = groupTimelineItems([command("a")]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.kind, "item");
});

test("助手消息会打断分组", () => {
  const rows = groupTimelineItems([command("a"), assistant("b"), command("c")]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0]?.kind, "item");
  assert.equal(rows[1]?.kind, "item");
  assert.equal(rows[2]?.kind, "item");
});

test("连续的思考条目折叠成思考分组", () => {
  const rows = groupTimelineItems([
    baseItem({ id: "r1", type: "reasoning", text: "a" }),
    baseItem({ id: "r2", type: "reasoning", text: "b" }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.kind, "reasoning_group");
});

test("分组摘要统计失败与时间范围", () => {
  const items = [
    command("a", { status: "failed", startedAt: 100, completedAt: 400 }),
    command("b", { status: "completed", startedAt: 200, completedAt: 900 }),
  ] as WorkTurnItem[];
  const summary = summarizeWorkGroup(items);
  assert.equal(summary.hasFailure, true);
  assert.equal(summary.running, false);
  assert.equal(summary.startedAt, 100);
  assert.equal(summary.completedAt, 900);
  assert.equal(workGroupDuration(summary), 800);
});

test("运行中的条目会让分组标记为运行中", () => {
  const summary = summarizeWorkGroup([command("a", { status: "running", completedAt: undefined })]);
  assert.equal(summary.running, true);
  assert.equal(workGroupDuration(summary), null);
});

test("耗时格式化", () => {
  assert.equal(formatDurationLabel(120), "120ms");
  assert.equal(formatDurationLabel(1_500), "1.5s");
  assert.equal(formatDurationLabel(42_000), "42s");
  assert.equal(formatDurationLabel(65_000), "1m 05s");
});

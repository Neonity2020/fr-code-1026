/**
 * 时间线分组：把连续的工作条目（命令执行 / 文件改动 / 工具调用）与连续的思考条目
 * 折叠成一行摘要，对齐 t3code 的 work group rows。
 *
 * 纯函数，方便单测；渲染在 TurnItemRows.tsx。
 */
import type { TurnItem } from "@pi-web/protocol";

export type WorkTurnItem = Extract<
  TurnItem,
  { type: "command_execution" | "file_change" | "dynamic_tool" }
>;

export type ReasoningTurnItem = Extract<TurnItem, { type: "reasoning" }>;

export type WorkGroupKind = "command" | "file_change" | "tool";

export interface WorkGroupSummary {
  /** 各类型的条目数量。 */
  counts: Record<WorkGroupKind, number>;
  /** 组内是否有失败条目。 */
  hasFailure: boolean;
  /** 组内条目的时间范围（毫秒时间戳），用于显示耗时。 */
  startedAt: number | null;
  completedAt: number | null;
  /** 是否有条目仍在运行。 */
  running: boolean;
}

export type TimelineRow =
  | { kind: "item"; key: string; item: TurnItem }
  | { kind: "work_group"; key: string; items: WorkTurnItem[]; summary: WorkGroupSummary }
  | { kind: "reasoning_group"; key: string; items: ReasoningTurnItem[] };

export function isWorkItem(item: TurnItem): item is WorkTurnItem {
  return (
    item.type === "command_execution" ||
    item.type === "file_change" ||
    item.type === "dynamic_tool"
  );
}

export function workItemKind(item: WorkTurnItem): WorkGroupKind {
  switch (item.type) {
    case "command_execution":
      return "command";
    case "file_change":
      return "file_change";
    default:
      return "tool";
  }
}

export function summarizeWorkGroup(items: readonly WorkTurnItem[]): WorkGroupSummary {
  const counts: Record<WorkGroupKind, number> = { command: 0, file_change: 0, tool: 0 };
  let hasFailure = false;
  let running = false;
  let startedAt: number | null = null;
  let completedAt: number | null = null;

  for (const item of items) {
    counts[workItemKind(item)] += 1;
    if (item.status === "failed") hasFailure = true;
    if (item.status === "running" || item.status === "waiting") running = true;
    if (typeof item.startedAt === "number") {
      startedAt = startedAt === null ? item.startedAt : Math.min(startedAt, item.startedAt);
    }
    if (typeof item.completedAt === "number") {
      completedAt = completedAt === null ? item.completedAt : Math.max(completedAt, item.completedAt);
    }
  }

  return { counts, hasFailure, startedAt, completedAt, running };
}

/**
 * 把时间线条目折叠成渲染行：
 * - 连续的工作条目合并为一个工作分组（只有一条时保持单行渲染）；
 * - 连续的思考条目合并为一个思考分组；
 * - 其余条目原样输出。
 */
export function groupTimelineItems(items: readonly TurnItem[]): TimelineRow[] {
  const rows: TimelineRow[] = [];
  let workBuffer: WorkTurnItem[] = [];
  let reasoningBuffer: ReasoningTurnItem[] = [];

  const flushWork = () => {
    if (workBuffer.length === 0) return;
    if (workBuffer.length === 1) {
      const item = workBuffer[0]!;
      rows.push({ kind: "item", key: item.id, item });
    } else {
      rows.push({
        kind: "work_group",
        key: `work-group:${workBuffer[0]!.id}`,
        items: workBuffer,
        summary: summarizeWorkGroup(workBuffer),
      });
    }
    workBuffer = [];
  };

  const flushReasoning = () => {
    if (reasoningBuffer.length === 0) return;
    if (reasoningBuffer.length === 1) {
      const item = reasoningBuffer[0]!;
      rows.push({ kind: "item", key: item.id, item });
    } else {
      rows.push({
        kind: "reasoning_group",
        key: `reasoning-group:${reasoningBuffer[0]!.id}`,
        items: reasoningBuffer,
      });
    }
    reasoningBuffer = [];
  };

  for (const item of items) {
    if (isWorkItem(item)) {
      flushReasoning();
      workBuffer.push(item);
      continue;
    }
    if (item.type === "reasoning") {
      flushWork();
      reasoningBuffer.push(item);
      continue;
    }
    flushWork();
    flushReasoning();
    rows.push({ kind: "item", key: item.id, item });
  }

  flushWork();
  flushReasoning();
  return rows;
}

/** 组内耗时（毫秒）；无法确定时返回 null。 */
export function workGroupDuration(summary: WorkGroupSummary): number | null {
  if (summary.startedAt === null || summary.completedAt === null) return null;
  const duration = summary.completedAt - summary.startedAt;
  return duration >= 0 ? duration : null;
}

/** 格式化耗时：1.2s / 12s / 1m 05s。 */
export function formatDurationLabel(durationMs: number): string {
  if (durationMs < 1000) return `${Math.max(0, Math.round(durationMs))}ms`;
  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

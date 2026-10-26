import type { DomainEvent, ThreadId, ThreadSummary, TurnItem } from "./index.ts";

/** 按 id 插入或更新 TurnItem，并保持 ordinal 升序 */
export function upsertTurnItem(items: readonly TurnItem[], item: TurnItem): TurnItem[] {
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index === -1) {
    return [...items, item].sort((a, b) => a.ordinal - b.ordinal);
  }
  const next = [...items];
  next[index] = item;
  return next;
}

/** 从消息类 TurnItem 提取侧栏摘要预览 */
export function deriveLatestPreview(item: TurnItem): string | undefined {
  if (item.type === "user_message" || item.type === "assistant_message") {
    const preview = item.text.replace(/\s+/g, " ").trim().slice(0, 120);
    if (preview.length > 0) return preview;
  }
  return undefined;
}

/** 取工作目录末段作为默认标题 */
export function firstLineTitle(cwd: string): string {
  const parts = cwd.split("/");
  return parts[parts.length - 1] || cwd;
}

/** 提取领域事件所属的 threadId */
export function domainEventThreadId(event: DomainEvent): ThreadId {
  switch (event.type) {
    case "thread.created":
    case "thread.updated":
      return event.thread.id;
    case "thread.deleted":
    case "turn_item.updated":
      return event.threadId;
  }
}

/** 将最新 TurnItem 的预览合并进 ThreadSummary */
export function applyTurnItemPreview(summary: ThreadSummary, item: TurnItem): ThreadSummary {
  const preview = deriveLatestPreview(item);
  if (preview === undefined) return summary;
  return {
    ...summary,
    latestPreview: preview,
    updatedAt: item.completedAt ?? item.startedAt ?? Date.now(),
  };
}

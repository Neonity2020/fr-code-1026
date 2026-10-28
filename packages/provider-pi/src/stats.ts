/**
 * 会话统计纯函数：把 pi assistant 消息的 usage 记录折叠成 ThreadSessionStats。
 * 语义对齐 pi `calculateContextTokens`（totalTokens 优先）与
 * `get_session_stats` RPC（压缩后上下文未知，直到下一条 assistant 响应）。
 */
import type { ThreadSessionStats } from "@pi-web/protocol";

export type PiUsageLike = {
  input?: unknown;
  output?: unknown;
  cacheRead?: unknown;
  cacheWrite?: unknown;
  totalTokens?: unknown;
  cost?: { total?: unknown } | unknown;
};

const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** pi calculateContextTokens：native totalTokens 优先，缺省时按分量求和 */
export function calculateContextTokens(usage: PiUsageLike): number | null {
  const total = finite(usage.totalTokens);
  if (total !== null && total > 0) return total;
  const input = finite(usage.input) ?? 0;
  const output = finite(usage.output) ?? 0;
  const cacheRead = finite(usage.cacheRead) ?? 0;
  const cacheWrite = finite(usage.cacheWrite) ?? 0;
  const sum = input + output + cacheRead + cacheWrite;
  return sum > 0 ? sum : null;
}

function usageCostTotal(usage: PiUsageLike): number | null {
  const cost = usage.cost;
  if (cost === null || typeof cost !== "object") return null;
  return finite((cost as { total?: unknown }).total);
}

/**
 * message_end（assistant、非 error/aborted）时折叠一条 usage：
 * - usedTokens/percent 取本条消息的上下文占用（最后一条 assistant 即当前上下文）
 * - totalTokens/cost 为会话累计
 * - contextWindow 未知时沿用旧值（模型上下文窗口不会随消息变化）
 */
export function foldAssistantUsage(
  previous: ThreadSessionStats | null | undefined,
  usage: PiUsageLike,
  contextWindow: number | null,
): ThreadSessionStats {
  const usedTokens = calculateContextTokens(usage);
  const lastTotal = finite(usage.totalTokens);
  const components = [
    finite(usage.input),
    finite(usage.output),
    finite(usage.cacheRead),
    finite(usage.cacheWrite),
  ];
  const messageTotal =
    lastTotal ??
    (components.every((value) => value !== null)
      ? components.reduce<number>((sum, value) => sum + (value ?? 0), 0)
      : null);
  const previousTotal = previous?.totalTokens ?? null;
  const totalTokens =
    messageTotal !== null && previousTotal !== null
      ? previousTotal + messageTotal
      : (messageTotal ?? previousTotal);
  const messageCost = usageCostTotal(usage);
  const cost =
    messageCost !== null || previous?.cost != null
      ? (previous?.cost ?? 0) + (messageCost ?? 0)
      : null;
  const window = contextWindow ?? previous?.contextWindow ?? null;
  const percent =
    usedTokens !== null && window !== null && window > 0
      ? Math.min(100, (usedTokens / window) * 100)
      : null;
  return { usedTokens, contextWindow: window, percent, totalTokens, cost };
}

/**
 * 压缩完成后上下文占用未知（pi 语义：直到下一条 assistant 响应才可信），
 * 保留累计总量与已知窗口。
 */
export function markCompacted(
  previous: ThreadSessionStats | null | undefined,
): ThreadSessionStats {
  return {
    usedTokens: null,
    contextWindow: previous?.contextWindow ?? null,
    percent: null,
    totalTokens: previous?.totalTokens ?? null,
    cost: previous?.cost ?? null,
  };
}

/** get_session_stats RPC 响应（对齐 pi SessionStats）→ ThreadSessionStats；无有效数据时为 null */
export function statsFromSessionRpc(data: unknown): ThreadSessionStats | null {
  if (data === null || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const tokens = record["tokens"];
  const contextUsage = record["contextUsage"];
  const tokensRecord =
    tokens !== null && typeof tokens === "object" ? (tokens as Record<string, unknown>) : null;
  const usageRecord =
    contextUsage !== null && typeof contextUsage === "object"
      ? (contextUsage as Record<string, unknown>)
      : null;
  if (!tokensRecord && !usageRecord) return null;
  const totalTokens = tokensRecord ? finite(tokensRecord["total"]) : null;
  const contextWindow = usageRecord ? finite(usageRecord["contextWindow"]) : null;
  const percent = usageRecord ? finite(usageRecord["percent"]) : null;
  const usedTokensRaw = usageRecord ? finite(usageRecord["tokens"]) : null;
  const hasUsage = usedTokensRaw !== null && usedTokensRaw > 0;
  return {
    usedTokens: hasUsage ? usedTokensRaw : null,
    contextWindow: contextWindow !== null && contextWindow > 0 ? contextWindow : null,
    percent: hasUsage ? percent : null,
    totalTokens,
    cost: finite(record["cost"]),
  };
}

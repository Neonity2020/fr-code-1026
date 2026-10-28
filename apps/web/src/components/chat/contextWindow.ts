/**
 * ContextWindowMeter 视图纯函数，移植自 t3code `apps/web/src/lib/contextWindow.ts`
 * 与 `ContextWindowMeter.tsx` 顶部的小工具（数字缩写 / 百分比格式）。
 */
import type { ThreadSessionStats } from "@pi-web/protocol";

/** 1234 → "1.2k"、12000 → "12k"、1500000 → "1.5m"；null/非有限值 → "0" */
export function formatContextWindowTokens(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "0";
  }
  if (value < 1_000) {
    return `${Math.round(value)}`;
  }
  if (value < 10_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  if (value < 1_000_000) {
    return `${Math.round(value / 1_000)}k`;
  }
  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
}

/** <10 保留一位小数（去尾 .0），否则取整；null/非有限 → null */
export function formatContextWindowPercentage(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  if (value < 10) {
    return `${value.toFixed(1).replace(/\.0$/, "")}%`;
  }
  return `${Math.round(value)}%`;
}

export interface ContextWindowView {
  /** 夹取到 [0,100] 的占用百分比，未知时为 0（圆环画满底色） */
  normalizedPercentage: number;
  /** 圆环 / 进度条颜色（>90% 转错误色） */
  usageColor: string;
  /** 是否有可绘制的窗口上限 */
  hasWindow: boolean;
  /** 格式化好的百分比文案，如 "18%" */
  percentageLabel: string | null;
  /** "18.2k/100k" 形态的用量文案（无窗口时只有已用量） */
  usageLabel: string;
  /** 会话累计处理 token（>0 才展示） */
  totalProcessedTokens: number | null;
}

export function deriveContextWindowView(stats: ThreadSessionStats): ContextWindowView {
  const normalizedPercentage = Math.max(0, Math.min(100, stats.percent ?? 0));
  const isOverloaded = normalizedPercentage > 90;
  const hasWindow = stats.contextWindow !== null && stats.contextWindow > 0;
  const percentageLabel = formatContextWindowPercentage(stats.percent);
  const totalProcessedTokens =
    stats.totalTokens !== null && stats.totalTokens > 0 ? stats.totalTokens : null;
  return {
    normalizedPercentage,
    usageColor: isOverloaded
      ? "var(--color-error)"
      : "color-mix(in oklab, var(--color-muted-foreground) 72%, transparent)",
    hasWindow,
    percentageLabel,
    usageLabel: hasWindow
      ? `${formatContextWindowTokens(stats.usedTokens)}/${formatContextWindowTokens(stats.contextWindow)}`
      : formatContextWindowTokens(stats.usedTokens),
    totalProcessedTokens,
  };
}

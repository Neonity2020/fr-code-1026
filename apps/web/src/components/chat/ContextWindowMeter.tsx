/**
 * ContextWindowMeter — 1:1 复刻 t3code `components/chat/ContextWindowMeter.tsx`：
 * - composer 右下角的圆形进度环按钮（stroke-dashoffset 动画，>90% 转错误色）
 * - hover / 点击弹出 Context Window 弹层：百分比 · 已用/上限、进度条、
 *   会话累计处理 token、自动压缩提示与手动 Compact 按钮
 * 数据源为 ThreadSummary.stats（pi assistant usage 折叠 + get_session_stats 对账）。
 */
import { Minimize2Icon } from "lucide-react";
import type { ThreadSessionStats } from "@pi-web/protocol";
import { useI18n } from "~/i18n";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { deriveContextWindowView, formatContextWindowTokens } from "./contextWindow";

const RING_RADIUS = 9.75;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function ContextWindowMeter(props: {
  stats: ThreadSessionStats;
  modelDisplayName?: string | null;
  onCompact?: (() => void) | undefined;
  compactDisabled?: boolean | undefined;
  compactDisabledReason?: string | null | undefined;
}) {
  const { stats, modelDisplayName, onCompact, compactDisabled, compactDisabledReason } = props;
  const { tr } = useI18n();
  const view = deriveContextWindowView(stats);
  const dashOffset = RING_CIRCUMFERENCE * (1 - view.normalizedPercentage / 100);

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={onCompact ? 150 : 0}
        render={
          <Button
            size="icon-sm"
            variant="ghost-muted"
            className="size-7 rounded-full hover:text-muted-foreground data-pressed:text-muted-foreground"
            aria-label={
              view.hasWindow && view.percentageLabel
                ? tr(
                    `上下文窗口已用 ${view.percentageLabel}`,
                    `Context window ${view.percentageLabel} used`,
                  )
                : tr(
                    `上下文窗口已用 ${formatContextWindowTokens(stats.usedTokens)} tokens`,
                    `Context window ${formatContextWindowTokens(stats.usedTokens)} tokens used`,
                  )
            }
          >
            <span className="relative flex size-5 items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                className="absolute inset-0 size-full -rotate-90 transform-gpu"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="color-mix(in oklab, var(--color-muted-foreground) 24%, transparent)"
                  strokeWidth="3"
                />
                <circle
                  cx="12"
                  cy="12"
                  r={RING_RADIUS}
                  fill="none"
                  stroke={view.usageColor}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={dashOffset}
                  className="transition-[stroke-dashoffset,stroke] duration-500 ease-out motion-reduce:transition-none"
                />
              </svg>
            </span>
          </Button>
        }
      />
      <PopoverPopup
        tooltipStyle
        side="top"
        align="end"
        padding="none"
        width="sm"
        className="max-w-none whitespace-normal text-left"
      >
        <div className="flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-medium text-muted-foreground">
              {tr("上下文窗口", "Context Window")}
            </div>
            {view.hasWindow && view.percentageLabel ? (
              <div className="text-secondary-label text-[11px] tabular-nums">
                <span>{view.percentageLabel}</span>
                <span className="mx-1">·</span>
                <span>{view.usageLabel}</span>
              </div>
            ) : (
              <div className="text-secondary-label text-[11px] tabular-nums">
                {view.usageLabel}
              </div>
            )}
          </div>
          {view.hasWindow ? (
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(view.normalizedPercentage)}
              aria-label={tr("上下文窗口占用", "Context window usage")}
            >
              <div
                className="h-full rounded-full transition-[width,background-color] duration-500 ease-out motion-reduce:transition-none"
                style={{
                  width: `${view.normalizedPercentage}%`,
                  backgroundColor: view.usageColor,
                }}
              />
            </div>
          ) : null}
          {view.totalProcessedTokens !== null ? (
            <div className="flex items-center justify-between gap-3 text-[11px] leading-4">
              <span className="text-secondary-label">{tr("累计处理", "Total processed")}</span>
              <span className="text-secondary-label font-medium tabular-nums">
                {formatContextWindowTokens(view.totalProcessedTokens)}
              </span>
            </div>
          ) : null}
          <div className="mt-1 text-pretty text-[11px] font-medium text-secondary-label">
            {tr(
              "上下文在需要时会自动压缩。",
              modelDisplayName
                ? `Context for ${modelDisplayName} compacts automatically when needed.`
                : "Context compacts automatically when needed.",
            )}
          </div>
          {onCompact ? (
            <>
              <Button
                size="xs"
                variant="outline"
                className="mt-1 w-full justify-center"
                disabled={compactDisabled}
                onClick={onCompact}
              >
                <Minimize2Icon aria-hidden="true" />
                {tr("压缩上下文", "Compact context")}
              </Button>
              {compactDisabled && compactDisabledReason ? (
                <div className="text-pretty text-[11px] text-secondary-label">
                  {compactDisabledReason}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </PopoverPopup>
    </Popover>
  );
}

/**
 * 工作日志行（移植 t3code components/chat/WorkLog.tsx 的呈现原语）：
 * 扁平的一行：图标 + 文本 + 尾部信息；展开的详情缩进显示。
 */
import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

interface RowContent {
  icon?: ReactNode;
  label: ReactNode;
  trailing?: ReactNode;
  wrapLabel?: boolean;
}

export function WorkLogLine({ icon, label, trailing, wrapLabel }: RowContent) {
  return (
    <div
      className={cn(
        "flex min-h-6 min-w-0 gap-1.5 text-sm leading-relaxed select-none [&_*]:select-none",
        wrapLabel ? "items-start" : "items-center",
      )}
    >
      <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
        {icon ? (
          <span className="relative w-6 shrink-0 leading-0">
            <span className="inline-block size-6 overflow-hidden align-[calc(0.5cap_-_0.75rem)]">
              <span className="flex size-full items-center justify-center">{icon}</span>
            </span>
          </span>
        ) : null}
        <div
          className={cn(
            "min-w-0 flex-1 text-secondary-label",
            !wrapLabel && "truncate [&_*]:whitespace-nowrap",
          )}
        >
          {label}
        </div>
      </div>
      {trailing}
    </div>
  );
}

const INTERACTION_CLASS_NAME =
  "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70";

export function WorkLogButton({
  icon,
  label,
  trailing,
  wrapLabel = false,
  className,
  ...buttonProps
}: RowContent &
  Omit<React.ComponentProps<"button">, "style" | "children"> & { className?: string }) {
  return (
    <button
      {...buttonProps}
      type="button"
      className={cn(
        "group/timeline-row relative w-full min-w-0 rounded-md px-0.5 py-0.5 text-left transition-colors hover:bg-foreground/[0.04]",
        INTERACTION_CLASS_NAME,
        className,
      )}
    >
      <WorkLogLine icon={icon} label={label} trailing={trailing} wrapLabel={wrapLabel} />
    </button>
  );
}

const LIVE_EDGE_PX = 4;

/** 展开的详情：缩进 + 可滚动 + 可选中文本（对齐 t3code WorkLogDetails）。 */
export function WorkLogDetails({
  children,
  kind = "text",
}: {
  children: ReactNode;
  kind?: "text" | "panel";
}) {
  return (
    <div
      className={cn(
        "cursor-auto",
        kind === "text"
          ? "ms-7 flex max-h-96 flex-col gap-3 overflow-auto px-0.5 py-1 select-text"
          : "mt-0.5 mb-1.5 pb-2",
      )}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}

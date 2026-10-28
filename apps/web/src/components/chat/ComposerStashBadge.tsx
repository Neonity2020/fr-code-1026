/**
 * 暂存徽标（对齐 t3code `ComposerStashBadge`）：
 * 贴在 composer 右上角的书签页签，右侧显示暂存条数。
 * 每次压入新条目时计数做一次轻微的入场动画，安静地确认「收到了」。
 */
import { BookmarkIcon } from "lucide-react";
import { memo } from "react";

import { cn } from "~/lib/utils";

export const ComposerStashBadge = memo(function ComposerStashBadge({
  count,
  menuOpen,
  pulseKey,
  pulsing,
  label,
  onToggleMenu,
}: {
  count: number;
  menuOpen: boolean;
  pulseKey: number;
  pulsing: boolean;
  label: string;
  onToggleMenu: () => void;
}) {
  if (count === 0) return null;

  return (
    <div
      data-composer-stash-badge="true"
      className={cn(
        "absolute -top-2.5 right-3 z-30 flex items-center gap-1.5 rounded-t-xl border border-b-0 bg-card px-2.5 py-1 text-xs shadow-xs",
        menuOpen || pulsing ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <button
        type="button"
        onPointerDown={(event) => event.preventDefault()}
        onClick={onToggleMenu}
        aria-label={`${label} (${count})`}
        aria-expanded={menuOpen}
        className={cn(
          "flex items-center gap-1.5 rounded-sm transition-colors",
          menuOpen || pulsing ? "text-foreground" : "hover:text-foreground",
        )}
      >
        <BookmarkIcon className="size-3.5" />
        <span>{label}</span>
        <span
          key={pulseKey}
          className={cn(
            "tabular-nums",
            pulsing
              ? "animate-[prompt-stash-count-enter_180ms_ease-out_both] text-primary motion-reduce:animate-none"
              : "text-muted-foreground",
          )}
        >
          {count}
        </span>
      </button>
    </div>
  );
});

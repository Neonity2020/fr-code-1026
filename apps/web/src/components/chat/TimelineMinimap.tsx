import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { useI18n } from "~/i18n";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  resolveTimelineMinimapHeightStyle,
  resolveTimelineMinimapIndexFromPointer,
  resolveTimelineMinimapPreview,
  resolveTimelineMinimapTopPercent,
  TIMELINE_MINIMAP_MIN_ITEMS,
  type TimelineMinimapItem,
} from "./timelineMinimap";

function timelineMinimapEventTargetsPreview(target: EventTarget): boolean {
  return target instanceof Element && target.closest("[data-minimap-preview]") !== null;
}

export function TimelineMinimap({
  items,
  currentIndex,
  onSelect,
}: {
  readonly items: ReadonlyArray<TimelineMinimapItem>;
  readonly currentIndex: number | null;
  readonly onSelect: (item: TimelineMinimapItem) => void;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const { tr } = useI18n();

  if (items.length < TIMELINE_MINIMAP_MIN_ITEMS) {
    return null;
  }

  const resolvedActiveIndex =
    activeIndex !== null && activeIndex < items.length ? activeIndex : null;
  const activeItem = resolveTimelineMinimapPreview(
    resolvedActiveIndex === null ? null : (items[resolvedActiveIndex] ?? null),
  );
  const activeTopPercent =
    resolvedActiveIndex === null
      ? 0
      : resolveTimelineMinimapTopPercent(resolvedActiveIndex, items.length);
  const activeTooltipTranslate =
    resolvedActiveIndex === null
      ? "-50%"
      : resolvedActiveIndex === 0
        ? "0%"
        : resolvedActiveIndex === items.length - 1
          ? "-100%"
          : "-50%";

  const resolvedCurrentIndex =
    currentIndex !== null && currentIndex >= 0 && currentIndex < items.length ? currentIndex : 0;
  const previousItem = items[resolvedCurrentIndex - 1] ?? null;
  const nextItem = items[resolvedCurrentIndex + 1] ?? null;

  const resolveActiveIndexFromPointer = (event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return resolveTimelineMinimapIndexFromPointer({
      itemCount: items.length,
      railTop: rect.top,
      railHeight: rect.height,
      pointerY: event.clientY,
    });
  };

  const moveActiveIndex = (delta: number) => {
    setActiveIndex((current) => {
      const base = current ?? resolvedCurrentIndex;
      return Math.max(0, Math.min(items.length - 1, base + delta));
    });
  };

  return (
    <div
      className="
        group/minimap pointer-events-none absolute inset-y-0 left-0 z-30 hidden w-16 opacity-60
        transition-opacity duration-150
        hover:opacity-100
        focus-within:opacity-100
        [@media(pointer:fine)]:block
      "
      data-testid="timeline-minimap"
    >
      <div className="relative h-full w-full select-none">
        <div
          className="pointer-events-auto absolute top-1/2 left-3 -translate-y-1/2"
          style={{
            height: resolveTimelineMinimapHeightStyle(items.length),
            width: activeItem !== null ? "2.5rem" : "1.75rem",
          }}
        >
          <TimelineMinimapNavigationButton
            direction="previous"
            disabled={previousItem === null}
            onClick={() => {
              if (previousItem) onSelect(previousItem);
            }}
          />
          <button
            aria-label={tr(
              `跳转到消息：${activeItem?.userText ?? "用户消息"}`,
              `Jump to message: ${activeItem?.userText ?? "User message"}`,
            )}
            className="
              absolute inset-y-0 left-0 w-full cursor-pointer bg-transparent
              focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none
              focus-visible:ring-inset
            "
            onBlur={() => setActiveIndex(null)}
            onClick={(event) => {
              if (timelineMinimapEventTargetsPreview(event.target)) return;
              const nextIndex = resolveActiveIndexFromPointer(event);
              const selectedItem = nextIndex === null ? null : (items[nextIndex] ?? null);
              if (selectedItem) {
                onSelect(selectedItem);
              }
              event.currentTarget.blur();
            }}
            onFocus={() => setActiveIndex((current) => current ?? resolvedCurrentIndex)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                moveActiveIndex(1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                moveActiveIndex(-1);
              } else if (event.key === "Home") {
                event.preventDefault();
                setActiveIndex(0);
              } else if (event.key === "End") {
                event.preventDefault();
                setActiveIndex(items.length - 1);
              } else if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                if (activeItem) onSelect(activeItem);
              }
            }}
            onMouseLeave={() => setActiveIndex(null)}
            onMouseMove={(event) => {
              setActiveIndex(resolveActiveIndexFromPointer(event));
            }}
            onMouseDown={(event) => {
              if (timelineMinimapEventTargetsPreview(event.target)) return;
              event.preventDefault();
            }}
            type="button"
          >
            <div className="absolute top-0 left-3 h-full w-px bg-border/20" />
            {items.map((item, index) => {
              const top = `${resolveTimelineMinimapTopPercent(index, items.length)}%`;
              const activeDistance =
                resolvedActiveIndex === null ? null : Math.abs(index - resolvedActiveIndex);
              const isCurrent = index === resolvedCurrentIndex;
              return (
                <span
                  aria-hidden="true"
                  className={cn(
                    "group/strip pointer-events-none absolute left-0 h-0.5 w-6 origin-left -translate-y-1/2 rounded-full transition-transform duration-150",
                    activeDistance === 0 || isCurrent
                      ? "bg-foreground/70"
                      : "bg-muted-foreground/30",
                    activeDistance === 0
                      ? "scale-x-100"
                      : activeDistance === 1
                        ? "scale-x-[0.667]"
                        : activeDistance === 2
                          ? "scale-x-[0.417]"
                          : "scale-x-[0.333]",
                  )}
                  data-in-view={isCurrent ? "true" : "false"}
                  data-minimap-strip
                  key={item.id}
                  style={{ top }}
                />
              );
            })}
            {activeItem ? (
              <span
                className="pointer-events-auto absolute left-8 w-80 cursor-text select-text"
                data-minimap-preview
                onMouseMove={(event) => event.stopPropagation()}
                style={{
                  top: `${activeTopPercent}%`,
                  transform: `translateY(${activeTooltipTranslate})`,
                }}
              >
                <span className="dropdown-glass block rounded-xl p-3 text-left text-popover-foreground shadow-xl shadow-black/25">
                  <span className="block max-w-full overflow-hidden text-sm leading-5 font-medium text-ellipsis whitespace-nowrap">
                    {activeItem.userText ?? tr("用户消息", "User message")}
                  </span>
                  {activeItem.assistantText ? (
                    <span
                      className="mt-1 max-h-[3.75rem] overflow-hidden text-sm leading-5 text-muted-foreground"
                      style={{
                        display: "-webkit-box",
                        WebkitBoxOrient: "vertical",
                        WebkitLineClamp: 3,
                      }}
                    >
                      {activeItem.assistantText}
                    </span>
                  ) : null}
                </span>
              </span>
            ) : null}
          </button>
          <TimelineMinimapNavigationButton
            direction="next"
            disabled={nextItem === null}
            onClick={() => {
              if (nextItem) onSelect(nextItem);
            }}
          />
        </div>
      </div>
    </div>
  );
}

function TimelineMinimapNavigationButton({
  direction,
  disabled,
  onClick,
}: {
  direction: "previous" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  const { tr } = useI18n();
  const previous = direction === "previous";
  const label = previous ? tr("上一轮对话", "Previous turn") : tr("下一轮对话", "Next turn");
  const Icon = previous ? ChevronUpIcon : ChevronDownIcon;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "pointer-events-auto absolute left-1 z-10 inline-flex -translate-x-1/2 opacity-0 transition-opacity duration-150 group-hover/minimap:opacity-100 hover:opacity-100 focus-within:opacity-100",
              previous ? "bottom-[calc(100%+2px)]" : "top-[calc(100%+2px)]",
            )}
          />
        }
      >
        <Button
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          size="icon-micro"
          type="button"
          variant="ghost-muted"
        >
          <Icon className="size-4 text-foreground/90" />
        </Button>
      </TooltipTrigger>
      <TooltipPopup side={previous ? "top" : "bottom"}>{label}</TooltipPopup>
    </Tooltip>
  );
}

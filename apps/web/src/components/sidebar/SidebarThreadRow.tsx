import {
  AlarmClockIcon,
  AlarmClockOffIcon,
  CheckIcon,
  CircleAlertIcon,
  CircleDashedIcon,
  ClockIcon,
  PinIcon,
  PinOffIcon,
  ShieldQuestionIcon,
  Undo2Icon,
} from "lucide-react";
import {
  memo,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { ThreadSummary } from "@pi-web/protocol";
import { useI18n } from "~/i18n";
import { cn } from "~/lib/utils";
import { projectBasename } from "../../projectIdentity";
import { PiGlyph } from "../chat/PiModelPicker";
import { ProjectIcon } from "../ProjectMonogram";
import {
  formatCompactRelativeTime,
  formatSnoozeWakeLabel,
  formatWorkingDuration,
  resolveSnoozePresets,
} from "../Sidebar.snooze";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export interface SidebarThreadRowCallbacks {
  onSelect: (thread: ThreadSummary) => void;
  onContextMenu: (thread: ThreadSummary, position: { x: number; y: number }) => void;
  onSettleToggle: (thread: ThreadSummary, settled: boolean) => void;
  onSnooze: (thread: ThreadSummary, untilMs: number | null) => void;
  onAcknowledgeWoke: (thread: ThreadSummary) => void;
  onPinToggle: (thread: ThreadSummary, pinned: boolean) => void;
  onRename: (thread: ThreadSummary, newTitle: string) => void;
}

function WorkingDurationLabel({ startedMs }: { startedMs: number }) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return <span className="tabular-nums">{formatWorkingDuration(startedMs, nowMs)}</span>;
}

export const SidebarThreadRow = memo(function SidebarThreadRow({
  thread,
  isActive,
  variant = "card",
  variantAction = "settle",
  isRenaming = false,
  onCancelRename,
  callbacks,
}: {
  thread: ThreadSummary;
  isActive: boolean;
  variant?: "card" | "slim";
  variantAction?: "settle" | "unsettle" | "unsnooze";
  isRenaming?: boolean;
  onCancelRename?: () => void;
  callbacks: SidebarThreadRowCallbacks;
}) {
  const [snoozeMenuOpen, setSnoozeMenuOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState(thread.title);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const renameCommittedRef = useRef(false);
  const { tr } = useI18n();

  const isPinned = Boolean(thread.pinnedAt);
  const isSnoozed = typeof thread.snoozedUntil === "number" && thread.snoozedUntil > Date.now();
  const isWoke = Boolean(thread.wokeAt) && !isSnoozed;
  const projectName = projectBasename(thread.cwd);

  useEffect(() => {
    if (isRenaming) {
      setDraftTitle(thread.title);
      renameCommittedRef.current = false;
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isRenaming, thread.title]);

  const commitRename = () => {
    if (renameCommittedRef.current) return;
    renameCommittedRef.current = true;
    const trimmed = draftTitle.trim();
    if (trimmed && trimmed !== thread.title) {
      callbacks.onRename(thread, trimmed);
    }
    onCancelRename?.();
  };

  const handleRenameKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      commitRename();
    } else if (event.key === "Escape") {
      event.preventDefault();
      renameCommittedRef.current = true;
      setDraftTitle(thread.title);
      onCancelRename?.();
    }
  };

  const handleRowClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (isRenaming) return;
    if ((event.target as HTMLElement).closest("[data-row-action]")) return;
    callbacks.onSelect(thread);
  };

  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    callbacks.onContextMenu(thread, { x: event.clientX, y: event.clientY });
  };

  const rowSurfaceClassName = cn(
    "group/sidebar-row relative w-full cursor-pointer overflow-hidden rounded-md text-left outline-none select-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
    variantAction === "unsettle" &&
      !isActive &&
      "[&:not(:hover):not(:focus-within)_*]:text-secondary-label/70",
    isActive
      ? "bg-sidebar-row-active text-sidebar-foreground light:shadow-xs light:ring-1 light:ring-inset light:ring-sidebar-border/70"
      : "bg-transparent text-sidebar-foreground hover:bg-sidebar-row-hover",
  );

  const titleNode = isRenaming ? (
    <input
      ref={inputRef}
      value={draftTitle}
      aria-label="Thread title"
      onChange={(event) => setDraftTitle(event.currentTarget.value)}
      onBlur={commitRename}
      onKeyDown={handleRenameKeyDown}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      className="min-w-0 flex-1 rounded-sm border border-input bg-card px-1 text-sm font-medium text-card-foreground outline-none focus:border-foreground"
    />
  ) : (
    <span
      className={cn(
        "min-w-0 flex-1 text-start text-sm transition-opacity",
        variant === "card"
          ? cn(
              "truncate font-medium",
              thread.unread || isWoke ? "text-foreground" : "text-foreground/90",
            )
          : cn(
              "truncate font-normal group-focus-within/sidebar-row:text-foreground group-hover/sidebar-row:text-foreground",
              isActive || isWoke ? "text-foreground" : "text-secondary-label/70",
            ),
      )}
    >
      {thread.title}
    </span>
  );

  const pinIndicator = isPinned ? (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            data-row-action
            aria-label={tr("取消置顶", "Unpin thread")}
            onClick={(event) => {
              event.stopPropagation();
              callbacks.onPinToggle(thread, false);
            }}
            className="group/unpin inline-flex cursor-pointer items-center rounded-sm text-muted-foreground/65 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          />
        }
      >
        <PinIcon
          aria-hidden
          className="size-3 shrink-0 group-hover/unpin:hidden group-focus-visible/unpin:hidden"
        />
        <PinOffIcon
          aria-hidden
          className="hidden size-3 shrink-0 group-hover/unpin:block group-focus-visible/unpin:block"
        />
      </TooltipTrigger>
      <TooltipPopup side="top">{tr("取消置顶", "Unpin thread")}</TooltipPopup>
    </Tooltip>
  ) : null;

  if (variant === "slim") {
    return (
      <li
        data-thread-item={thread.id}
        className="list-none [content-visibility:auto] [contain-intrinsic-size:auto_36px]"
      >
        <div
          role="button"
          tabIndex={0}
          aria-current={isActive ? "page" : undefined}
          data-testid="sidebar-row-slim"
          className={cn(rowSurfaceClassName, "flex h-9 items-center gap-2.5 px-2.5")}
          onClick={handleRowClick}
          onContextMenu={handleContextMenu}
          onKeyDown={(event) => {
            if (isRenaming) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              callbacks.onSelect(thread);
            }
          }}
        >
          <span
            className={cn(
              "flex shrink-0 items-center transition-opacity",
              (!isActive || variantAction === "unsettle") &&
                "opacity-40 grayscale group-focus-within/sidebar-row:opacity-100 group-focus-within/sidebar-row:grayscale-0 group-hover/sidebar-row:opacity-100 group-hover/sidebar-row:grayscale-0",
            )}
          >
            <ProjectIcon projectName={projectName} className="size-4" />
          </span>
          {titleNode}
          {pinIndicator}
          <span className="relative ml-auto flex h-6 min-w-8 shrink-0 items-center justify-end">
            <span
              className={cn(
                "inline-flex justify-end tabular-nums text-secondary-label transition-opacity",
                !isWoke && "group-any-hover/sidebar-row:opacity-0",
              )}
            >
              {variantAction === "unsnooze" && typeof thread.snoozedUntil === "number" ? (
                <span className="text-xs text-sky-400 tabular-nums">
                  {formatSnoozeWakeLabel(thread.snoozedUntil)}
                </span>
              ) : isWoke ? (
                <button
                  type="button"
                  data-row-action
                  aria-label="Dismiss Woke notification"
                  onClick={(event) => {
                    event.stopPropagation();
                    callbacks.onAcknowledgeWoke(thread);
                  }}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-sm text-xs font-medium text-amber-400 outline-none hover:underline"
                >
                  <AlarmClockIcon aria-hidden className="size-3" />
                  <span>Woke</span>
                </button>
              ) : (
                <span className="text-xs">
                  {formatCompactRelativeTime(thread.settledAt ?? thread.updatedAt)}
                </span>
              )}
            </span>

            {variantAction === "unsnooze" ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      data-row-action
                      aria-label="Wake thread now"
                      onClick={(event) => {
                        event.stopPropagation();
                        callbacks.onSnooze(thread, null);
                      }}
                      className="pointer-events-none absolute inset-y-0 right-0 -mr-1 inline-flex cursor-pointer items-center gap-1 rounded-md bg-transparent px-1.5 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 group-any-hover/sidebar-row:pointer-events-auto group-any-hover/sidebar-row:opacity-100"
                    >
                      <AlarmClockOffIcon className="mb-px size-3" />
                    </button>
                  }
                />
                <TooltipPopup side="top">Wake thread now</TooltipPopup>
              </Tooltip>
            ) : variantAction === "unsettle" ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      data-row-action
                      aria-label="Un-settle thread"
                      onClick={(event) => {
                        event.stopPropagation();
                        callbacks.onSettleToggle(thread, false);
                      }}
                      className="pointer-events-none absolute inset-y-0 right-0 -mr-1 inline-flex cursor-pointer items-center gap-1 rounded-md bg-transparent px-1.5 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 group-any-hover/sidebar-row:pointer-events-auto group-any-hover/sidebar-row:opacity-100"
                    >
                      <Undo2Icon className="mb-px size-3.5" />
                    </button>
                  }
                />
                <TooltipPopup side="top">Un-settle thread</TooltipPopup>
              </Tooltip>
            ) : (
              <button
                type="button"
                data-row-action
                aria-label="Settle thread"
                onClick={(event) => {
                  event.stopPropagation();
                  callbacks.onSettleToggle(thread, true);
                }}
                className="pointer-events-none absolute inset-y-0 right-0 inline-flex cursor-pointer items-center gap-1 rounded-md bg-transparent px-2 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 group-any-hover/sidebar-row:pointer-events-auto group-any-hover/sidebar-row:opacity-100"
              >
                <CheckIcon className="size-3" />
              </button>
            )}
          </span>
        </div>
      </li>
    );
  }

  return (
    <li
      data-thread-item={thread.id}
      className="list-none py-0.5 [content-visibility:auto] [contain-intrinsic-size:auto_78px]"
    >
      <div
        role="button"
        tabIndex={0}
        aria-current={isActive ? "page" : undefined}
        data-testid="sidebar-row-card"
        className={rowSurfaceClassName}
        onClick={handleRowClick}
        onContextMenu={handleContextMenu}
        onKeyDown={(event) => {
          if (isRenaming) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            callbacks.onSelect(thread);
          }
        }}
      >
        <div className="relative z-10 h-[4.875rem] px-(--sidebar-row-content-inset) py-(--sidebar-content-inset)">
          {/* Line 1: Project icon + Project name + Status / Hover actions */}
          <div className="flex h-5 min-w-0 items-center gap-1.5">
            <ProjectIcon projectName={projectName} className="size-4 shrink-0" />
            {pinIndicator}
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-secondary-label">
              {projectName}
            </span>

            <span className="group/sidebar-status-slot relative ml-auto flex h-5 min-w-8 shrink-0 items-stretch justify-end text-xs">
              <span
                className={cn(
                  isWoke
                    ? "pointer-events-auto"
                    : "pointer-events-none group-has-[:focus-visible]/sidebar-status-slot:absolute group-has-[:focus-visible]/sidebar-status-slot:right-0 group-has-[:focus-visible]/sidebar-status-slot:opacity-0 group-any-hover/sidebar-row:absolute group-any-hover/sidebar-row:right-0 group-any-hover/sidebar-row:opacity-0",
                  "flex items-center self-center justify-self-end tabular-nums text-secondary-label",
                  snoozeMenuOpen && "pointer-events-none absolute right-0 opacity-0",
                )}
              >
                {thread.status === "running" ? (
                  <span className="inline-flex items-center gap-1 font-medium text-sky-500">
                    <CircleDashedIcon aria-hidden className="size-4 shrink-0 animate-spin" />
                    <span>{tr("运行中", "Working")}</span>
                    <WorkingDurationLabel startedMs={thread.updatedAt} />
                  </span>
                ) : thread.status === "waiting" ? (
                  <span className="inline-flex items-center gap-1 font-medium text-amber-500">
                    <ShieldQuestionIcon aria-hidden className="size-4 shrink-0" />
                    <span>{tr("待审批", "Approval")}</span>
                  </span>
                ) : thread.status === "error" ? (
                  <span className="inline-flex items-center gap-1 font-medium text-destructive">
                    <CircleAlertIcon aria-hidden className="size-4 shrink-0" />
                    <span>{tr("失败", "Failed")}</span>
                  </span>
                ) : isWoke ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          data-row-action
                          aria-label={tr("关闭唤醒提醒", "Dismiss Woke notification")}
                          onClick={(event) => {
                            event.stopPropagation();
                            callbacks.onAcknowledgeWoke(thread);
                          }}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-sm font-medium text-amber-400 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        >
                          <AlarmClockIcon aria-hidden className="size-4 shrink-0" />
                          <span role="status">{tr("已唤醒", "Woke")}</span>
                        </button>
                      }
                    />
                    <TooltipPopup side="top">
                      {tr("关闭唤醒提醒", "Dismiss Woke notification")}
                    </TooltipPopup>
                  </Tooltip>
                ) : (
                  <span>{formatCompactRelativeTime(thread.updatedAt)}</span>
                )}
              </span>

              {/* Hover actions: Snooze + Settle */}
              <span
                data-row-action
                className={cn(
                  "pointer-events-none absolute inset-y-0 right-0 flex items-stretch opacity-0 has-[:focus-visible]:pointer-events-auto has-[:focus-visible]:static has-[:focus-visible]:opacity-100 group-any-hover/sidebar-row:pointer-events-auto group-any-hover/sidebar-row:static group-any-hover/sidebar-row:opacity-100",
                  snoozeMenuOpen && "pointer-events-auto static opacity-100",
                )}
              >
                <Menu open={snoozeMenuOpen} onOpenChange={setSnoozeMenuOpen}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <MenuTrigger
                          render={
                            <button
                              type="button"
                              aria-label={tr("延后提醒", "Snooze thread")}
                              onClick={(event) => event.stopPropagation()}
                              className="inline-flex cursor-pointer items-center rounded-md bg-transparent px-1.5 text-xs text-muted-foreground hover:text-foreground"
                            />
                          }
                        >
                          <ClockIcon className="size-3.5" />
                        </MenuTrigger>
                      }
                    />
                    <TooltipPopup side="top">{tr("延后提醒", "Snooze thread")}</TooltipPopup>
                  </Tooltip>
                  <MenuPopup align="end" sideOffset={4} className="w-56">
                    <div className="px-2 py-1 text-2xs font-medium text-muted-foreground">
                      {tr("延后至", "Snooze until")}
                    </div>
                    {resolveSnoozePresets().map((preset) => (
                      <MenuItem
                        key={preset.id}
                        onClick={() => {
                          callbacks.onSnooze(thread, preset.untilMs);
                          setSnoozeMenuOpen(false);
                        }}
                      >
                        <ClockIcon className="size-3.5 text-muted-foreground" />
                        <span className="flex-1">{preset.label}</span>
                        <span className="text-2xs text-muted-foreground tabular-nums">
                          {preset.detail}
                        </span>
                      </MenuItem>
                    ))}
                    {isSnoozed ? (
                      <>
                        <MenuSeparator />
                        <MenuItem
                          onClick={() => {
                            callbacks.onSnooze(thread, null);
                            setSnoozeMenuOpen(false);
                          }}
                        >
                          <AlarmClockOffIcon className="size-3.5" />
                          <span>{tr("立即唤醒", "Wake now")}</span>
                        </MenuItem>
                      </>
                    ) : null}
                  </MenuPopup>
                </Menu>

                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        aria-label={tr("结项线程", "Settle thread")}
                        onClick={(event) => {
                          event.stopPropagation();
                          callbacks.onSettleToggle(thread, true);
                        }}
                        className="-mr-1 inline-flex cursor-pointer items-center gap-1 rounded-md bg-transparent px-1.5 text-xs text-muted-foreground hover:text-foreground"
                      />
                    }
                  >
                    <CheckIcon className="size-3.5" />
                    {tr("结项", "Settle")}
                  </TooltipTrigger>
                  <TooltipPopup side="top">{tr("结项线程", "Settle thread")}</TooltipPopup>
                </Tooltip>
              </span>
            </span>
          </div>

          {/* Line 2: Thread title */}
          <div className="mt-1 flex min-w-0">{titleNode}</div>

          {/* Line 3: Branch + Pi provider icon */}
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-secondary-label">
            <span className="flex min-w-0 flex-1 truncate text-muted-foreground/40">
              {thread.branch ?? "main"}
            </span>
            <span
              aria-hidden
              className="pointer-events-none ml-auto inline-flex shrink-0 items-center gap-1"
            >
              <PiGlyph className="size-3.5 opacity-60" />
            </span>
          </div>
        </div>
      </div>
    </li>
  );
});

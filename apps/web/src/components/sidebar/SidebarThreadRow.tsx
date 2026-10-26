import {
  AlarmClockIcon,
  AlarmClockOffIcon,
  CheckIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  GitBranchIcon,
  PinIcon,
  PinOffIcon,
  ShieldQuestionIcon,
  Undo2Icon,
  XIcon,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { ThreadSummary } from "@pi-web/protocol";
import { cn } from "~/lib/utils";
import { projectBasename } from "../../projectIdentity";
import { ProjectIcon } from "../ProjectMonogram";
import {
  formatCompactRelativeTime,
  formatSnoozeWakeLabel,
  formatWorkingDuration,
  resolveSnoozePresets,
} from "../Sidebar.snooze";
import { InlineButton } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuShortcut, MenuTrigger } from "../ui/menu";
import { MiddleTruncate } from "../ui/middle-truncate";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function PiProviderLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="165.29 165.29 469.43 469.43"
      aria-hidden="true"
      className={cn("size-3.5 shrink-0 fill-[#0F0F0F] dark:fill-[#F5F5F5]", className)}
    >
      <path
        d="M165.29 165.29H517.36V400H400V517.36H282.65V634.72H165.29ZM282.65 282.65V400H400V282.65Z"
        fillRule="evenodd"
      />
      <path d="M517.36 400H634.72V634.72H517.36Z" />
    </svg>
  );
}

function useClockTick(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function WorkingTimerLabel({ startedAtMs }: { startedAtMs: number }) {
  const now = useClockTick(1000);
  return <>Working ({formatWorkingDuration(startedAtMs, now)})</>;
}

function RelativeTimeText({ timestampMs }: { timestampMs: number }) {
  const now = useClockTick(30_000);
  return <>{formatCompactRelativeTime(timestampMs, now)}</>;
}

export interface SidebarThreadRowCallbacks {
  onSelect: (thread: ThreadSummary) => void;
  onContextMenu: (thread: ThreadSummary, position: { x: number; y: number }) => void;
  onSettleToggle: (thread: ThreadSummary, settled: boolean) => void;
  onSnooze: (thread: ThreadSummary, untilMs: number | null) => void;
  onAcknowledgeWoke: (thread: ThreadSummary) => void;
  onPinToggle: (thread: ThreadSummary, pinned: boolean) => void;
  onRename: (thread: ThreadSummary, newTitle: string) => void;
}

export function SidebarThreadCardRow({
  thread,
  isActive,
  renaming,
  onStartRename,
  onEndRename,
  callbacks,
}: {
  thread: ThreadSummary;
  isActive: boolean;
  renaming: boolean;
  onStartRename: () => void;
  onEndRename: () => void;
  callbacks: SidebarThreadRowCallbacks;
}) {
  const [snoozeMenuOpen, setSnoozeMenuOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState(thread.title);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const renameCancelledRef = useRef(false);

  const projectName = projectBasename(thread.cwd);
  const isPinned = thread.pinnedAt != null;
  const isWoke = thread.wokeAt != null && thread.status === "idle";
  const snoozePresets = resolveSnoozePresets();

  useEffect(() => {
    if (renaming) {
      setDraftTitle(thread.title);
      renameCancelledRef.current = false;
      requestAnimationFrame(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      });
    }
  }, [renaming, thread.title]);

  const commitRename = () => {
    if (renameCancelledRef.current) return;
    const trimmed = draftTitle.trim();
    onEndRename();
    if (trimmed.length > 0 && trimmed !== thread.title) {
      callbacks.onRename(thread, trimmed);
    }
  };

  return (
    <div data-thread-item className="group/sidebar-row relative">
      <div
        role="button"
        tabIndex={0}
        data-testid={`thread-row-${thread.id}`}
        onClick={() => {
          if (!renaming) callbacks.onSelect(thread);
        }}
        onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
          if (renaming) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            callbacks.onSelect(thread);
          }
        }}
        onContextMenu={(event: ReactMouseEvent<HTMLDivElement>) => {
          event.preventDefault();
          callbacks.onContextMenu(thread, { x: event.clientX, y: event.clientY });
        }}
        className={cn(
          "relative flex h-[4.875rem] w-full cursor-pointer flex-col justify-between rounded-lg border px-2.5 py-2 text-left transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden",
          isActive
            ? "border-sidebar-border/80 bg-sidebar-row-selected font-medium text-sidebar-accent-foreground dark:border-transparent"
            : "border-transparent bg-transparent text-sidebar-foreground/90 any-hover:bg-sidebar-row-hover any-hover:text-sidebar-accent-foreground",
        )}
      >
        {/* Row 1: Project icon + Pin + Project name | Status / Hover actions */}
        <div className="flex h-5 w-full items-center justify-between gap-1.5 text-xs">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sidebar-muted-foreground">
            <ProjectIcon projectName={projectName} className="size-3.5 shrink-0" />
            {isPinned && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <InlineButton
                      aria-label="Unpin thread"
                      className="group/pin-btn relative inline-flex size-3.5 shrink-0 items-center justify-center rounded-xs text-sidebar-muted-foreground transition-colors hover:text-sidebar-foreground"
                      onClick={(event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        callbacks.onPinToggle(thread, false);
                      }}
                    >
                      <PinIcon className="size-3 rotate-45 transition-opacity group-hover/pin-btn:opacity-0" />
                      <PinOffIcon className="absolute size-3 opacity-0 transition-opacity group-hover/pin-btn:opacity-100" />
                    </InlineButton>
                  }
                />
                <TooltipPopup side="top">Unpin thread</TooltipPopup>
              </Tooltip>
            )}
            <MiddleTruncate value={projectName} className="min-w-0 flex-1 font-normal" />
          </div>

          <div className="group/sidebar-status-slot relative flex shrink-0 items-center gap-1">
            {/* Status display (fades out on row hover) */}
            <div
              className={cn(
                "flex items-center gap-1 text-2xs transition-opacity duration-150",
                "group-any-hover/sidebar-row:pointer-events-none group-any-hover/sidebar-row:opacity-0",
                snoozeMenuOpen && "pointer-events-none opacity-0",
              )}
            >
              {thread.status === "running" ? (
                <span className="inline-flex items-center gap-1 text-info">
                  <CircleDashedIcon className="size-3 shrink-0 animate-spin" />
                  <span>
                    <WorkingTimerLabel startedAtMs={thread.updatedAt} />
                  </span>
                </span>
              ) : thread.status === "waiting" ? (
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-300/90">
                  <ShieldQuestionIcon className="size-3 shrink-0" />
                  <span>Approval</span>
                </span>
              ) : thread.status === "error" ? (
                <span className="inline-flex items-center gap-1 text-destructive">
                  <CircleAlertIcon className="size-3 shrink-0" />
                  <span>Failed</span>
                </span>
              ) : isWoke ? (
                <span className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400">
                  <AlarmClockIcon className="size-3 shrink-0" />
                  <span>Woke</span>
                </span>
              ) : thread.unread ? (
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-300/90">
                  <CircleCheckIcon className="size-3 shrink-0" />
                  <span>Done</span>
                </span>
              ) : (
                <span className="font-mono text-sidebar-muted-foreground/80 tabular-nums">
                  <RelativeTimeText timestampMs={thread.updatedAt} />
                </span>
              )}
            </div>

            {/* Hover actions: Dismiss Woke + Snooze Menu + Settle button */}
            <div
              className={cn(
                "pointer-events-none absolute top-1/2 right-0 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity duration-150",
                "group-any-hover/sidebar-row:pointer-events-auto group-any-hover/sidebar-row:opacity-100",
                snoozeMenuOpen && "pointer-events-auto opacity-100",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              {isWoke && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <InlineButton
                        aria-label="Dismiss Woke notification"
                        className="inline-flex size-5 items-center justify-center rounded text-sky-600 transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground dark:text-sky-400"
                        onClick={(event) => {
                          event.stopPropagation();
                          callbacks.onAcknowledgeWoke(thread);
                        }}
                      >
                        <XIcon className="size-3" />
                      </InlineButton>
                    }
                  />
                  <TooltipPopup side="top">Dismiss Woke notification</TooltipPopup>
                </Tooltip>
              )}

              {thread.status !== "running" && thread.status !== "waiting" && (
                <Menu open={snoozeMenuOpen} onOpenChange={setSnoozeMenuOpen}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <MenuTrigger
                          render={
                            <InlineButton
                              aria-label="Snooze thread"
                              className="inline-flex size-5 items-center justify-center rounded text-sidebar-muted-foreground transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <AlarmClockIcon className="size-3" />
                            </InlineButton>
                          }
                        />
                      }
                    />
                    <TooltipPopup side="top">Snooze</TooltipPopup>
                  </Tooltip>
                  <MenuPopup align="end" side="bottom" className="w-56">
                    {snoozePresets.map((preset) => (
                      <MenuItem
                        key={preset.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSnoozeMenuOpen(false);
                          callbacks.onSnooze(thread, preset.untilMs);
                        }}
                      >
                        {preset.label}
                        <MenuShortcut>{preset.detail}</MenuShortcut>
                      </MenuItem>
                    ))}
                  </MenuPopup>
                </Menu>
              )}

              <Tooltip>
                <TooltipTrigger
                  render={
                    <InlineButton
                      aria-label="Settle thread"
                      className="inline-flex h-5 items-center gap-0.5 rounded px-1.5 text-2xs font-medium text-sidebar-muted-foreground transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
                      onClick={(event) => {
                        event.stopPropagation();
                        callbacks.onSettleToggle(thread, true);
                      }}
                    >
                      <CheckIcon className="size-3 shrink-0" />
                      <span>Settle</span>
                    </InlineButton>
                  }
                />
                <TooltipPopup side="top">Move to Settled</TooltipPopup>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Row 2: Thread Title (double-click to rename inline) */}
        <div className="flex min-w-0 items-center">
          {renaming ? (
            <input
              ref={renameInputRef}
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onBlur={commitRename}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitRename();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  renameCancelledRef.current = true;
                  onEndRename();
                }
              }}
              className="h-5 w-full rounded border border-ring bg-background px-1.5 text-sm font-medium text-foreground outline-none"
            />
          ) : (
            <div
              onDoubleClick={(event) => {
                event.stopPropagation();
                onStartRename();
              }}
              title={thread.title}
              className={cn(
                "min-w-0 flex-1 truncate text-sm",
                isActive || thread.unread ? "font-medium text-sidebar-foreground" : "font-medium",
              )}
            >
              {thread.title}
            </div>
          )}
        </div>

        {/* Row 3: Branch / cwd preview + Pi provider badge */}
        <div className="flex h-4 w-full items-center justify-between gap-2 text-2xs text-sidebar-muted-foreground/80">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <GitBranchIcon className="size-3 shrink-0 opacity-75" />
            <span className="truncate">main</span>
          </div>
          <div className="flex shrink-0 items-center gap-1" title="Pi">
            <PiProviderLogo className="size-3.5 opacity-90" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SidebarThreadSlimRow({
  thread,
  shelf,
  isActive,
  renaming,
  onStartRename,
  onEndRename,
  callbacks,
}: {
  thread: ThreadSummary;
  shelf: "settled" | "snoozed";
  isActive: boolean;
  renaming: boolean;
  onStartRename: () => void;
  onEndRename: () => void;
  callbacks: SidebarThreadRowCallbacks;
}) {
  const [draftTitle, setDraftTitle] = useState(thread.title);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const renameCancelledRef = useRef(false);
  const projectName = projectBasename(thread.cwd);

  useEffect(() => {
    if (renaming) {
      setDraftTitle(thread.title);
      renameCancelledRef.current = false;
      requestAnimationFrame(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      });
    }
  }, [renaming, thread.title]);

  const commitRename = () => {
    if (renameCancelledRef.current) return;
    const trimmed = draftTitle.trim();
    onEndRename();
    if (trimmed.length > 0 && trimmed !== thread.title) {
      callbacks.onRename(thread, trimmed);
    }
  };

  return (
    <div data-thread-item className="group/sidebar-row relative">
      <div
        role="button"
        tabIndex={0}
        data-testid={`thread-row-${thread.id}`}
        onClick={() => {
          if (!renaming) callbacks.onSelect(thread);
        }}
        onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
          if (renaming) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            callbacks.onSelect(thread);
          }
        }}
        onContextMenu={(event: ReactMouseEvent<HTMLDivElement>) => {
          event.preventDefault();
          callbacks.onContextMenu(thread, { x: event.clientX, y: event.clientY });
        }}
        className={cn(
          "relative flex h-9 w-full cursor-pointer items-center justify-between gap-1.5 rounded-lg border px-2.5 text-left text-xs transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden",
          isActive
            ? "border-sidebar-border/80 bg-sidebar-row-selected font-medium text-sidebar-accent-foreground dark:border-transparent"
            : shelf === "settled"
              ? "border-transparent bg-transparent text-sidebar-muted-foreground any-hover:bg-sidebar-row-hover any-hover:text-sidebar-foreground"
              : "border-transparent bg-transparent text-sidebar-foreground/90 any-hover:bg-sidebar-row-hover any-hover:text-sidebar-accent-foreground",
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex shrink-0">
                  <ProjectIcon
                    projectName={projectName}
                    className={cn("size-3.5 shrink-0", shelf === "settled" && !isActive && "opacity-75")}
                  />
                </span>
              }
            />
            <TooltipPopup side="top">{projectName}</TooltipPopup>
          </Tooltip>

          {renaming ? (
            <input
              ref={renameInputRef}
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onBlur={commitRename}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitRename();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  renameCancelledRef.current = true;
                  onEndRename();
                }
              }}
              className="h-5 min-w-0 flex-1 rounded border border-ring bg-background px-1.5 text-xs font-medium text-foreground outline-none"
            />
          ) : (
            <span
              onDoubleClick={(event) => {
                event.stopPropagation();
                onStartRename();
              }}
              title={thread.title}
              className="min-w-0 flex-1 truncate"
            >
              {thread.title}
            </span>
          )}
        </div>

        <div className="relative flex shrink-0 items-center">
          {/* Timestamp / Wake label (hidden on hover) */}
          <span className="font-mono text-2xs text-sidebar-muted-foreground/80 tabular-nums transition-opacity duration-150 group-any-hover/sidebar-row:opacity-0">
            {shelf === "snoozed" && thread.snoozedUntil ? (
              formatSnoozeWakeLabel(thread.snoozedUntil)
            ) : (
              <RelativeTimeText timestampMs={thread.settledAt ?? thread.updatedAt} />
            )}
          </span>

          {/* Hover action: Wake or Un-settle */}
          <div
            className="pointer-events-none absolute top-1/2 right-0 flex -translate-y-1/2 items-center opacity-0 transition-opacity duration-150 group-any-hover/sidebar-row:pointer-events-auto group-any-hover/sidebar-row:opacity-100"
            onClick={(event) => event.stopPropagation()}
          >
            {shelf === "snoozed" ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <InlineButton
                      aria-label="Wake thread now"
                      className="inline-flex size-5 items-center justify-center rounded text-sidebar-muted-foreground transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
                      onClick={(event) => {
                        event.stopPropagation();
                        callbacks.onSnooze(thread, null);
                      }}
                    >
                      <AlarmClockOffIcon className="size-3.5" />
                    </InlineButton>
                  }
                />
                <TooltipPopup side="top">Wake thread now</TooltipPopup>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <InlineButton
                      aria-label="Un-settle thread"
                      className="inline-flex size-5 items-center justify-center rounded text-sidebar-muted-foreground transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
                      onClick={(event) => {
                        event.stopPropagation();
                        callbacks.onSettleToggle(thread, false);
                      }}
                    >
                      <Undo2Icon className="size-3.5" />
                    </InlineButton>
                  }
                />
                <TooltipPopup side="top">Un-settle thread</TooltipPopup>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SidebarSearchResultRow({
  thread,
  query,
  isActive,
  isKeyboardSelected,
  onSelect,
  onHover,
}: {
  thread: ThreadSummary;
  query: string;
  isActive: boolean;
  isKeyboardSelected: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  const projectName = projectBasename(thread.cwd);

  return (
    <div
      role="option"
      aria-selected={isKeyboardSelected || isActive}
      onClick={onSelect}
      onMouseEnter={onHover}
      className={cn(
        "flex cursor-pointer flex-col gap-1 rounded-lg border px-2.5 py-2 text-left transition-colors",
        isKeyboardSelected || isActive
          ? "border-sidebar-border/80 bg-sidebar-row-selected text-sidebar-accent-foreground"
          : "border-transparent text-sidebar-foreground/90 hover:bg-sidebar-row-hover",
      )}
    >
      <div className="flex items-center justify-between gap-1.5 text-2xs text-sidebar-muted-foreground">
        <div className="flex min-w-0 items-center gap-1.5">
          <ProjectIcon projectName={projectName} className="size-3.5 shrink-0" />
          <span className="truncate">{projectName}</span>
        </div>
        <span className="font-mono tabular-nums">
          <RelativeTimeText timestampMs={thread.updatedAt} />
        </span>
      </div>
      <div className="truncate text-xs font-medium text-sidebar-foreground">
        <HighlightedText text={thread.title} query={query} />
      </div>
      {thread.latestPreview && (
        <div className="truncate text-2xs text-sidebar-muted-foreground">
          <HighlightedText text={thread.latestPreview} query={query} />
        </div>
      )}
    </div>
  );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-xs bg-amber-500/25 px-0.5 text-inherit">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

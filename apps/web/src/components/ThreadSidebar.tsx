import {
  AlarmClockIcon,
  AlarmClockOffIcon,
  CheckIcon,
  CopyIcon,
  FolderIcon,
  ListFilterIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { ThreadId, ThreadSummary } from "@pi-web/protocol";
import { transport, useAppStore } from "@pi-web/client-runtime";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { cn } from "~/lib/utils";
import { projectBasename } from "../projectIdentity";
import { resolveSnoozePresets } from "./Sidebar.snooze";
import { SettingsSidebarNav } from "./sidebar/SettingsSidebarNav";
import { SidebarChromeFooter, SidebarChromeHeader } from "./sidebar/SidebarChrome";
import { SidebarThreadHeader } from "./sidebar/SidebarThreadHeader";
import {
  SidebarThreadRow,
  type SidebarThreadRowCallbacks,
} from "./sidebar/SidebarThreadRow";
import { CollapsibleSectionHeader } from "./ui/collapsible-section-header";
import {
  SidebarContent,
  SidebarGroup,
  useSidebar,
} from "./ui/sidebar";

const SETTLED_TAIL_EXPANDED_STORAGE_KEY = "t3code:sidebar:settled-expanded";
const SNOOZED_TAIL_EXPANDED_STORAGE_KEY = "t3code:sidebar:snoozed-expanded";
const SETTLED_TAIL_INITIAL_COUNT = 10;
const SETTLED_TAIL_PAGE_COUNT = 25;

function resolveAdjacentThreadId(
  orderedThreadIds: readonly ThreadId[],
  targetThreadId: ThreadId,
): ThreadId | null {
  const index = orderedThreadIds.indexOf(targetThreadId);
  if (index === -1) return orderedThreadIds[0] ?? null;
  return orderedThreadIds[index + 1] ?? orderedThreadIds[index - 1] ?? null;
}

interface ContextMenuState {
  thread: ThreadSummary;
  x: number;
  y: number;
}

export function ThreadSidebar() {
  const { isMobile, setOpenMobile } = useSidebar();
  const threads = useAppStore((state) => state.threads);
  const activeThreadId = useAppStore((state) => state.activeThreadId);
  const setActiveThread = useAppStore((state) => state.setActiveThread);
  const activeUtilityPage = useAppStore((state) => state.activeUtilityPage);
  const selectedProjectCwd = useAppStore((state) => state.selectedProjectCwd);
  const setSelectedProjectCwd = useAppStore((state) => state.setSelectedProjectCwd);
  const patchThreadSummary = useAppStore((state) => state.patchThreadSummary);
  const setUndoNotice = useAppStore((state) => state.setUndoNotice);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSearchIndex, setSelectedSearchIndex] = useState<number | null>(null);
  const [renamingThreadId, setRenamingThreadId] = useState<ThreadId | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const [settledExpanded, setSettledExpanded] = useLocalStorage<boolean>(
    SETTLED_TAIL_EXPANDED_STORAGE_KEY,
    false,
  );
  const [snoozedExpanded, setSnoozedExpanded] = useLocalStorage<boolean>(
    SNOOZED_TAIL_EXPANDED_STORAGE_KEY,
    true,
  );
  const [settledVisibleCount, setSettledVisibleCount] = useState(SETTLED_TAIL_INITIAL_COUNT);

  // Automatic wake watcher for snoozed threads
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      for (const thread of useAppStore.getState().threads) {
        if (typeof thread.snoozedUntil === "number" && thread.snoozedUntil <= now) {
          useAppStore
            .getState()
            .patchThreadSummary(thread.id, { snoozedUntil: null, wokeAt: thread.snoozedUntil });
          transport.dispatch({ type: "thread.snooze", threadId: thread.id, snoozedUntil: null });
        }
      }
    }, 10_000);
    return () => window.clearInterval(id);
  }, []);

  // Close context menu on Escape or outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };
    const handlePointerDown = () => setContextMenu(null);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [contextMenu]);

  // Filter by selected project
  const projectScopedThreads = useMemo(() => {
    if (!selectedProjectCwd) return threads;
    return threads.filter((thread) => thread.cwd === selectedProjectCwd);
  }, [threads, selectedProjectCwd]);

  // Partition threads into Pinned, Active, Snoozed, Settled
  const { pinnedThreads, activeThreads, snoozedThreads, settledThreads } = useMemo(() => {
    const now = Date.now();
    const pinned: ThreadSummary[] = [];
    const active: ThreadSummary[] = [];
    const snoozed: ThreadSummary[] = [];
    const settled: ThreadSummary[] = [];

    for (const thread of projectScopedThreads) {
      if (typeof thread.snoozedUntil === "number" && thread.snoozedUntil > now) {
        snoozed.push(thread);
      } else if (thread.settledAt != null) {
        settled.push(thread);
      } else if (thread.pinnedAt != null) {
        pinned.push(thread);
      } else {
        active.push(thread);
      }
    }

    pinned.sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0));
    active.sort((a, b) => b.updatedAt - a.updatedAt);
    snoozed.sort((a, b) => (a.snoozedUntil ?? 0) - (b.snoozedUntil ?? 0));
    settled.sort((a, b) => (b.settledAt ?? b.updatedAt) - (a.settledAt ?? a.updatedAt));

    return {
      pinnedThreads: pinned,
      activeThreads: active,
      snoozedThreads: snoozed,
      settledThreads: settled,
    };
  }, [projectScopedThreads]);

  const inboxThreadIds = useMemo(
    () => [...pinnedThreads.map((t) => t.id), ...activeThreads.map((t) => t.id)],
    [pinnedThreads, activeThreads],
  );

  const hasSearchQuery = searchQuery.trim().length > 0;
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return projectScopedThreads.filter(
      (thread) =>
        thread.title.toLowerCase().includes(q) ||
        (thread.latestPreview ?? "").toLowerCase().includes(q) ||
        projectBasename(thread.cwd).toLowerCase().includes(q),
    );
  }, [projectScopedThreads, searchQuery]);

  const handleSelectThread = useCallback(
    (thread: ThreadSummary) => {
      setActiveThread(thread.id);
      if (thread.wokeAt != null) {
        patchThreadSummary(thread.id, { wokeAt: null });
        transport.dispatch({ type: "thread.acknowledge_woke", threadId: thread.id });
      }
      if (thread.unread) {
        patchThreadSummary(thread.id, { unread: false });
        transport.dispatch({ type: "thread.mark_read", threadId: thread.id });
      }
      if (isMobile) setOpenMobile(false);
    },
    [isMobile, patchThreadSummary, setActiveThread, setOpenMobile],
  );

  const handleSettleToggle = useCallback(
    (thread: ThreadSummary, settled: boolean) => {
      patchThreadSummary(thread.id, {
        settledAt: settled ? Date.now() : null,
        ...(settled ? { snoozedUntil: null, wokeAt: null } : {}),
      });
      transport.dispatch({ type: "thread.settle", threadId: thread.id, settled });

      if (settled) {
        setUndoNotice({ kind: "settled", threadId: thread.id, title: thread.title });
        if (activeThreadId === thread.id) {
          const nextId = resolveAdjacentThreadId(inboxThreadIds, thread.id);
          setActiveThread(nextId);
        }
      } else {
        setUndoNotice(null);
      }
    },
    [activeThreadId, inboxThreadIds, patchThreadSummary, setActiveThread, setUndoNotice],
  );

  const handleSnooze = useCallback(
    (thread: ThreadSummary, untilMs: number | null) => {
      patchThreadSummary(thread.id, {
        snoozedUntil: untilMs,
        ...(untilMs !== null ? { settledAt: null, wokeAt: null } : { wokeAt: null }),
      });
      transport.dispatch({ type: "thread.snooze", threadId: thread.id, snoozedUntil: untilMs });

      if (untilMs !== null) {
        setUndoNotice({ kind: "snoozed", threadId: thread.id, title: thread.title });
        if (activeThreadId === thread.id) {
          const nextId = resolveAdjacentThreadId(inboxThreadIds, thread.id);
          setActiveThread(nextId);
        }
      } else {
        setUndoNotice(null);
      }
    },
    [activeThreadId, inboxThreadIds, patchThreadSummary, setActiveThread, setUndoNotice],
  );

  const handleAcknowledgeWoke = useCallback(
    (thread: ThreadSummary) => {
      patchThreadSummary(thread.id, { wokeAt: null });
      transport.dispatch({ type: "thread.acknowledge_woke", threadId: thread.id });
    },
    [patchThreadSummary],
  );

  const handlePinToggle = useCallback(
    (thread: ThreadSummary, pinned: boolean) => {
      patchThreadSummary(thread.id, { pinnedAt: pinned ? Date.now() : null });
      transport.dispatch({ type: "thread.pin", threadId: thread.id, pinned });
    },
    [patchThreadSummary],
  );

  const handleRename = useCallback(
    (thread: ThreadSummary, newTitle: string) => {
      patchThreadSummary(thread.id, { title: newTitle });
      transport.dispatch({ type: "thread.rename", threadId: thread.id, title: newTitle });
    },
    [patchThreadSummary],
  );

  const handleDelete = useCallback(
    (thread: ThreadSummary) => {
      if (activeThreadId === thread.id) {
        const nextId = resolveAdjacentThreadId(inboxThreadIds, thread.id);
        setActiveThread(nextId);
      }
      transport.dispatch({ type: "thread.delete", threadId: thread.id });
    },
    [activeThreadId, inboxThreadIds, setActiveThread],
  );

  const rowCallbacks: SidebarThreadRowCallbacks = useMemo(
    () => ({
      onSelect: handleSelectThread,
      onContextMenu: (thread, pos) => setContextMenu({ thread, x: pos.x, y: pos.y }),
      onSettleToggle: handleSettleToggle,
      onSnooze: handleSnooze,
      onAcknowledgeWoke: handleAcknowledgeWoke,
      onPinToggle: handlePinToggle,
      onRename: handleRename,
    }),
    [
      handleAcknowledgeWoke,
      handlePinToggle,
      handleRename,
      handleSelectThread,
      handleSettleToggle,
      handleSnooze,
    ],
  );

  const handleSearchInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!hasSearchQuery) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setSearchQuery("");
      setSelectedSearchIndex(null);
      return;
    }
    if (searchResults.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedSearchIndex((prev) =>
        prev === null ? 0 : Math.min(prev + 1, searchResults.length - 1),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedSearchIndex((prev) => (prev === null ? 0 : Math.max(prev - 1, 0)));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const target = searchResults[selectedSearchIndex ?? 0];
      if (target) {
        handleSelectThread(target);
      }
    }
  };

  // Settled shelf visibility: when collapsed, still show the currently open settled thread (t3code routeThreadOnly behavior)
  const visibleSettledThreads = useMemo(() => {
    if (settledExpanded) {
      return settledThreads.slice(0, settledVisibleCount);
    }
    return settledThreads.filter((thread) => thread.id === activeThreadId);
  }, [activeThreadId, settledExpanded, settledThreads, settledVisibleCount]);

  const hiddenSettledCount = Math.max(0, settledThreads.length - settledVisibleCount);

  if (activeUtilityPage === "settings") {
    return (
      <>
        <SidebarChromeHeader />
        <SettingsSidebarNav />
        <SidebarChromeFooter />
      </>
    );
  }

  return (
    <>
      <SidebarChromeHeader />
      <SidebarContent
        className="min-h-full"
        fixedHeader={
          <SidebarGroup className="z-[1]">
            <SidebarThreadHeader
              searchInputRef={searchInputRef}
              searchQuery={searchQuery}
              hasSearchQuery={hasSearchQuery}
              onSearchQueryChange={(value) => {
                setSearchQuery(value);
                setSelectedSearchIndex(value.trim().length > 0 ? 0 : null);
              }}
              onClearSearch={() => {
                setSearchQuery("");
                setSelectedSearchIndex(null);
                searchInputRef.current?.focus();
              }}
              onSearchInputKeyDown={handleSearchInputKeyDown}
            />
          </SidebarGroup>
        }
      >
        <SidebarGroup className="flex-1" role="presentation">
          {hasSearchQuery ? (
            searchResults.length === 0 ? (
              <p
                role="status"
                className="px-2 py-6 text-center text-xs text-sidebar-muted-foreground"
              >
                No threads found
              </p>
            ) : (
              <ul
                id="sidebar-thread-search-results"
                role="listbox"
                aria-label="Thread search results"
                className="flex flex-col gap-px"
              >
                {searchResults.map((thread, index) => (
                  <SidebarThreadRow
                    key={thread.id}
                    thread={thread}
                    variant="slim"
                    variantAction={
                      thread.settledAt != null
                        ? "unsettle"
                        : typeof thread.snoozedUntil === "number" &&
                            thread.snoozedUntil > Date.now()
                          ? "unsnooze"
                          : "settle"
                    }
                    isActive={thread.id === activeThreadId || selectedSearchIndex === index}
                    callbacks={rowCallbacks}
                  />
                ))}
              </ul>
            )
          ) : (
            <ul role="presentation" className="relative flex flex-1 flex-col gap-px">
              {/* Pinned threads */}
              {pinnedThreads.map((thread) => (
                <SidebarThreadRow
                  key={thread.id}
                  thread={thread}
                  variant="card"
                  variantAction="settle"
                  isActive={thread.id === activeThreadId}
                  isRenaming={renamingThreadId === thread.id}
                  onCancelRename={() => setRenamingThreadId(null)}
                  callbacks={rowCallbacks}
                />
              ))}

              {/* Active threads */}
              {activeThreads.map((thread) => (
                <SidebarThreadRow
                  key={thread.id}
                  thread={thread}
                  variant="card"
                  variantAction="settle"
                  isActive={thread.id === activeThreadId}
                  isRenaming={renamingThreadId === thread.id}
                  onCancelRename={() => setRenamingThreadId(null)}
                  callbacks={rowCallbacks}
                />
              ))}

              {pinnedThreads.length === 0 &&
              activeThreads.length === 0 &&
              snoozedThreads.length === 0 &&
              settledThreads.length === 0 ? (
                <li className="list-none px-2 py-6 text-center text-xs text-muted-foreground/60">
                  No threads yet
                </li>
              ) : null}

              {/* Snoozed shelf */}
              {snoozedThreads.length > 0 ? (
                <>
                  <li className="mx-0.5 mt-auto h-8 list-none">
                    <CollapsibleSectionHeader
                      expanded={snoozedExpanded}
                      onClick={() => setSnoozedExpanded((prev) => !prev)}
                    >
                      Snoozed{!snoozedExpanded ? ` (${snoozedThreads.length})` : null}
                    </CollapsibleSectionHeader>
                  </li>
                  {(snoozedExpanded
                    ? snoozedThreads
                    : snoozedThreads.filter((t) => t.id === activeThreadId)
                  ).map((thread) => (
                    <SidebarThreadRow
                      key={thread.id}
                      thread={thread}
                      variant="slim"
                      variantAction="unsnooze"
                      isActive={thread.id === activeThreadId}
                      isRenaming={renamingThreadId === thread.id}
                      onCancelRename={() => setRenamingThreadId(null)}
                      callbacks={rowCallbacks}
                    />
                  ))}
                </>
              ) : null}

              {/* Settled shelf (anchored to bottom via mt-auto when snoozed is empty) */}
              {settledThreads.length > 0 ? (
                <>
                  <li
                    className={cn(
                      "mx-0.5 h-8 list-none",
                      snoozedThreads.length === 0 && "mt-auto",
                    )}
                  >
                    <CollapsibleSectionHeader
                      expanded={settledExpanded}
                      onClick={() => {
                        setSettledExpanded((prev) => {
                          const next = !prev;
                          if (!next) setSettledVisibleCount(SETTLED_TAIL_INITIAL_COUNT);
                          return next;
                        });
                      }}
                    >
                      Settled{!settledExpanded ? ` (${settledThreads.length})` : null}
                    </CollapsibleSectionHeader>
                  </li>
                  {visibleSettledThreads.map((thread) => (
                    <SidebarThreadRow
                      key={thread.id}
                      thread={thread}
                      variant="slim"
                      variantAction="unsettle"
                      isActive={thread.id === activeThreadId}
                      isRenaming={renamingThreadId === thread.id}
                      onCancelRename={() => setRenamingThreadId(null)}
                      callbacks={rowCallbacks}
                    />
                  ))}
                  {settledExpanded && hiddenSettledCount > 0 ? (
                    <li className="list-none">
                      <button
                        type="button"
                        onClick={() =>
                          setSettledVisibleCount((count) => count + SETTLED_TAIL_PAGE_COUNT)
                        }
                        className="flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-sidebar-muted-foreground/55 hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
                      >
                        <PlusIcon aria-hidden className="size-4 shrink-0" />
                        Show {Math.min(hiddenSettledCount, SETTLED_TAIL_PAGE_COUNT)} more
                      </button>
                    </li>
                  ) : null}
                </>
              ) : null}
            </ul>
          )}
        </SidebarGroup>
      </SidebarContent>

      <SidebarChromeFooter />

      {contextMenu && (
        <ThreadRowContextMenu
          state={contextMenu}
          selectedProjectCwd={selectedProjectCwd}
          onClose={() => setContextMenu(null)}
          onPinToggle={(pinned) => {
            handlePinToggle(contextMenu.thread, pinned);
            setContextMenu(null);
          }}
          onSettleToggle={(settled) => {
            handleSettleToggle(contextMenu.thread, settled);
            setContextMenu(null);
          }}
          onSnooze={(untilMs) => {
            handleSnooze(contextMenu.thread, untilMs);
            setContextMenu(null);
          }}
          onRename={() => {
            const id = contextMenu.thread.id;
            setContextMenu(null);
            setRenamingThreadId(id);
          }}
          onFilterByProject={() => {
            const targetCwd = contextMenu.thread.cwd;
            setSelectedProjectCwd(selectedProjectCwd === targetCwd ? null : targetCwd);
            setContextMenu(null);
          }}
          onCopyCwd={() => {
            void navigator.clipboard?.writeText(contextMenu.thread.cwd);
            setContextMenu(null);
          }}
          onCopyThreadId={() => {
            void navigator.clipboard?.writeText(contextMenu.thread.id);
            setContextMenu(null);
          }}
          onDelete={() => {
            handleDelete(contextMenu.thread);
            setContextMenu(null);
          }}
        />
      )}
    </>
  );
}

function ThreadRowContextMenu({
  state,
  selectedProjectCwd,
  onClose,
  onPinToggle,
  onSettleToggle,
  onSnooze,
  onRename,
  onFilterByProject,
  onCopyCwd,
  onCopyThreadId,
  onDelete,
}: {
  state: ContextMenuState;
  selectedProjectCwd: string | null;
  onClose: () => void;
  onPinToggle: (pinned: boolean) => void;
  onSettleToggle: (settled: boolean) => void;
  onSnooze: (untilMs: number | null) => void;
  onRename: () => void;
  onFilterByProject: () => void;
  onCopyCwd: () => void;
  onCopyThreadId: () => void;
  onDelete: () => void;
}) {
  const { thread, x, y } = state;
  const isPinned = thread.pinnedAt != null;
  const isSettled = thread.settledAt != null;
  const isSnoozed = typeof thread.snoozedUntil === "number" && thread.snoozedUntil > Date.now();
  const projectName = projectBasename(thread.cwd);
  const presets = resolveSnoozePresets();

  const clampedLeft = Math.min(x, window.innerWidth - 224);
  const clampedTop = Math.min(y, window.innerHeight - 320);

  return (
    <div
      role="menu"
      style={{ left: clampedLeft, top: clampedTop }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="fixed z-50 w-56 rounded-lg border bg-popover p-1 text-xs text-popover-foreground shadow-lg"
    >
      {!isSettled && !isSnoozed && (
        <ContextMenuButton
          icon={isPinned ? <PinOffIcon className="size-3.5" /> : <PinIcon className="size-3.5" />}
          label={isPinned ? "Unpin thread" : "Pin thread"}
          onClick={() => onPinToggle(!isPinned)}
        />
      )}

      <ContextMenuButton
        icon={isSettled ? <Undo2Icon className="size-3.5" /> : <CheckIcon className="size-3.5" />}
        label={isSettled ? "Un-settle thread" : "Settle thread"}
        onClick={() => onSettleToggle(!isSettled)}
      />

      {isSnoozed ? (
        <ContextMenuButton
          icon={<AlarmClockOffIcon className="size-3.5" />}
          label="Wake thread now"
          onClick={() => onSnooze(null)}
        />
      ) : (
        presets[0] && (
          <ContextMenuButton
            icon={<AlarmClockIcon className="size-3.5" />}
            label={`Snooze (${presets[0].label})`}
            shortcut={presets[0].detail}
            onClick={() => onSnooze(presets[0]!.untilMs)}
          />
        )
      )}

      <div className="my-1 h-px bg-border" />

      <ContextMenuButton
        icon={<PencilIcon className="size-3.5" />}
        label="Rename thread"
        onClick={onRename}
      />

      <ContextMenuButton
        icon={<ListFilterIcon className="size-3.5" />}
        label={
          selectedProjectCwd === thread.cwd ? "Show all projects" : `Filter by ${projectName}`
        }
        onClick={onFilterByProject}
      />

      <div className="my-1 h-px bg-border" />

      <ContextMenuButton
        icon={<FolderIcon className="size-3.5" />}
        label="Copy Working Directory"
        onClick={onCopyCwd}
      />
      <ContextMenuButton
        icon={<CopyIcon className="size-3.5" />}
        label="Copy Thread ID"
        onClick={onCopyThreadId}
      />

      <div className="my-1 h-px bg-border" />

      <ContextMenuButton
        icon={<Trash2Icon className="size-3.5" />}
        label="Delete thread"
        destructive
        onClick={onDelete}
      />
    </div>
  );
}

function ContextMenuButton({
  icon,
  label,
  shortcut,
  destructive,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={
        destructive
          ? "flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10"
          : "flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-popover-foreground hover:bg-accent hover:text-accent-foreground"
      }
    >
      <span className="shrink-0 opacity-80">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut && (
        <span className="shrink-0 font-mono text-2xs text-muted-foreground">{shortcut}</span>
      )}
    </button>
  );
}

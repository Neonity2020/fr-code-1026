/**
 * 聊天视图，布局对齐 t3code ChatView 的两种状态：
 * - hero 态（空线程）：composer 垂直居中，标题挂在 composer 正上方（absolute bottom-full）
 * - 普通态：时间线滚动 + 左侧 TimelineMinimap + 右上角 ThreadFindBar (⌘F) + composer 吸底
 * - 顶栏：支持双击线程标题内联重命名 + 线程动作下拉菜单（置顶 / 结项 / 延后 / 重命名 / 复制 / 删除）
 */
import {
  AlarmClockIcon,
  AlarmClockOffIcon,
  ArrowDownIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  FolderIcon,
  PencilIcon,
  PanelBottomIcon,
  PanelRightIcon,
  PinIcon,
  PinOffIcon,
  SearchIcon,
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
import type { ThreadId, ThreadSummary, TurnItem } from "@pi-web/protocol";
import { transport, useAppStore } from "@pi-web/client-runtime";
import { useI18n } from "~/i18n";
import { observeResize } from "~/lib/observeResize";
import { cn, isMacPlatform } from "~/lib/utils";
import { ProjectIcon } from "../ProjectMonogram";
import { resolveSnoozePresets } from "../Sidebar.snooze";
import { Button } from "../ui/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { useSidebarVisibility } from "../ui/sidebar";
import { subscribeChatPanelActions } from "./chatPanelBus";
import { Composer } from "./Composer";
import { DraftHeroProjectHeading } from "./DraftHeroProjectHeading";
import { ScriptOutputDrawer } from "./ScriptOutputDrawer";
import { TerminalDrawer } from "./TerminalDrawer";
import { ThreadDetailsPanel } from "./ThreadDetailsPanel";
import { ThreadFindBar } from "./ThreadFindBar";
import { clampThreadFindIndex, stepThreadFindIndex } from "./threadFind";
import { useThreadFindHighlights } from "./threadFindHighlights";
import { canShowInlineThreadPanel } from "./threadPanelLayout";
import { groupTimelineItems } from "./timelineGrouping";
import { TimelineMinimap } from "./TimelineMinimap.tsx";
import { deriveTimelineMinimapItems, type TimelineMinimapItem } from "./timelineMinimap";
import { ReasoningGroupRow, TurnItemRow, WorkGroupRow } from "./TurnItemRows";

export function ChatView({ threadId }: { threadId: ThreadId }) {
  const isSidebarVisible = useSidebarVisibility();
  const threadState = useAppStore((state) => state.byThread[threadId]);
  const threads = useAppStore((state) => state.threads);
  const patchThreadSummary = useAppStore((state) => state.patchThreadSummary);
  const setActiveThread = useAppStore((state) => state.setActiveThread);
  const summary = threads.find((thread) => thread.id === threadId);
  const items = threadState?.items ?? [];
  const projectName = summary ? basename(summary.cwd) : "…";
  const isHeroState = items.length === 0;
  const { tr } = useI18n();

  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [timelineContainer, setTimelineContainer] = useState<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [inlinePanelOpen, setInlinePanelOpen] = useState(true);
  const [changesOpen, setChangesOpen] = useState(false);
  const [outputOpen, setOutputOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [outputRevision, setOutputRevision] = useState(0);

  // ⌘F 对话内查找状态
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findMatchCount, setFindMatchCount] = useState(0);
  const [findActiveIndex, setFindActiveIndex] = useState(0);
  const [findFocusRequestId, setFindFocusRequestId] = useState(0);

  // 顶栏内联重命名状态
  const [isRenamingTitle, setIsRenamingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setOutputOpen(false);
    setChangesOpen(false);
    setTerminalOpen(false);
    setFindOpen(false);
    setFindQuery("");
    setFindMatchCount(0);
    setFindActiveIndex(0);
    setIsRenamingTitle(false);
  }, [threadId]);

  const openFindBar = useCallback(() => {
    setFindOpen(true);
    setFindFocusRequestId((id) => id + 1);
  }, []);

  // 命令面板可以要求打开当前线程的终端 / 脚本输出 / 查找栏。
  useEffect(
    () =>
      subscribeChatPanelActions((action) => {
        if (action === "open-terminal") {
          setOutputOpen(false);
          setChangesOpen(false);
          setTerminalOpen(true);
        } else if (action === "open-script-output") {
          setTerminalOpen(false);
          setOutputOpen(true);
        } else if (action === "open-find") {
          openFindBar();
        }
      }),
    [openFindBar],
  );

  // ⌘F / Ctrl+F 唤起对话内查找
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const mod = isMacPlatform(navigator.platform) ? event.metaKey : event.ctrlKey;
      if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        event.stopPropagation();
        openFindBar();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openFindBar]);

  useThreadFindHighlights({
    container: timelineContainer,
    open: findOpen,
    query: findQuery,
    activeIndex: findActiveIndex,
    onMatchCountChange: (count) => {
      setFindMatchCount(count);
      setFindActiveIndex((prev) => clampThreadFindIndex(prev, count));
    },
  });

  const showScriptOutput = () => {
    setTerminalOpen(false);
    setOutputOpen(true);
    setOutputRevision((value) => value + 1);
  };

  const showChanges = useCallback((open: boolean) => {
    setChangesOpen(open);
    if (open) setTerminalOpen(false);
  }, []);

  const inlinePanel = canShowInlineThreadPanel(containerSize.width, containerSize.height);
  useEffect(() => {
    if (!container) return;
    setContainerSize({ width: container.clientWidth, height: container.clientHeight });
    return observeResize(container, ([entry]) => {
      if (entry) {
        setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
  }, [container]);

  const startHeaderRename = () => {
    if (!summary) return;
    setDraftTitle(summary.title);
    setIsRenamingTitle(true);
    requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  };

  const commitHeaderRename = () => {
    if (!summary) {
      setIsRenamingTitle(false);
      return;
    }
    const next = draftTitle.trim();
    setIsRenamingTitle(false);
    if (next.length === 0 || next === summary.title) return;
    patchThreadSummary(threadId, { title: next });
    transport.dispatch({ type: "thread.rename", threadId, title: next });
  };

  return (
    <div ref={setContainer} className="relative flex h-full min-w-0 flex-1 flex-col">
      <header
        className={cn(
          "flex h-[var(--workspace-topbar-height)] shrink-0 items-center gap-1.5 border-b border-border/50 px-4 transition-[padding] duration-150",
          !isSidebarVisible &&
            "pl-[calc(var(--workspace-controls-left)+var(--workspace-titlebar-control-size)+0.75rem)]",
        )}
      >
        <ProjectIcon projectName={projectName} className="size-3.5 shrink-0" />
        <span className="text-muted-foreground text-xs">{projectName}</span>
        <span className="text-muted-foreground text-xs">/</span>

        {isRenamingTitle ? (
          <input
            ref={renameInputRef}
            type="text"
            aria-label={tr("线程标题", "Thread title")}
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.currentTarget.value)}
            onBlur={commitHeaderRename}
            onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitHeaderRename();
              } else if (event.key === "Escape") {
                event.preventDefault();
                setIsRenamingTitle(false);
              }
            }}
            className="h-6 min-w-36 max-w-80 rounded border border-ring bg-background px-1.5 text-xs font-medium text-foreground outline-none"
          />
        ) : (
          <div className="flex min-w-0 items-center gap-0.5">
            <span
              onDoubleClick={startHeaderRename}
              title={tr("双击重命名线程", "Double-click to rename thread")}
              className="cursor-text truncate rounded px-1 py-0.5 text-xs font-medium hover:bg-accent/50"
            >
              {summary?.title ?? tr("新线程", "New thread")}
            </span>
            {summary ? (
              <HeaderThreadActionsMenu
                summary={summary}
                onStartRename={startHeaderRename}
                onDeleteThread={() => {
                  const remaining = threads.filter((t) => t.id !== summary.id);
                  setActiveThread(remaining[0]?.id ?? null);
                  transport.dispatch({ type: "thread.delete", threadId: summary.id });
                }}
              />
            ) : null}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          {!isHeroState ? (
            <Button
              variant="ghost-muted"
              size="icon-xs"
              aria-label={tr("在对话中查找", "Find in thread")}
              aria-expanded={findOpen}
              onClick={() => {
                if (findOpen) setFindOpen(false);
                else openFindBar();
              }}
            >
              <SearchIcon />
            </Button>
          ) : null}
          {summary && (
            <ThreadDetailsPanel
              threadId={threadId}
              cwd={summary.cwd}
              running={summary.status === "running"}
              inline={inlinePanel}
              inlineOpen={inlinePanelOpen && !changesOpen && !terminalOpen}
              onInlineOpenChange={(open) => { setInlinePanelOpen(open); if (open) { setChangesOpen(false); setTerminalOpen(false); } }}
              onShowScriptOutput={showScriptOutput}
              onShowTerminal={() => { setOutputOpen(false); setChangesOpen(false); setTerminalOpen(true); }}
              showFiles={changesOpen}
              onShowFilesChange={showChanges}
            />
          )}
          <Button
            variant="ghost-muted"
            size="icon-xs"
            aria-label={tr("切换终端", "Toggle terminal")}
            title={tr("打开终端", "Open terminal")}
            aria-expanded={terminalOpen}
            aria-pressed={terminalOpen}
            className={terminalOpen ? "bg-accent" : undefined}
            onClick={() => {
              setOutputOpen(false);
              setChangesOpen(false);
              setTerminalOpen(!terminalOpen);
            }}
          >
            <PanelBottomIcon />
          </Button>
          <Button variant="ghost-muted" size="icon-xs" disabled={!summary} aria-label={tr("切换右侧面板", "Toggle right panel")} title={tr("切换右侧面板", "Toggle right panel")} aria-pressed={changesOpen} className={changesOpen ? "bg-accent" : undefined} onClick={() => showChanges(!changesOpen)}><PanelRightIcon /></Button>
        </div>
      </header>

      <ThreadFindBar
        open={findOpen && !isHeroState}
        query={findQuery}
        matchCount={findMatchCount}
        activeIndex={findActiveIndex}
        focusRequestId={findFocusRequestId}
        onQueryChange={(next) => {
          setFindQuery(next);
          setFindActiveIndex(0);
        }}
        onNext={() =>
          setFindActiveIndex((idx) => stepThreadFindIndex(idx, findMatchCount, 1))
        }
        onPrevious={() =>
          setFindActiveIndex((idx) => stepThreadFindIndex(idx, findMatchCount, -1))
        }
        onClose={() => setFindOpen(false)}
      />

      <div
        className="flex min-h-0 flex-1 flex-col"
        style={
          (changesOpen || terminalOpen) && containerSize.width >= 1200
            ? { paddingRight: "42rem" }
            : inlinePanel && inlinePanelOpen && !changesOpen && !terminalOpen
            ? {
                paddingRight:
                  "min(324px, max(0px, calc(var(--chat-content-max-width) + 648px - 100%)))",
              }
            : undefined
        }
      >
        {isHeroState ? (
          <HeroState
            threadId={threadId}
            projectName={projectName}
            running={summary?.status === "running"}
          />
        ) : (
          <>
            <MessageTimeline
              items={items}
              running={summary?.status === "running"}
              onContainerRef={setTimelineContainer}
            />
            <div className="shrink-0 px-4 pb-4">
              <Composer key={threadId} threadId={threadId} running={summary?.status === "running"} />
            </div>
          </>
        )}
      </div>
      {outputOpen && (
        <ScriptOutputDrawer
          key={threadId}
          threadId={threadId}
          revision={outputRevision}
          onClose={() => setOutputOpen(false)}
        />
      )}
      {terminalOpen && (
        <TerminalDrawer
          key={threadId}
          threadId={threadId}
          onClose={() => setTerminalOpen(false)}
          onShowChanges={() => showChanges(true)}
        />
      )}
    </div>
  );
}

function HeaderThreadActionsMenu({
  summary,
  onStartRename,
  onDeleteThread,
}: {
  summary: ThreadSummary;
  onStartRename: () => void;
  onDeleteThread: () => void;
}) {
  const patchThreadSummary = useAppStore((state) => state.patchThreadSummary);
  const { tr } = useI18n();
  const isPinned = summary.pinnedAt != null;
  const isSettled = summary.settledAt != null;
  const isSnoozed =
    typeof summary.snoozedUntil === "number" && summary.snoozedUntil > Date.now();
  const presets = resolveSnoozePresets();

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            variant="ghost-muted"
            size="icon-micro"
            aria-label={tr("线程操作菜单", "Thread actions")}
          />
        }
      >
        <ChevronDownIcon className="size-3.5" />
      </MenuTrigger>
      <MenuPopup align="start" className="w-52">
        {!isSettled && !isSnoozed ? (
          <MenuItem
            onClick={() => {
              const next = !isPinned;
              patchThreadSummary(summary.id, { pinnedAt: next ? Date.now() : null });
              transport.dispatch({ type: "thread.pin", threadId: summary.id, pinned: next });
            }}
          >
            {isPinned ? <PinOffIcon className="size-4" /> : <PinIcon className="size-4" />}
            <span>{isPinned ? tr("取消置顶", "Unpin thread") : tr("置顶线程", "Pin thread")}</span>
          </MenuItem>
        ) : null}

        <MenuItem
          onClick={() => {
            const next = !isSettled;
            patchThreadSummary(summary.id, {
              settledAt: next ? Date.now() : null,
              ...(next ? { snoozedUntil: null, wokeAt: null } : {}),
            });
            transport.dispatch({ type: "thread.settle", threadId: summary.id, settled: next });
          }}
        >
          {isSettled ? <Undo2Icon className="size-4" /> : <CheckIcon className="size-4" />}
          <span>
            {isSettled ? tr("恢复已结项线程", "Un-settle thread") : tr("结项线程", "Settle thread")}
          </span>
        </MenuItem>

        {isSnoozed ? (
          <MenuItem
            onClick={() => {
              patchThreadSummary(summary.id, { snoozedUntil: null, wokeAt: null });
              transport.dispatch({
                type: "thread.snooze",
                threadId: summary.id,
                snoozedUntil: null,
              });
            }}
          >
            <AlarmClockOffIcon className="size-4" />
            <span>{tr("立即唤醒", "Wake thread now")}</span>
          </MenuItem>
        ) : presets[0] ? (
          <MenuItem
            onClick={() => {
              patchThreadSummary(summary.id, {
                snoozedUntil: presets[0]!.untilMs,
                settledAt: null,
                wokeAt: null,
              });
              transport.dispatch({
                type: "thread.snooze",
                threadId: summary.id,
                snoozedUntil: presets[0]!.untilMs,
              });
            }}
          >
            <AlarmClockIcon className="size-4" />
            <span>{tr(`延后 (${presets[0].label})`, `Snooze (${presets[0].label})`)}</span>
          </MenuItem>
        ) : null}

        <MenuSeparator />

        <MenuItem onClick={onStartRename}>
          <PencilIcon className="size-4" />
          <span>{tr("重命名线程", "Rename thread")}</span>
        </MenuItem>
        <MenuItem onClick={() => void navigator.clipboard?.writeText(summary.cwd)}>
          <FolderIcon className="size-4" />
          <span>{tr("复制工作区路径", "Copy working directory")}</span>
        </MenuItem>
        <MenuItem onClick={() => void navigator.clipboard?.writeText(summary.id)}>
          <CopyIcon className="size-4" />
          <span>{tr("复制线程 ID", "Copy thread ID")}</span>
        </MenuItem>

        <MenuSeparator />

        <MenuItem variant="destructive" onClick={onDeleteThread}>
          <Trash2Icon className="size-4" />
          <span>{tr("删除线程", "Delete thread")}</span>
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}

/** t3code 的 hero 态：外层 relative，composer 所在行 flex items-center 垂直居中，标题 absolute bottom-full。 */
function HeroState({
  threadId,
  projectName,
  running,
}: {
  threadId: ThreadId;
  projectName: string;
  running: boolean;
}) {
  const { tr } = useI18n();
  return (
    <div className="relative flex-1">
      <div className="absolute inset-0 flex items-center">
        <div className="relative w-full px-4">
          <div className="absolute inset-x-0 bottom-full">
            <div className="mx-auto w-full max-w-(--chat-content-max-width) px-4 pb-5">
              <DraftHeroProjectHeading projectName={projectName}>
                {projectName}
              </DraftHeroProjectHeading>
            </div>
          </div>
          <div className="mx-auto w-full max-w-(--chat-content-max-width)">
            <Composer key={threadId} threadId={threadId} running={running} autoFocus />
          </div>
          <div className="text-muted-foreground mt-2 text-center text-xs">
            {tr("Enter 发送 · Shift+Enter 换行", "Enter to send · Shift+Enter for newline")}
          </div>
        </div>
      </div>
    </div>
  );
}

function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

function MessageTimeline({
  items,
  running,
  onContainerRef,
}: {
  items: TurnItem[];
  running: boolean;
  onContainerRef: (node: HTMLDivElement | null) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const [currentTurnIndex, setCurrentTurnIndex] = useState<number | null>(null);
  const { tr } = useI18n();

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef.current = node;
      onContainerRef(node);
    },
    [onContainerRef],
  );

  const lastItem = items.at(-1);
  const lastSignature = useMemo(
    () =>
      lastItem === undefined
        ? "0"
        : `${lastItem.id}:${lastItem.status}:${"text" in lastItem ? lastItem.text.length : 0}:${
            "output" in lastItem ? (lastItem.output?.length ?? 0) : 0
          }`,
    [lastItem],
  );

  // 连续的工作条目折叠成一行摘要（对齐 t3code work group rows）。
  const rows = useMemo(() => groupTimelineItems(items), [items]);
  const minimapItems = useMemo(() => deriveTimelineMinimapItems(items), [items]);

  const latestAssistantId = useMemo(() => {
    for (let i = items.length - 1; i >= 0; i -= 1) {
      if (items[i]?.type === "assistant_message") return items[i]!.id;
    }
    return null;
  }, [items]);

  // 滚动锚定：贴底时新内容自动下滚（对齐 t3code timelineScrollAnchoring 的行为）
  useEffect(() => {
    if (pinnedToBottom) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [lastSignature, pinnedToBottom]);

  const handleSelectMinimapItem = useCallback((item: TimelineMinimapItem) => {
    const container = scrollRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(
      `[data-user-turn-id="${CSS.escape(item.id)}"]`,
    );
    target?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);

  const pendingApproval = items.find(
    (item) => item.type === "approval_request" && item.status === "waiting",
  );

  return (
    <div className="relative min-h-0 flex-1">
      <TimelineMinimap
        items={minimapItems}
        currentIndex={currentTurnIndex}
        onSelect={handleSelectMinimapItem}
      />
      <div
        ref={setRefs}
        onScroll={(event) => {
          const el = event.currentTarget;
          setPinnedToBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 48);

          if (minimapItems.length >= 2) {
            const containerTop = el.getBoundingClientRect().top;
            let activeIdx = 0;
            for (let i = 0; i < minimapItems.length; i += 1) {
              const turnEl = el.querySelector<HTMLElement>(
                `[data-user-turn-id="${CSS.escape(minimapItems[i]!.id)}"]`,
              );
              if (turnEl && turnEl.getBoundingClientRect().top - containerTop <= 140) {
                activeIdx = i;
              }
            }
            setCurrentTurnIndex(activeIdx);
          }
        }}
        className="h-full overflow-y-auto"
      >
        <div className="chat-composer-lane mx-auto flex max-w-(--chat-content-max-width) flex-col gap-1 px-4 py-6">
          {rows.map((row) => {
            if (row.kind === "work_group") {
              return (
                <WorkGroupRow
                  key={row.key}
                  rowKey={row.key}
                  items={row.items}
                  summary={row.summary}
                />
              );
            }
            if (row.kind === "reasoning_group") {
              return <ReasoningGroupRow key={row.key} rowKey={row.key} items={row.items} />;
            }
            return (
              <TurnItemRow
                key={row.key}
                item={row.item}
                isLatestAssistant={row.item.id === latestAssistantId}
              />
            );
          })}
          {running && !pendingApproval && items.at(-1)?.type !== "assistant_message" && (
            <div className="text-muted-foreground animate-pulse py-2 text-xs">
              {tr("Pi 正在思考与执行…", "pi is working…")}
            </div>
          )}
          {pendingApproval && pendingApproval.type === "approval_request" && (
            <div className="text-warning mt-2 text-2xs">
              {tr("等待你确认后 Pi 才会继续。", "Waiting for your approval before Pi continues.")}
            </div>
          )}
        </div>
      </div>
      {!pinnedToBottom ? (
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          aria-label={tr("回到底部", "Scroll to bottom")}
          title={tr("回到底部", "Scroll to bottom")}
          onClick={() => {
            scrollRef.current?.scrollTo({
              top: scrollRef.current.scrollHeight,
              behavior: "smooth",
            });
          }}
          className="absolute right-6 bottom-3 z-10 shadow-md"
        >
          <ArrowDownIcon />
        </Button>
      ) : null}
    </div>
  );
}

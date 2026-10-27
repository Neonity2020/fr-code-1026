/**
 * 聊天视图，布局对齐 t3code ChatView 的两种状态：
 * - hero 态（空线程）：composer 垂直居中，标题挂在 composer 正上方（absolute bottom-full）
 * - 普通态：时间线滚动 + composer 吸底
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ThreadId, TurnItem } from "@pi-web/protocol";
import { useAppStore } from "@pi-web/client-runtime";
import { useI18n } from "~/i18n";
import { cn } from "~/lib/utils";
import { ProjectIcon } from "../ProjectMonogram";
import { useSidebarVisibility } from "../ui/sidebar";
import { Composer } from "./Composer";
import { DraftHeroProjectHeading } from "./DraftHeroProjectHeading";
import { ReasoningGroupRow, TurnItemRow, WorkGroupRow } from "./TurnItemRows";
import { groupTimelineItems } from "./timelineGrouping";
import { ThreadDetailsPanel } from "./ThreadDetailsPanel";
import { observeResize } from "~/lib/observeResize";
import { canShowInlineThreadPanel } from "./threadPanelLayout";
import { ScriptOutputDrawer } from "./ScriptOutputDrawer";
import { TerminalDrawer } from "./TerminalDrawer";
import { subscribeChatPanelActions } from "./chatPanelBus";
import { ArrowDownIcon, DownloadIcon, ScrollTextIcon, TerminalIcon } from "lucide-react";
import { downloadThreadAsMarkdown } from "~/lib/threadExport";
import { Button } from "../ui/button";

export function ChatView({ threadId }: { threadId: ThreadId }) {
  const isSidebarVisible = useSidebarVisibility();
  const threadState = useAppStore((state) => state.byThread[threadId]);
  const threads = useAppStore((state) => state.threads);
  const summary = threads.find((thread) => thread.id === threadId);
  const items = threadState?.items ?? [];
  const projectName = summary ? basename(summary.cwd) : "…";
  const isHeroState = items.length === 0;
  const { tr } = useI18n();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [inlinePanelOpen, setInlinePanelOpen] = useState(true);
  const [outputOpen, setOutputOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [outputRevision, setOutputRevision] = useState(0);
  useEffect(() => { setOutputOpen(false); setTerminalOpen(false); }, [threadId]);
  // 命令面板可以要求打开当前线程的终端 / 脚本输出抽屉。
  useEffect(
    () =>
      subscribeChatPanelActions((action) => {
        if (action === "open-terminal") {
          setOutputOpen(false);
          setTerminalOpen(true);
        } else if (action === "open-script-output") {
          setTerminalOpen(false);
          setOutputOpen(true);
        }
      }),
    [],
  );
  const showScriptOutput = () => { setTerminalOpen(false); setOutputOpen(true); setOutputRevision((value) => value + 1); };
  const inlinePanel = canShowInlineThreadPanel(containerSize.width, containerSize.height);
  useEffect(() => {
    if (!container) return;
    setContainerSize({ width: container.clientWidth, height: container.clientHeight });
    return observeResize(container, ([entry]) => { if (entry) setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height }); });
  }, [container]);

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
        <span className="truncate text-xs font-medium">
          {summary?.title ?? tr("新线程", "New thread")}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {summary && (
            <Button
              variant="ghost-muted"
              size="icon-xs"
              aria-label={tr("导出为 Markdown", "Export as Markdown")}
              title={tr("导出对话为 Markdown", "Export conversation as Markdown")}
              onClick={() => {
                if (items.length > 0) {
                  downloadThreadAsMarkdown(summary, items);
                } else {
                  window.open(
                    `/api/thread/export?threadId=${encodeURIComponent(threadId)}&format=markdown`,
                    "_blank",
                  );
                }
              }}
            >
              <DownloadIcon />
            </Button>
          )}
          <Button variant="ghost-muted" size="icon-xs" aria-label={tr("切换脚本输出", "Toggle script output")} aria-expanded={outputOpen} onClick={() => { setTerminalOpen(false); setOutputOpen(!outputOpen); }}><ScrollTextIcon /></Button><Button variant="ghost-muted" size="icon-xs" aria-label={tr("切换终端", "Toggle terminal")} aria-expanded={terminalOpen} onClick={() => { setOutputOpen(false); setTerminalOpen(!terminalOpen); }}><TerminalIcon /></Button>{summary && <ThreadDetailsPanel threadId={threadId} cwd={summary.cwd} running={summary.status === "running"} inline={inlinePanel} inlineOpen={inlinePanelOpen} onInlineOpenChange={setInlinePanelOpen} onShowScriptOutput={showScriptOutput} />}</div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col" style={inlinePanel && inlinePanelOpen ? { paddingRight: "min(324px, max(0px, calc(var(--chat-content-max-width) + 648px - 100%)))" } : undefined}>
      {isHeroState ? (
        <HeroState threadId={threadId} projectName={projectName} running={summary?.status === "running"} />
      ) : (
        <>
          <MessageTimeline items={items} running={summary?.status === "running"} />
          <div className="shrink-0 px-4 pb-4">
            <Composer threadId={threadId} running={summary?.status === "running"} />
          </div>
        </>
      )}
      </div>
      {outputOpen && <ScriptOutputDrawer key={threadId} threadId={threadId} revision={outputRevision} onClose={() => setOutputOpen(false)} />}
      {terminalOpen && <TerminalDrawer key={threadId} threadId={threadId} onClose={() => setTerminalOpen(false)} />}
    </div>
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
            <Composer threadId={threadId} running={running} autoFocus />
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

function MessageTimeline({ items, running }: { items: TurnItem[]; running: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const { tr } = useI18n();

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

  // 滚动锚定：贴底时新内容自动下滚（对齐 t3code timelineScrollAnchoring 的行为）
  useEffect(() => {
    if (pinnedToBottom) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [lastSignature, pinnedToBottom]);

  const pendingApproval = items.find(
    (item) => item.type === "approval_request" && item.status === "waiting",
  );

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          setPinnedToBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
        }}
        className="h-full overflow-y-auto"
      >
        <div className="chat-composer-lane mx-auto flex max-w-(--chat-content-max-width) flex-col gap-1 px-4 py-6">
          {rows.map((row) => {
            if (row.kind === "work_group") {
              return <WorkGroupRow key={row.key} items={row.items} summary={row.summary} />;
            }
            if (row.kind === "reasoning_group") {
              // 连续的思考条目：折叠成一行，展开后逐条显示。
              return <ReasoningGroupRow key={row.key} items={row.items} />;
            }
            return <TurnItemRow key={row.key} item={row.item} />;
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
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
          }}
          className="absolute right-6 bottom-3 z-10 shadow-md"
        >
          <ArrowDownIcon />
        </Button>
      ) : null}
    </div>
  );
}

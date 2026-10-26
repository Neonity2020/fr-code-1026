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
import { TurnItemRow } from "./TurnItemRows";

export function ChatView({ threadId }: { threadId: ThreadId }) {
  const isSidebarVisible = useSidebarVisibility();
  const threadState = useAppStore((state) => state.byThread[threadId]);
  const threads = useAppStore((state) => state.threads);
  const summary = threads.find((thread) => thread.id === threadId);
  const items = threadState?.items ?? [];
  const projectName = summary ? basename(summary.cwd) : "…";
  const isHeroState = items.length === 0;
  const { tr } = useI18n();

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
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
      </header>
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
    <div
      ref={scrollRef}
      onScroll={(event) => {
        const el = event.currentTarget;
        setPinnedToBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
      }}
      className="min-h-0 flex-1 overflow-y-auto"
    >
      <div className="chat-composer-lane mx-auto flex max-w-(--chat-content-max-width) flex-col gap-1 px-4 py-6">
        {items.map((item) => (
          <TurnItemRow key={item.id} item={item} />
        ))}
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
  );
}

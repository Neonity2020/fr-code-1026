/**
 * 聊天顶栏标题区（对齐 t3code `ChatHeader` 的面包屑 + 标题菜单）：
 * - 项目名可点击：在同一项目下新建线程
 * - 线程标题双击进入内联重命名（失焦/回车提交，Esc 取消）
 * - 标题右侧 chevron 打开线程操作菜单（重命名 / 分叉 / 导出 / 复制 ID）
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ChevronDownIcon, CopyIcon, DownloadIcon, GitBranchIcon, PencilIcon } from "lucide-react";
import type { ThreadId } from "@pi-web/protocol";
import { transport, useAppStore } from "@pi-web/client-runtime";
import { useI18n } from "~/i18n";
import { downloadThreadAsJson, downloadThreadAsMarkdown } from "~/lib/threadExport";
import { ProjectIcon } from "../ProjectMonogram";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "../ui/menu";
import { toastManager } from "../ui/toast";

export function ChatHeaderTitle({
  threadId,
  projectName,
  title,
  cwd,
}: {
  threadId: ThreadId;
  projectName: string;
  title: string;
  cwd: string | null;
}) {
  const { tr } = useI18n();
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const renameCommittedRef = useRef(false);

  useEffect(() => {
    setDraftTitle(title);
  }, [title]);

  useEffect(() => {
    if (!renaming) return;
    renameCommittedRef.current = false;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [renaming]);

  const commitRename = () => {
    if (renameCommittedRef.current) return;
    renameCommittedRef.current = true;
    const trimmed = draftTitle.trim();
    setRenaming(false);
    if (!trimmed || trimmed === title) return;
    transport.dispatch({ type: "thread.rename", threadId, title: trimmed });
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
      setDraftTitle(title);
      setRenaming(false);
    }
  };

  const forkThread = () => {
    useAppStore.getState().markNewThreadRequested();
    transport.dispatch({ type: "thread.fork", sourceThreadId: threadId });
  };

  const exportThread = (format: "markdown" | "json") => {
    const thread = useAppStore.getState().threads.find((candidate) => candidate.id === threadId);
    if (!thread) return;
    const items = useAppStore.getState().byThread[threadId]?.items ?? [];
    if (items.length === 0) {
      window.open(
        `/api/thread/export?threadId=${encodeURIComponent(threadId)}&format=${format}`,
        "_blank",
      );
      return;
    }
    if (format === "markdown") downloadThreadAsMarkdown(thread, items);
    else downloadThreadAsJson(thread, items);
  };

  const copyThreadId = async () => {
    try {
      await navigator.clipboard.writeText(threadId);
      toastManager.add({ type: "success", title: tr("已复制线程 ID", "Thread ID copied") });
    } catch {
      toastManager.add({ type: "error", title: tr("复制失败", "Copy failed") });
    }
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <button
        type="button"
        onClick={() => {
          if (!cwd) return;
          useAppStore.getState().markNewThreadRequested();
          transport.dispatch({ type: "thread.create", cwd });
        }}
        title={tr(`在 ${projectName} 中新建线程`, `New thread in ${projectName}`)}
        className="text-muted-foreground hover:text-foreground flex min-w-0 shrink-0 items-center gap-1.5 rounded-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ProjectIcon projectName={projectName} className="size-3.5 shrink-0" />
        <span className="max-w-40 truncate">{projectName}</span>
      </button>
      <span className="text-muted-foreground text-xs">/</span>

      {renaming ? (
        <input
          ref={inputRef}
          aria-label={tr("线程标题", "Thread title")}
          className="min-w-0 flex-1 rounded-sm bg-transparent text-sm font-medium text-foreground outline-none ring-1 ring-ring/50 focus:ring-ring"
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          onBlur={commitRename}
          onKeyDown={handleRenameKeyDown}
        />
      ) : (
        <div className="group/thread-title flex min-w-0 items-center gap-1">
          <h2
            className="min-w-0 truncate text-sm font-medium"
            onDoubleClick={() => setRenaming(true)}
            title={tr("双击重命名", "Double-click to rename")}
          >
            {title}
          </h2>
          <Menu>
            <MenuTrigger
              render={
                <button
                  type="button"
                  aria-label={tr("线程操作", "Thread actions")}
                  className="text-muted-foreground hover:text-foreground rounded-sm p-0.5 transition-opacity opacity-0 group-hover/thread-title:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                />
              }
            >
              <ChevronDownIcon className="size-3.5" />
            </MenuTrigger>
            <MenuPopup align="start">
              <MenuItem onClick={() => setRenaming(true)}>
                <PencilIcon className="size-4 text-muted-foreground" />
                {tr("重命名", "Rename")}
              </MenuItem>
              <MenuItem onClick={forkThread}>
                <GitBranchIcon className="size-4 text-muted-foreground" />
                {tr("分叉线程", "Fork thread")}
              </MenuItem>
              <MenuSeparator />
              <MenuItem onClick={() => exportThread("markdown")}>
                <DownloadIcon className="size-4 text-muted-foreground" />
                {tr("导出为 Markdown", "Export as Markdown")}
              </MenuItem>
              <MenuItem onClick={() => exportThread("json")}>
                <DownloadIcon className="size-4 text-muted-foreground" />
                {tr("导出为 JSON", "Export as JSON")}
              </MenuItem>
              <MenuSeparator />
              <MenuItem onClick={() => void copyThreadId()}>
                <CopyIcon className="size-4 text-muted-foreground" />
                {tr("复制线程 ID", "Copy thread ID")}
              </MenuItem>
            </MenuPopup>
          </Menu>
        </div>
      )}
    </div>
  );
}

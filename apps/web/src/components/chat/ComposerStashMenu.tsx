/**
 * 暂存菜单（对齐 t3code `ComposerStashMenu`）：
 * 列出所有暂存的提示词，支持上下键移动、Enter 恢复、⌘⌫ 删除、Esc 关闭。
 */
import { BookmarkIcon, FileTextIcon, XIcon } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";

import { cn } from "~/lib/utils";
import type { PromptStashEntry } from "./promptStashStore";

const SNIPPET_MAX_CHARS = 90;

function formatRelativeTimeLabel(timestamp: number): string {
  const deltaMs = Date.now() - timestamp;
  if (deltaMs < 60_000) return "刚刚";
  if (deltaMs < 3_600_000) return `${Math.floor(deltaMs / 60_000)} 分钟前`;
  if (deltaMs < 86_400_000) return `${Math.floor(deltaMs / 3_600_000)} 小时前`;
  return new Date(timestamp).toLocaleDateString();
}

function stashEntrySnippet(entry: PromptStashEntry): string {
  const trimmed = entry.prompt.trim().replace(/\s+/g, " ");
  if (trimmed.length > 0) {
    return trimmed.length > SNIPPET_MAX_CHARS ? `${trimmed.slice(0, SNIPPET_MAX_CHARS)}…` : trimmed;
  }
  const attachmentCount = entry.attachments.length + entry.droppedAttachmentNames.length;
  if (attachmentCount === 0) return "（空）";
  return `（${attachmentCount} 个附件）`;
}

export const ComposerStashMenu = memo(function ComposerStashMenu({
  entries,
  stashShortcutLabel,
  emptyHint,
  onRestore,
  onDelete,
  onClose,
}: {
  entries: ReadonlyArray<PromptStashEntry>;
  stashShortcutLabel: string | null;
  emptyHint: string;
  onRestore: (entry: PromptStashEntry) => void;
  onDelete: (entry: PromptStashEntry) => void;
  onClose: () => void;
}) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(entries[0]?.id ?? null);

  const highlightedEntry = entries.find((entry) => entry.id === highlightedId) ?? entries[0];

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const drawer = drawerRef.current;
      if (
        (drawer && event.composedPath().includes(drawer)) ||
        (event.target instanceof Element &&
          event.target.closest('[data-composer-stash-badge="true"]'))
      ) {
        return;
      }
      onClose();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
  }, [onClose]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (entries.length === 0) return;
        event.preventDefault();
        event.stopPropagation();
        const currentIndex = entries.findIndex((entry) => entry.id === highlightedEntry?.id);
        const offset = event.key === "ArrowDown" ? 1 : -1;
        const normalizedIndex = currentIndex >= 0 ? currentIndex : offset === 1 ? -1 : 0;
        const nextIndex = (normalizedIndex + offset + entries.length) % entries.length;
        setHighlightedId(entries[nextIndex]?.id ?? null);
        const nextButton =
          drawerRef.current?.querySelectorAll<HTMLButtonElement>("[data-stash-restore]")[nextIndex];
        nextButton?.scrollIntoView({ block: "nearest" });
        if (drawerRef.current?.contains(document.activeElement)) {
          nextButton?.focus({ preventScroll: true });
        }
        return;
      }
      if (event.key === "Enter") {
        // 行内按钮（删除）自己处理激活，别在这里吞掉 Enter。
        if (event.target instanceof HTMLElement && event.target.closest("button[aria-label]")) return;
        if (!highlightedEntry) return;
        event.preventDefault();
        event.stopPropagation();
        onRestore(highlightedEntry);
        return;
      }
      if (event.key === "Backspace" && (event.metaKey || event.ctrlKey)) {
        if (!highlightedEntry) return;
        event.preventDefault();
        event.stopPropagation();
        onDelete(highlightedEntry);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [entries, highlightedEntry, onClose, onDelete, onRestore]);

  return (
    <div
      ref={drawerRef}
      data-composer-stash-drawer="true"
      className="absolute -top-2.5 right-3 z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border/80 bg-popover shadow-[0_18px_44px_-18px_rgb(0_0_0/55%)]"
    >
      <div className="flex items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5 text-xs text-muted-foreground">
        <BookmarkIcon className="size-3.5" />
        <span className="flex-1">{stashShortcutLabel ?? "暂存"}</span>
        <span className="tabular-nums">{entries.length}</span>
        <button
          type="button"
          aria-label="关闭暂存菜单"
          onPointerDown={(event) => event.preventDefault()}
          onClick={onClose}
          className="hover:text-foreground rounded-sm p-0.5 transition-colors"
        >
          <XIcon className="size-3" />
        </button>
      </div>
      <ul role="list" className="max-h-72 overflow-y-auto p-1">
        {entries.length === 0 ? (
          <li className="px-2 py-2 text-xs text-muted-foreground">{emptyHint}</li>
        ) : (
          entries.map((entry) => (
            <li
              key={entry.id}
              data-stash-entry={entry.id}
              data-highlighted={highlightedEntry?.id === entry.id || undefined}
              className={cn(
                "relative flex items-center gap-2 rounded-sm px-2 py-1.5",
                highlightedEntry?.id === entry.id && "bg-accent text-accent-foreground",
              )}
              onMouseMove={() => {
                if (highlightedId !== entry.id) setHighlightedId(entry.id);
              }}
              onFocus={() => setHighlightedId(entry.id)}
            >
              <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <button
                type="button"
                data-stash-restore={entry.id}
                aria-label={`恢复暂存的提示词：${stashEntrySnippet(entry)}`}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => onRestore(entry)}
                className="min-w-0 flex-1 cursor-pointer truncate text-left text-xs text-foreground/80 outline-none"
              >
                {stashEntrySnippet(entry)}
              </button>
              {entry.attachments.length > 0 ? (
                <span className="flex shrink-0 items-center -space-x-1.5">
                  {entry.attachments.slice(0, 3).map((attachment) =>
                    attachment.url ? (
                      <img
                        key={attachment.id}
                        src={attachment.url}
                        alt=""
                        aria-hidden="true"
                        className="size-4 rounded border border-border/70 object-cover"
                      />
                    ) : null,
                  )}
                </span>
              ) : null}
              {entry.droppedAttachmentNames.length > 0 ? (
                <span className="shrink-0 text-warning-foreground">
                  {entry.droppedAttachmentNames.length} 个附件已丢弃
                </span>
              ) : null}
              <time
                dateTime={new Date(entry.createdAt).toISOString()}
                className="shrink-0 text-muted-foreground tabular-nums"
              >
                {formatRelativeTimeLabel(entry.createdAt)}
              </time>
              <button
                type="button"
                aria-label="删除暂存的提示词"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => onDelete(entry)}
                className="hover:text-foreground z-10 shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors"
              >
                <XIcon className="size-3" />
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
});

import { useEffect, useMemo, useState } from "react";
import {
  FileCodeIcon,
  FileIcon,
  FileJsonIcon,
  FileTextIcon,
  ImageIcon,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { filterMentionFiles, type MentionFileItem } from "./composerMention.ts";

function resolveFileIcon(filename: string) {
  const lower = filename.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|ico)$/.test(lower)) {
    return <ImageIcon className="size-3.5 shrink-0 text-amber-500" />;
  }
  if (/\.json$/.test(lower)) {
    return <FileJsonIcon className="size-3.5 shrink-0 text-yellow-500" />;
  }
  if (/\.(md|markdown|txt|log)$/.test(lower)) {
    return <FileTextIcon className="size-3.5 shrink-0 text-blue-500" />;
  }
  if (/\.(ts|tsx|js|jsx|py|rs|go|c|cpp|h|css|html|sh|yaml|yml|toml)$/.test(lower)) {
    return <FileCodeIcon className="size-3.5 shrink-0 text-emerald-500" />;
  }
  return <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />;
}

// Global cache for thread file list to make mentions instant
const fileListCache = new Map<string, { files: string[]; fetchedAt: number }>();

export function useThreadFiles(threadId: string) {
  const [files, setFiles] = useState<string[]>(() => fileListCache.get(threadId)?.files ?? []);

  useEffect(() => {
    let active = true;
    const cached = fileListCache.get(threadId);
    if (cached && Date.now() - cached.fetchedAt < 30_000) {
      setFiles(cached.files);
      return;
    }

    fetch(`/api/thread/files?threadId=${encodeURIComponent(threadId)}`)
      .then((res) => (res.ok ? (res.json() as Promise<{ files: string[] }>) : null))
      .then((data) => {
        if (!active || !data) return;
        fileListCache.set(threadId, { files: data.files, fetchedAt: Date.now() });
        setFiles(data.files);
      })
      .catch(() => {
        // ignore fetch error
      });

    return () => {
      active = false;
    };
  }, [threadId]);

  return files;
}

export function ComposerMentionPopup({
  threadId,
  query,
  selectedIndex,
  onSelect,
  onClose,
}: {
  threadId: string;
  query: string;
  selectedIndex: number;
  onSelect: (filePath: string) => void;
  onClose: () => void;
}) {
  const files = useThreadFiles(threadId);

  const filteredItems = useMemo(
    () => filterMentionFiles(files, query),
    [files, query],
  );

  if (filteredItems.length === 0) {
    return null;
  }

  return (
    <div
      role="listbox"
      aria-label="File mentions"
      className="absolute bottom-full left-2 right-2 mb-2 z-40 max-h-56 overflow-y-auto rounded-xl border border-border/80 bg-popover p-1 shadow-xl backdrop-blur-md"
    >
      <div className="px-2 py-1 text-3xs font-medium uppercase tracking-wider text-muted-foreground">
        提及文件 (Mention File)
      </div>
      {filteredItems.map((item, index) => {
        const isSelected = index === selectedIndex;
        return (
          <button
            key={item.path}
            type="button"
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelect(item.path)}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors",
              isSelected
                ? "bg-accent text-accent-foreground font-medium"
                : "text-foreground hover:bg-accent/60",
            )}
          >
            {resolveFileIcon(item.name)}
            <span className="font-mono text-xs truncate">{item.name}</span>
            {item.dir ? (
              <span className="ml-auto font-mono text-3xs text-muted-foreground truncate max-w-[180px]">
                {item.dir}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

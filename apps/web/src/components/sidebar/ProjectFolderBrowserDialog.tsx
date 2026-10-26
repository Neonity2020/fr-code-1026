import {
  ArrowDownIcon,
  ArrowUpIcon,
  CornerLeftUpIcon,
  FolderGit2Icon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useI18n } from "~/i18n";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import {
  CommandDialog,
  CommandDialogPopup,
  CommandFooter,
  CommandFooterAction,
  CommandPanel,
} from "../ui/command";
import { Kbd, KbdGroup } from "../ui/kbd";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

interface BrowseDirectoryEntry {
  name: string;
  fullPath: string;
  isGitRepo: boolean;
}

interface BrowseResponse {
  parentPath: string;
  resolvedPath: string;
  exists: boolean;
  canBrowseUp: boolean;
  upPath: string | null;
  homeDir: string;
  accessError: string | null;
  entries: BrowseDirectoryEntry[];
}

interface BrowseRowItem {
  id: string;
  kind: "up" | "dir";
  name: string;
  fullPath: string;
  isGitRepo?: boolean;
}

function getParentDirectoryInput(cwd: string): string {
  const trimmed = cwd.trim().replace(/\/+$/, "");
  if (!trimmed || trimmed === "/") return "/";
  const lastSlash = trimmed.lastIndexOf("/");
  if (lastSlash <= 0) return "/";
  return `${trimmed.slice(0, lastSlash)}/`;
}

export function ProjectFolderBrowserDialog({
  open,
  onOpenChange,
  initialCwd,
  onOpenProject,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCwd: string;
  onOpenProject: (cwd: string) => void;
}) {
  const { tr } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const [query, setQuery] = useState(() => getParentDirectoryInput(initialCwd));
  const [browseData, setBrowseData] = useState<BrowseResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [isPickingNative, setIsPickingNative] = useState(false);

  const isMac =
    typeof navigator !== "undefined" && /mac/i.test(navigator.platform || navigator.userAgent);
  const modSymbol = isMac ? "⌘" : "Ctrl";

  // Reset initial query when opened
  useEffect(() => {
    if (!open) return;
    const initialInput = getParentDirectoryInput(initialCwd);
    setQuery(initialInput);
    setHighlightedIndex(-1);
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      const len = initialInput.length;
      inputRef.current?.setSelectionRange(len, len);
    });
    return () => cancelAnimationFrame(frame);
  }, [open, initialCwd]);

  // Fetch directories from /api/fs/browse when query changes
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setIsLoading(true);
    const params = new URLSearchParams({
      path: query,
      cwd: initialCwd || "/",
    });
    fetch(`/api/fs/browse?${params.toString()}`, { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<BrowseResponse>) : null))
      .then((data) => {
        if (controller.signal.aborted || !data) return;
        setBrowseData(data);
        setIsLoading(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });
    return () => controller.abort();
  }, [open, query, initialCwd]);

  const rows = useMemo<BrowseRowItem[]>(() => {
    if (!browseData) return [];
    const items: BrowseRowItem[] = [];
    if (browseData.canBrowseUp && browseData.upPath) {
      items.push({
        id: "browse:up",
        kind: "up",
        name: "..",
        fullPath: browseData.upPath,
      });
    }
    for (const entry of browseData.entries) {
      items.push({
        id: `browse:${entry.fullPath}`,
        kind: "dir",
        name: entry.name,
        fullPath: entry.fullPath,
        isGitRepo: entry.isGitRepo,
      });
    }
    return items;
  }, [browseData]);

  // Keep highlightedIndex in range
  useEffect(() => {
    if (highlightedIndex >= rows.length) {
      setHighlightedIndex(rows.length > 0 ? rows.length - 1 : -1);
    }
  }, [rows.length, highlightedIndex]);

  const highlightedRow = highlightedIndex >= 0 ? (rows[highlightedIndex] ?? null) : null;

  // Target path that will be opened if submitted right now
  const targetProjectPath = useMemo(() => {
    if (highlightedRow && highlightedRow.kind === "dir") {
      return highlightedRow.fullPath;
    }
    if (browseData?.resolvedPath) {
      return browseData.resolvedPath;
    }
    const trimmed = query.trim().replace(/\/+$/, "");
    return trimmed || "/";
  }, [highlightedRow, browseData, query]);

  const willCreateFolder =
    !isLoading &&
    browseData !== null &&
    browseData.accessError === null &&
    highlightedRow === null &&
    query.trim().length > 0 &&
    !browseData.exists;

  const submitLabel = willCreateFolder
    ? tr("新建并打开", "Create & Open")
    : tr("打开", "Open");

  const shortcutLabel = highlightedRow !== null ? `${modSymbol} Enter` : "Enter";

  const navigateIntoDirectory = (dirPath: string) => {
    const nextQuery = dirPath === "/" ? "/" : `${dirPath.replace(/\/+$/, "")}/`;
    setHighlightedIndex(-1);
    setQuery(nextQuery);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextQuery.length, nextQuery.length);
    });
  };

  const handleSubmitPath = (pathToOpen?: string) => {
    const finalPath = (pathToOpen ?? (browseData?.resolvedPath || query.trim())).replace(
      /\/+$/,
      "",
    ) || "/";
    if (!finalPath) return;
    onOpenChange(false);
    onOpenProject(finalPath);
  };

  const handlePickFromNativeFileManager = async () => {
    if (isPickingNative) return;
    setIsPickingNative(true);
    try {
      const response = await fetch("/api/fs/pick-folder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          initialPath: browseData?.parentPath ?? initialCwd,
          prompt: tr("选择要打开的项目文件夹", "Select project folder to open"),
        }),
      });
      if (!response.ok) return;
      const result = (await response.json()) as { cancelled: boolean; path: string | null };
      if (!result.cancelled && result.path) {
        onOpenChange(false);
        onOpenProject(result.path);
      }
    } finally {
      setIsPickingNative(false);
    }
  };

  const scrollRowIntoView = (index: number) => {
    const container = listRef.current;
    if (!container) return;
    const rowEl = container.querySelector<HTMLElement>(`[data-row-index="${index}"]`);
    rowEl?.scrollIntoView({ block: "nearest" });
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    const isModPressed = isMac
      ? event.metaKey && !event.ctrlKey
      : event.ctrlKey && !event.metaKey;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (rows.length === 0) return;
      const next = highlightedIndex < rows.length - 1 ? highlightedIndex + 1 : 0;
      setHighlightedIndex(next);
      scrollRowIntoView(next);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (rows.length === 0) return;
      const next = highlightedIndex > 0 ? highlightedIndex - 1 : rows.length - 1;
      setHighlightedIndex(next);
      scrollRowIntoView(next);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (isModPressed) {
        handleSubmitPath(targetProjectPath);
        return;
      }
      if (highlightedRow) {
        navigateIntoDirectory(highlightedRow.fullPath);
        return;
      }
      handleSubmitPath();
    }
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandDialogPopup aria-label={tr("打开项目文件夹", "Open project folder")}>
        {/* Top Path Input Bar */}
        <div className="relative border-b border-border/60 px-3 py-2">
          <div className="flex items-center gap-2.5 pe-28">
            <FolderPlusIcon className="size-4 shrink-0 text-icon-muted" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(event) => {
                setHighlightedIndex(-1);
                setQuery(event.currentTarget.value);
              }}
              onKeyDown={handleInputKeyDown}
              placeholder={tr(
                "输入项目路径（例如 ~/projects/my-app）",
                "Enter project path (e.g. ~/projects/my-app)",
              )}
              aria-label={tr("项目文件夹路径", "Project folder path")}
              className="h-8 w-full min-w-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="xs"
                  tabIndex={-1}
                  className="absolute inset-e-3 top-1/2 -translate-y-1/2"
                  disabled={!query.trim()}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSubmitPath(targetProjectPath)}
                />
              }
            >
              <span>{submitLabel}</span>
              <KbdGroup className="pointer-events-none -me-0.5">
                <Kbd>{shortcutLabel}</Kbd>
              </KbdGroup>
            </TooltipTrigger>
            <TooltipPopup side="top">
              {`${submitLabel} (${shortcutLabel})`}
            </TooltipPopup>
          </Tooltip>
        </div>

        {/* Directory List Panel */}
        <CommandPanel className="flex max-h-[min(24rem,65vh)] min-h-0 flex-col">
          {browseData?.accessError ? (
            <div role="alert" className="px-4 py-3 text-sm text-muted-foreground">
              {browseData.accessError}
            </div>
          ) : isLoading && browseData === null ? (
            <div role="status" className="px-4 py-6 text-center text-sm text-muted-foreground">
              {tr("正在加载文件夹…", "Loading folders...")}
            </div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {willCreateFolder
                ? tr(
                    "按 Enter 创建此文件夹并作为项目打开。",
                    "Press Enter to create this folder and open it as a project.",
                  )
                : tr("当前目录下没有子文件夹。", "No subdirectories in this folder.")}
            </div>
          ) : (
            <div
              ref={listRef}
              className="min-h-0 flex-1 overflow-y-auto px-2 py-2"
              role="listbox"
              aria-label={tr("文件夹列表", "Directories")}
            >
              <div className="px-2 pb-1 text-xs font-medium text-muted-foreground">
                {tr("文件夹", "Directories")}
              </div>
              {rows.map((row, index) => {
                const isActive = index === highlightedIndex;
                return (
                  <div
                    key={row.id}
                    data-row-index={index}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => navigateIntoDirectory(row.fullPath)}
                    className={cn(
                      "group flex min-h-8 cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground hover:bg-foreground/[0.06]",
                    )}
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center text-icon-muted">
                      {row.kind === "up" ? (
                        <CornerLeftUpIcon className="size-4" />
                      ) : row.isGitRepo ? (
                        <FolderGit2Icon className="size-4 text-primary" />
                      ) : (
                        <FolderIcon className="size-4" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{row.name}</span>
                    {row.isGitRepo ? (
                      <span className="rounded bg-foreground/[0.07] px-1.5 py-0.5 font-mono text-2xs text-muted-foreground">
                        git
                      </span>
                    ) : null}
                    {row.kind === "dir" ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        tabIndex={-1}
                        className="h-6 px-2 text-xs opacity-0 transition-opacity group-hover:opacity-100 data-[active=true]:opacity-100"
                        data-active={isActive || undefined}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleSubmitPath(row.fullPath);
                        }}
                      >
                        {tr("打开", "Open")}
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CommandPanel>

        {/* Bottom Footer with Keyboard Hints & Native File Manager Picker */}
        <CommandFooter className="max-sm:flex-col max-sm:items-start">
          <div className="flex flex-wrap items-center gap-3">
            <KbdGroup>
              <Kbd>
                <ArrowUpIcon />
              </Kbd>
              <Kbd>
                <ArrowDownIcon />
              </Kbd>
              <span>{tr("导航", "Navigate")}</span>
            </KbdGroup>
            <KbdGroup>
              <Kbd>Enter</Kbd>
              <span>
                {highlightedRow !== null
                  ? tr("进入文件夹", "Enter folder")
                  : submitLabel}
              </span>
            </KbdGroup>
            {highlightedRow !== null ? (
              <KbdGroup>
                <Kbd>{`${modSymbol} Enter`}</Kbd>
                <span>{tr("打开选中项", "Open selected")}</span>
              </KbdGroup>
            ) : null}
            <KbdGroup>
              <Kbd>Esc</Kbd>
              <span>{tr("关闭", "Close")}</span>
            </KbdGroup>
          </div>

          <CommandFooterAction
            disabled={isPickingNative}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void handlePickFromNativeFileManager()}
          >
            <FolderOpenIcon className="size-3.5" />
            <span>
              {isPickingNative
                ? tr("正在打开系统选择器…", "Opening system picker...")
                : isMac
                  ? tr("在 Finder 中选择…", "Open in Finder")
                  : tr("从系统文件夹选择器打开…", "Open from File Manager")}
            </span>
          </CommandFooterAction>
        </CommandFooter>
      </CommandDialogPopup>
    </CommandDialog>
  );
}

/**
 * ⌘P 文件选择器,对齐 t3code files/ProjectFilePicker:
 * - 目标项目 = 当前活跃线程的 cwd
 * - 文件索引来自 GET /api/fs/files(模块级缓存 60s + in-flight 去重)
 * - 客户端模糊过滤 + 命中字符加粗高亮
 * - Enter/点击 → POST /api/fs/open-file 用偏好编辑器打开
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  FileArchiveIcon,
  FileCode2Icon,
  FileIcon,
  FileImageIcon,
  FileJsonIcon,
  FileLock2Icon,
  FileTextIcon,
  FileType2Icon,
} from "lucide-react";
import { useAppStore } from "@pi-web/client-runtime";
import { useI18n } from "~/i18n";
import { cn } from "~/lib/utils";
import { projectBasename } from "../../projectIdentity";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { CommandPaletteContent } from "../CommandPaletteContent";
import { type CommandPaletteActionItem } from "../CommandPalette.logic";
import { CommandPaletteResults } from "../CommandPaletteResults";
import {
  filterProjectFiles,
  PROJECT_FILE_PICKER_RESULT_LIMIT,
} from "./ProjectFilePicker.logic";

interface ProjectFilesCacheEntry {
  files: string[];
  fetchedAtMs: number;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, ProjectFilesCacheEntry>();
const inflight = new Map<string, Promise<string[]>>();

async function fetchProjectFiles(cwd: string): Promise<string[]> {
  const cached = cache.get(cwd);
  if (cached && Date.now() - cached.fetchedAtMs < CACHE_TTL_MS) {
    return cached.files;
  }
  const existing = inflight.get(cwd);
  if (existing) return existing;

  const load = fetch(`/api/fs/files?cwd=${encodeURIComponent(cwd)}`)
    .then(async (response) => {
      if (!response.ok) throw new Error(await response.text());
      return response.json() as Promise<{ files: string[] }>;
    })
    .then((result) => {
      cache.set(cwd, { files: result.files, fetchedAtMs: Date.now() });
      return result.files;
    })
    .finally(() => {
      inflight.delete(cwd);
    });
  inflight.set(cwd, load);
  return load;
}

function useProjectFiles(cwd: string | null): {
  files: string[];
  isPending: boolean;
  error: string | null;
} {
  const [state, setState] = useState<{ files: string[]; isPending: boolean; error: string | null }>(
    { files: [], isPending: false, error: null },
  );

  useEffect(() => {
    if (cwd === null) {
      setState({ files: [], isPending: false, error: null });
      return;
    }
    let cancelled = false;
    setState((previous) => ({ files: previous.files, isPending: true, error: null }));
    fetchProjectFiles(cwd).then(
      (files) => {
        if (!cancelled) setState({ files, isPending: false, error: null });
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({
            files: [],
            isPending: false,
            error: error instanceof Error && error.message ? error.message : "error",
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  return state;
}

const FILE_ICON_BY_EXTENSION: Record<string, typeof FileCode2Icon> = {
  ts: FileCode2Icon,
  tsx: FileCode2Icon,
  js: FileCode2Icon,
  jsx: FileCode2Icon,
  mjs: FileCode2Icon,
  cjs: FileCode2Icon,
  py: FileCode2Icon,
  rs: FileCode2Icon,
  go: FileCode2Icon,
  rb: FileCode2Icon,
  java: FileCode2Icon,
  kt: FileCode2Icon,
  swift: FileCode2Icon,
  c: FileCode2Icon,
  h: FileCode2Icon,
  cpp: FileCode2Icon,
  sh: FileCode2Icon,
  json: FileJsonIcon,
  md: FileTextIcon,
  mdx: FileTextIcon,
  txt: FileTextIcon,
  log: FileTextIcon,
  png: FileImageIcon,
  jpg: FileImageIcon,
  jpeg: FileImageIcon,
  gif: FileImageIcon,
  svg: FileImageIcon,
  webp: FileImageIcon,
  ico: FileImageIcon,
  zip: FileArchiveIcon,
  gz: FileArchiveIcon,
  tar: FileArchiveIcon,
  env: FileLock2Icon,
  lock: FileLock2Icon,
  yaml: FileType2Icon,
  yml: FileType2Icon,
  toml: FileType2Icon,
  css: FileType2Icon,
  scss: FileType2Icon,
  html: FileType2Icon,
};

function fileIconFor(filePath: string, hasQuery: boolean) {
  const extension = filePath.slice(filePath.lastIndexOf(".") + 1).toLowerCase();
  const Icon = FILE_ICON_BY_EXTENSION[extension] ?? FileIcon;
  return <Icon className={cn("size-4 shrink-0", hasQuery ? "text-icon-muted" : "text-icon-muted/70")} />;
}

function HighlightedFuzzyText(props: {
  active: boolean;
  indices: ReadonlyArray<number>;
  value: string;
}) {
  if (!props.active) return props.value;

  const parts: ReactNode[] = [];
  let start = 0;
  for (const index of props.indices) {
    if (start < index) parts.push(props.value.slice(start, index));
    parts.push(
      <strong className="font-semibold text-foreground" key={index}>
        {props.value[index]}
      </strong>,
    );
    start = index + 1;
  }
  if (start < props.value.length) parts.push(props.value.slice(start));

  return <span className="text-muted-foreground">{parts}</span>;
}

interface FilePickerTarget {
  readonly cwd: string;
  readonly projectName: string;
}

function useFilePickerTarget(): FilePickerTarget | null {
  const threads = useAppStore((state) => state.threads);
  const activeThreadId = useAppStore((state) => state.activeThreadId);
  const defaultCwd = useAppStore((state) => state.defaultCwd);
  const thread = threads.find((t) => t.id === activeThreadId);
  const cwd = thread?.cwd ?? defaultCwd;
  if (cwd === null || cwd.length === 0) return null;
  return { cwd, projectName: projectBasename(cwd) };
}

async function openFileInEditor(input: { cwd: string; file: string; editor: string }) {
  const response = await fetch("/api/fs/open-file", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await response.text());
}

export function ProjectFilePicker({ setOpen }: { setOpen: (open: boolean) => void }) {
  const { tr } = useI18n();
  const target = useFilePickerTarget();
  const [query, setQuery] = useState("");
  const [highlightedItemValue, setHighlightedItemValue] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [preferredEditor] = useLocalStorage("pi-web:preferred-editor", "vscode");
  const { files, isPending, error } = useProjectFiles(target?.cwd ?? null);

  const matches = useMemo(
    () => filterProjectFiles(files, query, PROJECT_FILE_PICKER_RESULT_LIMIT),
    [files, query],
  );
  const hasQuery = query.trim().length > 0;

  const items = useMemo<CommandPaletteActionItem[]>(
    () =>
      matches.map((match) => ({
        kind: "action" as const,
        value: `file:${match.path}`,
        searchTerms: [match.name, match.path],
        title: (
          <HighlightedFuzzyText active={hasQuery} value={match.name} indices={match.nameMatchIndices} />
        ),
        description: (
          <HighlightedFuzzyText active={hasQuery} value={match.path} indices={match.pathMatchIndices} />
        ),
        icon: fileIconFor(match.path, hasQuery),
        run: async () => {
          if (!target) return;
          await openFileInEditor({ cwd: target.cwd, file: match.path, editor: preferredEditor });
        },
      })),
    [hasQuery, matches, preferredEditor, target],
  );

  const executeItem = useCallback(
    (item: CommandPaletteActionItem) => {
      setOpen(false);
      setOpenError(null);
      void Promise.resolve(item.run()).catch((cause: unknown) => {
        setOpenError(cause instanceof Error && cause.message ? cause.message : "error");
        setQuery("");
      });
    },
    [setOpen],
  );

  if (!target) {
    return (
      <CommandPaletteContent
        aria-label={tr("文件选择器", "File picker")}
        escapeLabel={tr("返回", "Back")}
        footerActionLabel={tr("打开文件", "Open file")}
        inputProps={{ disabled: true, placeholder: tr("搜索文件…", "Search files…") }}
        mode="none"
        testId="project-file-picker"
        value=""
      >
        <div className="py-10 text-center text-sm text-muted-foreground">
          {tr("打开一个项目后即可搜索其文件。", "Open a project to search its files.")}
        </div>
      </CommandPaletteContent>
    );
  }

  const emptyStateMessage = openError
    ? openError
    : error
      ? tr("加载项目文件失败。", "Could not load project files.")
      : isPending
        ? hasQuery
          ? tr("正在索引项目文件…", "Indexing workspace files…")
          : tr("正在加载项目文件…", "Loading workspace files…")
        : hasQuery
          ? tr("没有匹配的文件。", "No matching files.")
          : tr("项目中没有文件。", "No files found.");

  return (
    <CommandPaletteContent
      aria-label={tr("文件选择器", "File picker")}
      autoHighlight="always"
      escapeLabel={tr("返回", "Back")}
      footerActionLabel={tr("打开文件", "Open file")}
      inputProps={{ placeholder: tr("搜索文件…", "Search files…") }}
      mode="none"
      onItemHighlighted={(value) => {
        setHighlightedItemValue(typeof value === "string" ? value : null);
      }}
      onValueChange={(value) => {
        setHighlightedItemValue(null);
        setOpenError(null);
        setQuery(typeof value === "string" ? value : "");
      }}
      panelClassName="max-h-[min(34rem,76vh)]"
      testId="project-file-picker"
      value={query}
    >
      <CommandPaletteResults
        groups={
          items.length > 0
            ? [{ value: "project-files", label: target.projectName, items }]
            : []
        }
        highlightedItemValue={highlightedItemValue}
        isActionsOnly={false}
        onExecuteItem={(item) => {
          if (item.kind !== "action") return;
          executeItem(item);
        }}
        emptyStateMessage={emptyStateMessage}
      />
    </CommandPaletteContent>
  );
}

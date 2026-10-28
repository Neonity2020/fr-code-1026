import { FileDiff } from "@pierre/diffs/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCwIcon, XIcon } from "lucide-react";
import { getRenderablePatch, resolveDiffThemeName } from "~/lib/diffRendering";
import { PREFERRED_HIGHLIGHTER } from "~/lib/syntaxHighlighting";
import { useI18n } from "~/i18n";

export function ChangesDialog({ threadId, files, open, onOpenChange }: { threadId: string; files: string[]; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { tr } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);
  const [patch, setPatch] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"all" | "staged" | "unstaged">("all");
  const [layout, setLayout] = useState<"unified" | "split">("unified");
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [displayFiles, setDisplayFiles] = useState(files);
  const [revision, setRevision] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const refreshController = useRef<AbortController | null>(null);
  const renderable = useMemo(() => getRenderablePatch(patch ?? undefined, "diff-panel", { ignoreWhitespace }), [patch, ignoreWhitespace]);
  useEffect(() => {
    if (open) setDisplayFiles(files);
  }, [open, files]);
  useEffect(() => {
    if (open) setSelected((current) => current && displayFiles.includes(current) ? current : displayFiles[0] ?? null);
  }, [open, displayFiles]);
  useEffect(() => {
    setRefreshing(false);
    setRefreshError("");
    return () => { refreshController.current?.abort(); };
  }, [threadId, open]);
  useEffect(() => {
    if (!open || !selected) return;
    const controller = new AbortController();
    setPatch(null);
    setMessage("");
    const query = new URLSearchParams({ threadId, file: selected, mode });
    fetch(`/api/thread/diff?${query}`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error(await response.text());
      return response.json() as Promise<{ patch: string; message: string }>;
    }).then((result) => { setPatch(result.patch); setMessage(result.message === "Staged and unstaged changes cancel out in the combined view. Select either view to inspect them." ? tr("已暂存和未暂存的修改在全部视图中相互抵消，请切换视图查看。", result.message) : result.message); })
      .catch((error: unknown) => { if (!controller.signal.aborted) { setPatch(""); setMessage(error instanceof Error ? error.message : String(error)); } });
    return () => controller.abort();
  }, [open, selected, threadId, mode, revision]);

  async function refreshChanges() {
    refreshController.current?.abort();
    const controller = new AbortController();
    refreshController.current = controller;
    setRefreshing(true);
    setRefreshError("");
    try {
      const response = await fetch(`/api/thread/git?threadId=${encodeURIComponent(threadId)}`, { signal: controller.signal });
      if (!response.ok) throw new Error(tr("无法刷新变更", "Could not refresh changes"));
      const result = await response.json() as { files: string[] };
      if (!controller.signal.aborted) { setDisplayFiles(result.files); setRevision((value) => value + 1); }
    } catch (error) {
      if (!controller.signal.aborted) setRefreshError(error instanceof Error ? error.message : String(error));
    } finally {
      if (!controller.signal.aborted) setRefreshing(false);
    }
  }

  if (!open) return null;
  return <aside aria-label={tr("变更", "Changes")} className="absolute bottom-0 right-0 top-[var(--workspace-topbar-height)] z-30 flex w-[min(42rem,100%)] min-w-0 flex-col border-l bg-background shadow-lg">
      <div className="shrink-0 border-b p-3"><div className="flex items-center justify-between"><h2 className="text-sm font-medium">{tr("变更", "Changes")}</h2><button type="button" onClick={() => onOpenChange(false)} aria-label={tr("关闭变更面板", "Close changes panel")} className="rounded-md p-1 hover:bg-accent"><XIcon className="size-4" /></button></div><div className="flex flex-wrap items-center gap-2 pt-2"><div role="group" aria-label={tr("差异范围", "Diff scope")} className="flex gap-1">{([ ["all", tr("全部", "All")], ["staged", tr("已暂存", "Staged")], ["unstaged", tr("未暂存", "Unstaged")] ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={`rounded-md px-2 py-1 text-xs ${mode === value ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent"}`}>{label}</button>)}</div><div role="group" aria-label={tr("差异布局", "Diff layout")} className="flex gap-1">{([ ["unified", tr("合并", "Unified")], ["split", tr("并排", "Split")] ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={layout === value} onClick={() => setLayout(value)} className={`rounded-md px-2 py-1 text-xs ${layout === value ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent"}`}>{label}</button>)}</div><label className="flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" checked={ignoreWhitespace} onChange={(event) => setIgnoreWhitespace(event.target.checked)} />{tr("忽略空白", "Ignore whitespace")}</label><button type="button" disabled={refreshing} onClick={() => void refreshChanges()} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent disabled:opacity-50"><RefreshCwIcon className="size-3.5" />{tr("刷新", "Refresh")}</button></div>{refreshError && <p role="alert" className="text-xs text-destructive">{refreshError}</p>}</div>
      <div className="flex min-h-0 flex-1 max-sm:flex-col">
        <nav aria-label={tr("变更文件", "Changed files")} className="w-40 shrink-0 overflow-y-auto border-r p-2 max-sm:max-h-32 max-sm:w-full max-sm:border-r-0 max-sm:border-b">
          {displayFiles.map((file) => <button type="button" key={file} onClick={() => setSelected(file)} aria-current={selected === file ? "true" : undefined} className={`block w-full break-all rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent ${selected === file ? "bg-accent font-medium" : "text-muted-foreground"}`}>{file}</button>)}
          {displayFiles.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">{tr("没有变更", "No changes")}</p>}
        </nav>
        <div className="min-w-0 flex-1 overflow-auto p-3 text-xs">
          {!selected ? null : patch === null ? <p className="text-muted-foreground">{tr("正在加载…", "Loading…")}</p> : message ? <p role="status" className="break-words text-muted-foreground">{message}</p> : renderable?.kind === "files" ? renderable.files.map((file, index) => <FileDiff key={`${file.name}-${index}`} fileDiff={file} options={{ diffStyle: layout, theme: resolveDiffThemeName(document.documentElement.classList.contains("dark") ? "dark" : "light"), preferredHighlighter: PREFERRED_HIGHLIGHTER }} />) : renderable?.kind === "raw" ? <pre className="whitespace-pre-wrap break-all">{renderable.text}</pre> : <p className="text-muted-foreground">{tr("没有可显示的文本差异", "No text diff to display")}</p>}
        </div>
      </div>
  </aside>;
}

import { useEffect, useState } from "react";
import { CheckIcon, ChevronDownIcon, CloudUploadIcon, Code2Icon, FileDiffIcon, FolderIcon, GitBranchIcon, MonitorIcon, SquareMenuIcon, PlusIcon } from "lucide-react";
import { useI18n } from "~/i18n";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { Button } from "../ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "../ui/dialog";
import { Menu, MenuItem, MenuPopup, MenuSearchInput, MenuSeparator, MenuTrigger } from "../ui/menu";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { ProjectScriptsControl } from "./ProjectScriptsControl";
import { ChangesDialog } from "./ChangesDialog";
import { subscribeChatPanelActions } from "./chatPanelBus";
import { shouldPollGitStatus } from "./gitStatusPolling";

interface GitStatus {
  branch: string | null;
  files: string[];
  additions: number;
  deletions: number;
  statsIncomplete: boolean;
  hostname: string;
  branches: string[];
  remoteBranches: { ref: string; name: string; localName: string }[];
  pushTarget: { branch: string; remote: string; ref: string; hasUpstream: boolean; ahead: number | null; behind: number | null } | null;
}

export function ThreadDetailsPanel({ threadId, cwd, running, inline, inlineOpen, onInlineOpenChange, onShowScriptOutput, onShowTerminal, showFiles, onShowFilesChange }: { threadId: string; cwd: string; running: boolean; inline: boolean; inlineOpen: boolean; onInlineOpenChange: (open: boolean) => void; onShowScriptOutput: () => void; onShowTerminal: () => void; showFiles: boolean; onShowFilesChange: (open: boolean) => void }) {
  const { tr } = useI18n();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [commitDialog, setCommitDialog] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [pushDialog, setPushDialog] = useState(false);
  const [pullDialog, setPullDialog] = useState(false);
  const [branchDialog, setBranchDialog] = useState(false);
  const [newBranch, setNewBranch] = useState("");
  const [branchQuery, setBranchQuery] = useState("");
  const [editors, setEditors] = useState<{ id: string; label: string }[]>([]);
  const [editorLoading, setEditorLoading] = useState(true);
  const [preferredEditor, setPreferredEditor] = useLocalStorage("pi-web:preferred-editor", "vscode");
  const activeEditor = editors.find((editor) => editor.id === preferredEditor) ?? editors[0];
  const diverged = Boolean(status?.pushTarget?.ahead && status.pushTarget.behind);
  const panelOpen = inline ? inlineOpen : popoverOpen;
  const dialogOpen = commitDialog || pushDialog || pullDialog || branchDialog || showFiles;

  useEffect(() => { if (inline) setPopoverOpen(false); }, [inline]);
  // 命令面板可以直接打开变更对话框。
  useEffect(
    () => subscribeChatPanelActions((action) => { if (action === "open-changes") onShowFilesChange(true); }),
    [onShowFilesChange],
  );
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/editors", { signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error("Could not detect editors");
      return response.json() as Promise<{ editors: { id: string; label: string }[] }>;
    }).then((result) => setEditors(result.editors)).catch(() => { if (!controller.signal.aborted) setActionError(tr("无法检测编辑器", "Could not detect editors")); }).finally(() => { if (!controller.signal.aborted) setEditorLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setStatus(null);
    setError(false);
  }, [threadId]);

  useEffect(() => {
    if (busy || dialogOpen) return;
    const controller = new AbortController();
    let timer: number | undefined;
    async function refresh() {
      try {
        const response = await fetch(`/api/thread/git?threadId=${encodeURIComponent(threadId)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Failed to load project status");
        const result = await response.json() as GitStatus;
        if (!controller.signal.aborted) { setStatus(result); setError(false); }
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted && shouldPollGitStatus(panelOpen, dialogOpen, document.visibilityState === "visible")) {
          timer = window.setTimeout(() => void refresh(), 5000);
        }
      }
    }
    void refresh();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [threadId, revision, running, panelOpen, busy, dialogOpen]);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("focus", refresh);
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  async function openProject(target: string) {
    setActionError("");
    try {
      const response = await fetch(`/api/thread/open?threadId=${encodeURIComponent(threadId)}&target=${target}`, {
        method: "POST", headers: { "content-type": "application/json" },
      });
      if (!response.ok) throw new Error(await response.text());
    } catch (error) {
      setActionError(error instanceof Error && error.message ? error.message : tr("无法打开项目", "Could not open project"));
    }
  }

  async function gitAction(input: { action: "switch"; branch: string } | { action: "checkout-remote"; ref: string } | { action: "create-branch"; branch: string; base: string } | { action: "commit"; message: string } | { action: "push" | "fetch" | "pull"; branch: string; remote: string; ref: string }) {
    const response = await fetch(`/api/thread/git-action?threadId=${encodeURIComponent(threadId)}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(await response.text());
  }

  async function switchTo(branch: string) {
    setBusy(true);
    setActionError("");
    try {
      await gitAction({ action: "switch", branch });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      setRevision((value) => value + 1);
    }
  }

  async function checkoutRemote(ref: string) {
    setBusy(true);
    setActionError("");
    try { await gitAction({ action: "checkout-remote", ref }); }
    catch (error) { setActionError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); setRevision((value) => value + 1); }
  }

  async function createNewBranch() {
    if (!status?.branch) return;
    setBusy(true);
    setActionError("");
    try {
      await gitAction({ action: "create-branch", branch: newBranch.trim(), base: status.branch });
      setNewBranch("");
      setBranchDialog(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      setRevision((value) => value + 1);
    }
  }

  async function commit(push: boolean) {
    const target = status?.pushTarget;
    if (push && !target) return;
    setBusy(true);
    setActionError("");
    let committed = false;
    try {
      await gitAction({ action: "commit", message: commitMessage });
      committed = true;
      setCommitMessage("");
      setCommitDialog(false);
      if (push && target) await gitAction({ action: "push", ...target });
    } catch (error) {
      setActionError(`${committed ? tr("提交已创建，但推送失败：", "Commit created, but push failed: ") : ""}${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
      setRevision((value) => value + 1);
    }
  }

  async function push() {
    const target = status?.pushTarget;
    if (!target) return;
    setBusy(true);
    setActionError("");
    try {
      await gitAction({ action: "push", ...target });
      setPushDialog(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      setRevision((value) => value + 1);
    }
  }

  async function sync(action: "fetch" | "pull") {
    const target = status?.pushTarget;
    if (!target) return;
    setBusy(true);
    setActionError("");
    try {
      await gitAction({ action, ...target });
      setPullDialog(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      setRevision((value) => value + 1);
    }
  }

  const card = (
        <div className="max-h-[min(70vh,42rem)] overflow-y-auto rounded-2xl border bg-background p-2 text-[13px] shadow-sm">
          <div className="flex min-h-8 items-center gap-3 px-2" title={cwd}>
            <MonitorIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{status?.hostname ?? tr("本机", "Local")}</span>
            <Button variant="ghost-muted" size="icon-xs" aria-label={tr("打开项目文件夹", "Open project folder")} onClick={() => void openProject("folder")}><FolderIcon /></Button>
          </div>
          <div className="flex items-center rounded-md hover:bg-accent" role="group" aria-label={tr("打开编辑器", "Open in editor")}>
            <button type="button" disabled={!activeEditor} className="flex min-h-8 min-w-0 flex-1 items-center gap-3 px-2 text-left disabled:opacity-50" onClick={() => { if (activeEditor) void openProject(activeEditor.id); }}><Code2Icon className="size-4 shrink-0 text-sky-600" /><span className="truncate">{activeEditor ? tr(`在 ${activeEditor.label} 中打开`, `Open in ${activeEditor.label}`) : editorLoading ? tr("正在检测编辑器…", "Detecting editors…") : tr("未检测到编辑器", "No editor found")}</span></button>
            <Menu><MenuTrigger render={<button type="button" aria-label={tr("选择编辑器", "Choose editor")} className="rounded-md p-2 hover:bg-accent" />}><ChevronDownIcon className="size-4 text-muted-foreground" /></MenuTrigger><MenuPopup align="end" className="w-56">{editors.length ? editors.map((editor) => <MenuItem key={editor.id} onClick={() => setPreferredEditor(editor.id)}><Code2Icon className="size-4 text-muted-foreground" /><span className="flex-1">{editor.label}</span>{activeEditor?.id === editor.id && <CheckIcon className="size-4" />}</MenuItem>) : <MenuItem disabled>{editorLoading ? tr("正在检测编辑器…", "Detecting editors…") : tr("未检测到编辑器", "No editors found")}</MenuItem>}</MenuPopup></Menu>
          </div>
          <ProjectScriptsControl threadId={threadId} onShowOutput={onShowScriptOutput} />
          {actionError && <div role="alert" className="break-words px-2 py-2 text-destructive">{actionError}</div>}
          <div className="border-t pt-2">
            {error ? <div className="px-2 py-2 text-destructive">{tr("无法加载项目状态", "Could not load project status")}</div> : status?.branch ? (
              <>
                <Menu onOpenChange={(open) => { if (!open) setBranchQuery(""); }}>
                  <MenuTrigger render={<button type="button" disabled={busy} className="flex min-h-8 w-full items-center gap-3 rounded-md px-2 text-left hover:bg-accent" />}>
                    <GitBranchIcon className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{status.branch}</span><ChevronDownIcon className="size-4 text-muted-foreground" />
                  </MenuTrigger>
                  <MenuPopup align="end" className="w-56">
                    <MenuSearchInput aria-label={tr("搜索分支", "Search branches")} placeholder={tr("搜索分支", "Search branches")} value={branchQuery} onValueChange={setBranchQuery} />
                    <div className="px-2 py-1 text-xs font-medium text-muted-foreground">{tr("本地分支", "Local branches")}</div>
                    {status.branches.filter((branch) => branch.toLowerCase().includes(branchQuery.toLowerCase())).map((branch) => <MenuItem key={branch} disabled={branch === status.branch} onClick={() => void switchTo(branch)}><span className="min-w-0 flex-1 truncate">{branch}</span>{branch === status.branch && <CheckIcon className="size-4" />}</MenuItem>)}
                    {status.branches.filter((branch) => branch.toLowerCase().includes(branchQuery.toLowerCase())).length === 0 && <div className="px-2 py-1 text-muted-foreground">{tr("没有匹配的本地分支", "No matching local branches")}</div>}
                    {status.remoteBranches.some((branch) => branch.name.toLowerCase().includes(branchQuery.toLowerCase())) && <><MenuSeparator /><div className="px-2 py-1 text-xs font-medium text-muted-foreground">{tr("远程分支", "Remote branches")}</div>{status.remoteBranches.filter((branch) => branch.name.toLowerCase().includes(branchQuery.toLowerCase())).map((branch) => <MenuItem key={branch.ref} disabled={status.branches.includes(branch.localName)} title={status.branches.includes(branch.localName) ? tr("本地同名分支已存在", "A local branch with this name already exists") : undefined} onClick={() => void checkoutRemote(branch.ref)}><span className="min-w-0 flex-1 truncate">{branch.name}</span></MenuItem>)}</>}
                    <MenuSeparator /><MenuItem onClick={() => { setActionError(""); setNewBranch(branchQuery.trim()); setBranchDialog(true); }}><PlusIcon className="size-4" />{tr("新建分支", "Create branch")}</MenuItem>
                  </MenuPopup>
                </Menu>
                <div className="flex items-center rounded-md hover:bg-accent">
                  <button type="button" disabled={busy || (status.files.length === 0 && (diverged || !status.pushTarget || (status.pushTarget.ahead === 0 && !status.pushTarget.behind)))} className="flex min-h-8 min-w-0 flex-1 items-center gap-3 px-2 text-left disabled:opacity-50" onClick={() => { setActionError(""); status.files.length ? setCommitDialog(true) : status.pushTarget?.behind && !status.pushTarget.ahead ? setPullDialog(true) : setPushDialog(true); }}><CloudUploadIcon className="size-4 text-muted-foreground" /><span className="truncate">{status.files.length ? status.pushTarget ? tr("提交并推送", "Commit & push") : tr("提交", "Commit") : diverged ? tr("分支已分叉", "Branch diverged") : status.pushTarget?.behind && !status.pushTarget.ahead ? tr("拉取", "Pull") : tr("推送", "Push")}</span></button>
                  <Menu><MenuTrigger render={<button type="button" disabled={busy} aria-label={tr("Git 操作", "Git actions")} className="rounded-md p-2 hover:bg-accent disabled:opacity-50" />}><ChevronDownIcon className="size-4 text-muted-foreground" /></MenuTrigger><MenuPopup align="end"><MenuItem disabled={busy || status.files.length === 0} onClick={() => { setActionError(""); setCommitDialog(true); }}>{tr("提交", "Commit")}</MenuItem><MenuItem disabled={busy || !status.pushTarget || status.pushTarget.ahead === 0} onClick={() => { setActionError(""); setPushDialog(true); }}>{tr("推送", "Push")}</MenuItem><MenuItem disabled={busy || !status.pushTarget?.hasUpstream} onClick={() => { setActionError(""); setPullDialog(true); }}>{tr("拉取", "Pull")}</MenuItem><MenuItem disabled={busy || !status.pushTarget} onClick={() => void sync("fetch")}>{tr("刷新远程状态", "Fetch remote")}</MenuItem></MenuPopup></Menu>
                </div>
                {status.pushTarget?.hasUpstream && (status.pushTarget.ahead || status.pushTarget.behind) ? <div className="px-2 pb-1 pl-9 text-[11px] text-muted-foreground">{status.pushTarget.ahead ? `↑${status.pushTarget.ahead}` : ""} {status.pushTarget.behind ? `↓${status.pushTarget.behind}` : ""}</div> : null}
                <button type="button" className="flex min-h-8 w-full items-center gap-3 rounded-md px-2 text-left hover:bg-accent" onClick={() => { setPopoverOpen(false); onShowFilesChange(true); }}>
                  <FileDiffIcon className="size-4 text-muted-foreground" /><span className="flex-1">{tr("变更", "Changes")} ({status.files.length})</span><span title={status.statsIncomplete ? tr("部分文件未计入统计", "Some files are excluded from the count") : undefined} className="text-emerald-600">{status.statsIncomplete ? "≥" : ""}+{status.additions}</span><span className="text-red-600">−{status.deletions}</span>
                </button>
              </>
            ) : <div className="px-2 py-2 text-muted-foreground">{status ? tr("不是 Git 仓库", "Not a Git repository") : tr("正在加载…", "Loading…")}</div>}
          </div>
        </div>
  );
  return (
    <>
      {inline ? <><Button variant="ghost-muted" size="icon-xs" aria-label={tr("切换项目面板", "Toggle project panel")} title={tr("切换项目面板", "Toggle project panel")} aria-expanded={inlineOpen} aria-pressed={inlineOpen} className={inlineOpen ? "bg-accent" : undefined} onClick={() => onInlineOpenChange(!inlineOpen)}><SquareMenuIcon /></Button>{inlineOpen && <aside aria-label={tr("项目详情", "Project details")} className="absolute right-3 top-[calc(var(--workspace-topbar-height)+0.75rem)] z-20 w-[280px]">{card}</aside>}</> : <Popover open={popoverOpen} onOpenChange={setPopoverOpen}><PopoverTrigger render={<Button variant="ghost-muted" size="icon-xs" aria-label={tr("切换项目面板", "Toggle project panel")} title={tr("切换项目面板", "Toggle project panel")} aria-pressed={popoverOpen} className={popoverOpen ? "bg-accent" : undefined} />}><SquareMenuIcon /></PopoverTrigger><PopoverPopup align="end" width="auto" padding="none" className="w-[min(280px,calc(100vw-2rem))] border-0 bg-transparent shadow-none"><div aria-label={tr("项目详情", "Project details")}>{card}</div></PopoverPopup></Popover>}
      <ChangesDialog threadId={threadId} files={status?.files ?? []} open={showFiles} onOpenChange={onShowFilesChange} onShowTerminal={onShowTerminal} />
      <Dialog open={branchDialog} onOpenChange={(next) => { if (!busy) setBranchDialog(next); }}>
        <DialogPopup><DialogHeader><DialogTitle>{tr("新建分支", "Create branch")}</DialogTitle><DialogDescription>{tr("从当前提交创建并切换到新分支。", "Create and switch to a branch from the current commit.")}</DialogDescription></DialogHeader><DialogPanel><label className="block text-sm font-medium" htmlFor="branch-name">{tr("分支名称", "Branch name")}</label><input id="branch-name" autoFocus value={newBranch} onChange={(event) => setNewBranch(event.target.value)} className="mt-2 h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />{actionError && <p role="alert" className="mt-2 break-words text-sm text-destructive">{actionError}</p>}</DialogPanel><DialogFooter><Button variant="ghost" disabled={busy} onClick={() => setBranchDialog(false)}>{tr("取消", "Cancel")}</Button><Button disabled={busy || !newBranch.trim()} onClick={() => void createNewBranch()}>{tr("创建分支", "Create branch")}</Button></DialogFooter></DialogPopup>
      </Dialog>
      <Dialog open={commitDialog} onOpenChange={(next) => { if (!busy) setCommitDialog(next); }}>
        <DialogPopup>
          <DialogHeader><DialogTitle>{tr("提交变更", "Commit changes")}</DialogTitle><DialogDescription>{tr("将暂存整个仓库的所有变更，包括未跟踪文件。", "All changes in the repository, including untracked files, will be staged.")}</DialogDescription></DialogHeader>
          <DialogPanel><label className="block text-sm font-medium" htmlFor="commit-message">{tr("提交信息", "Commit message")}</label><input id="commit-message" autoFocus value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} className="mt-2 h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />{status?.pushTarget && <p className="mt-2 break-all text-xs text-muted-foreground">{tr("推送目标", "Push target")}: {status.pushTarget.remote} / {status.pushTarget.ref}</p>}{actionError && <p role="alert" className="mt-2 break-words text-sm text-destructive">{actionError}</p>}</DialogPanel>
          <DialogFooter><Button variant="ghost" disabled={busy} onClick={() => setCommitDialog(false)}>{tr("取消", "Cancel")}</Button><Button variant="secondary" disabled={busy || !commitMessage.trim()} onClick={() => void commit(false)}>{tr("提交", "Commit")}</Button>{status?.pushTarget && <Button disabled={busy || !commitMessage.trim()} onClick={() => void commit(true)}>{tr("提交并推送", "Commit & push")}</Button>}</DialogFooter>
        </DialogPopup>
      </Dialog>
      <Dialog open={pushDialog} onOpenChange={(next) => { if (!busy) setPushDialog(next); }}>
        <DialogPopup><DialogHeader><DialogTitle>{tr("推送分支", "Push branch")}</DialogTitle><DialogDescription>{tr("推送当前分支的提交到以下目标。", "Push commits from the current branch to this destination.")}</DialogDescription></DialogHeader><DialogPanel><p className="break-all text-sm">{status?.pushTarget?.branch} → {status?.pushTarget?.remote} / {status?.pushTarget?.ref}</p>{status?.pushTarget && !status.pushTarget.hasUpstream && <p className="mt-2 text-xs text-muted-foreground">{tr("首次推送将设置上游分支。", "The upstream branch will be set on first push.")}</p>}{actionError && <p role="alert" className="mt-2 break-words text-sm text-destructive">{actionError}</p>}</DialogPanel><DialogFooter><Button variant="ghost" disabled={busy} onClick={() => setPushDialog(false)}>{tr("取消", "Cancel")}</Button><Button disabled={busy || !status?.pushTarget} onClick={() => void push()}>{tr("推送", "Push")}</Button></DialogFooter></DialogPopup>
      </Dialog>
      <Dialog open={pullDialog} onOpenChange={(next) => { if (!busy) setPullDialog(next); }}>
        <DialogPopup><DialogHeader><DialogTitle>{tr("拉取分支", "Pull branch")}</DialogTitle><DialogDescription>{tr("从上游拉取更新，仅在可以快进时更新当前分支。", "Pull updates from upstream only when the current branch can be fast-forwarded.")}</DialogDescription></DialogHeader><DialogPanel><p className="break-all text-sm">{status?.pushTarget?.remote} / {status?.pushTarget?.ref} → {status?.pushTarget?.branch}</p>{actionError && <p role="alert" className="mt-2 break-words text-sm text-destructive">{actionError}</p>}</DialogPanel><DialogFooter><Button variant="ghost" disabled={busy} onClick={() => setPullDialog(false)}>{tr("取消", "Cancel")}</Button><Button disabled={busy || !status?.pushTarget?.hasUpstream} onClick={() => void sync("pull")}>{tr("拉取", "Pull")}</Button></DialogFooter></DialogPopup>
      </Dialog>
    </>
  );
}

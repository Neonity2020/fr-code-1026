import { useCallback, useEffect, useState } from "react";
import { BugIcon, ChevronDownIcon, DownloadIcon, FlaskConicalIcon, HammerIcon, ListChecksIcon, PlayIcon, PlusIcon, SettingsIcon, SquareIcon, WrenchIcon } from "lucide-react";
import { PROJECT_SCRIPT_ICONS, type ProjectScriptIcon } from "@pi-web/protocol";
import { useI18n } from "~/i18n";
import { Button } from "../ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "../ui/dialog";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "../ui/menu";

interface Script { id: string; name: string; command: string; icon?: ProjectScriptIcon }
interface Job { name: string; output: string; running: boolean; exitCode: number | null; stopped: boolean; error: string | null }
interface ScriptState { scripts: Script[]; fileScripts: { name: string; command: string; icon: ProjectScriptIcon }[]; fileError: string | null; job: Job | null }
const icons = { play: PlayIcon, test: FlaskConicalIcon, lint: ListChecksIcon, configure: WrenchIcon, build: HammerIcon, debug: BugIcon };
function ScriptIcon({ icon }: { icon?: ProjectScriptIcon }) {
  const Icon = icons[icon ?? "play"] ?? PlayIcon;
  return <Icon className="size-4 shrink-0 text-muted-foreground" />;
}

export function ProjectScriptsControl({ threadId, onShowOutput }: { threadId: string; onShowOutput: () => void }) {
  const { tr } = useI18n();
  const [data, setData] = useState<ScriptState>({ scripts: [], fileScripts: [], fileError: null, job: null });
  const [editor, setEditor] = useState<{ id?: string; name: string; command: string; icon?: ProjectScriptIcon } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/thread/scripts?threadId=${encodeURIComponent(threadId)}`, { signal });
    if (!response.ok) throw new Error(await response.text());
    setData(await response.json() as ScriptState);
  }, [threadId]);

  useEffect(() => {
    const controller = new AbortController();
    setData({ scripts: [], fileScripts: [], fileError: null, job: null });
    setError("");
    void load(controller.signal).catch((reason: unknown) => { if (!controller.signal.aborted) setError(String(reason)); });
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (!data.job?.running) return;
    const timer = window.setInterval(() => void load().catch((reason: unknown) => setError(String(reason))), 1000);
    return () => window.clearInterval(timer);
  }, [data.job?.running, load]);

  async function act(input: Record<string, string>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/thread/scripts?threadId=${encodeURIComponent(threadId)}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error(await response.text());
      setData(await response.json() as ScriptState);
      if (input.action === "save" || input.action === "delete") { setEditor(null); setDeleting(false); }
      if (input.action === "run") onShowOutput();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setBusy(false); }
  }

  const primary = data.scripts[0];
  const row = "flex min-h-8 w-full items-center gap-3 rounded-md px-2 text-left hover:bg-accent disabled:opacity-50";
  return (
    <>
      {primary || data.fileScripts.length > 0 ? <div className="flex items-center">
        {primary ? <button type="button" className={row} disabled={busy || data.job?.running} onClick={() => void act({ action: "run", id: primary.id })}><ScriptIcon icon={primary.icon} /><span className="min-w-0 flex-1 truncate">{primary.name}</span></button> : <button type="button" className={row} onClick={() => { setDeleting(false); setEditor({ name: "", command: "" }); }}><PlusIcon className="size-4 text-muted-foreground" /><span>{tr("添加项目脚本", "Add project script")}</span></button>}
        <Menu><MenuTrigger render={<button type="button" aria-label={tr("项目脚本菜单", "Project scripts menu")} className="rounded-md p-2 hover:bg-accent" />}><ChevronDownIcon className="size-4 text-muted-foreground" /></MenuTrigger>
          <MenuPopup align="end" className="w-56">{data.scripts.map((script) => <MenuItem key={script.id} disabled={busy || data.job?.running} onClick={() => void act({ action: "run", id: script.id })}><ScriptIcon icon={script.icon} /><span className="truncate">{script.name}</span></MenuItem>)}{data.scripts.length > 0 && <MenuSeparator />}{data.scripts.map((script) => <MenuItem key={`edit-${script.id}`} onClick={() => { setDeleting(false); setEditor(script); }}><SettingsIcon className="size-4" /><span className="truncate">{tr("编辑", "Edit")} {script.name}</span></MenuItem>)}<MenuItem onClick={() => { setDeleting(false); setEditor({ name: "", command: "" }); }}><PlusIcon className="size-4" />{tr("添加项目脚本", "Add project script")}</MenuItem>{data.fileScripts.length > 0 && <><MenuSeparator /><div className="px-2 py-1 text-xs text-muted-foreground">{tr("从 t3.json 导入脚本", "Import scripts from t3.json")}</div>{data.fileScripts.map((script) => <MenuItem key={`${script.name}\0${script.command}`} disabled={busy} onClick={() => void act({ action: "import", ...script })}><DownloadIcon className="size-4" /><span className="truncate">{script.name}</span></MenuItem>)}</>}</MenuPopup>
        </Menu>
      </div> : <button type="button" className={row} onClick={() => { setDeleting(false); setEditor({ name: "", command: "" }); }}><PlusIcon className="size-4 text-muted-foreground" /><span>{tr("添加项目脚本", "Add project script")}</span></button>}
      {data.job && <div className="px-2 pb-2"><div className="flex items-center gap-2"><button type="button" className="min-w-0 flex-1 truncate text-left text-muted-foreground hover:text-foreground" onClick={onShowOutput}>{data.job.name} · {data.job.running ? tr("运行中", "Running") : data.job.stopped ? tr("已停止", "Stopped") : data.job.exitCode === 0 ? tr("已完成", "Completed") : data.job.exitCode !== null ? tr(`失败（退出码 ${data.job.exitCode}）`, `Failed (exit ${data.job.exitCode})`) : tr("失败", "Failed")}</button>{data.job.running && <button type="button" disabled={busy} aria-label={tr("停止脚本", "Stop script")} onClick={() => void act({ action: "stop" })}><SquareIcon className="size-3.5" /></button>}</div></div>}
      {error && !editor && <p role="alert" className="break-words px-2 py-1 text-destructive">{error}</p>}
      {data.fileError && <p role="status" className="break-words px-2 py-1 text-muted-foreground">t3.json: {data.fileError}</p>}
      <Dialog open={editor !== null} onOpenChange={(open) => { if (!open && !busy) { setEditor(null); setError(""); } }}>
        <DialogPopup><DialogHeader><DialogTitle>{editor?.id ? tr("编辑项目脚本", "Edit project script") : tr("添加项目脚本", "Add project script")}</DialogTitle><DialogDescription>{tr("在项目目录中运行 shell 命令。", "Run a shell command in the project directory.")}</DialogDescription></DialogHeader>
          <DialogPanel><label htmlFor="script-name" className="block text-sm font-medium">{tr("名称", "Name")}</label><input id="script-name" value={editor?.name ?? ""} onChange={(event) => setEditor((current) => current && { ...current, name: event.target.value })} className="mt-2 h-9 w-full rounded-md border bg-background px-3 text-sm" autoFocus /><label htmlFor="script-command" className="mt-4 block text-sm font-medium">{tr("命令", "Command")}</label><input id="script-command" value={editor?.command ?? ""} onChange={(event) => setEditor((current) => current && { ...current, command: event.target.value })} className="mt-2 h-9 w-full rounded-md border bg-background px-3 font-mono text-sm" /><label htmlFor="script-icon" className="mt-4 block text-sm font-medium">{tr("图标", "Icon")}</label><select id="script-icon" value={editor?.icon ?? "play"} onChange={(event) => setEditor((current) => current && { ...current, icon: event.target.value as ProjectScriptIcon })} className="mt-2 h-9 w-full rounded-md border bg-background px-3 text-sm">{PROJECT_SCRIPT_ICONS.map((icon) => <option key={icon} value={icon}>{({ play: tr("运行", "Play"), test: tr("测试", "Test"), lint: tr("检查", "Lint"), configure: tr("配置", "Configure"), build: tr("构建", "Build"), debug: tr("调试", "Debug") })[icon]}</option>)}</select>{error && <p role="alert" className="mt-2 break-words text-sm text-destructive">{error}</p>}{deleting && <p className="mt-2 text-sm">{tr("确定删除这个脚本？", "Delete this script?")}</p>}</DialogPanel>
          <DialogFooter>{editor?.id && <Button variant="destructive-outline" disabled={busy} onClick={() => deleting ? void act({ action: "delete", id: editor.id! }) : setDeleting(true)}>{deleting ? tr("确认删除", "Confirm delete") : tr("删除", "Delete")}</Button>}<Button variant="ghost" disabled={busy} onClick={() => { setEditor(null); setError(""); }}>{tr("取消", "Cancel")}</Button><Button disabled={busy || !editor?.name.trim() || !editor?.command.trim()} onClick={() => editor && void act({ action: "save", ...editor })}>{tr("保存", "Save")}</Button></DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}

import { useEffect, useRef, useState } from "react";
import { SquareIcon, TerminalIcon, XIcon } from "lucide-react";
import { useI18n } from "~/i18n";
import { Button } from "../ui/button";

interface Job { name: string; output: string; running: boolean; exitCode: number | null; stopped: boolean }

export function ScriptOutputDrawer({ threadId, revision, onClose }: { threadId: string; revision: number; onClose: () => void }) {
  const { tr } = useI18n();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const outputRef = useRef<HTMLPreElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const controller = new AbortController();
    pinned.current = true;
    let timer: number | undefined;
    async function load() {
      let shouldRetry = true;
      try {
        const response = await fetch(`/api/thread/scripts?threadId=${encodeURIComponent(threadId)}`, { signal: controller.signal });
        if (!response.ok) throw new Error(await response.text());
        const result = await response.json() as { job: Job | null };
        shouldRetry = Boolean(result.job?.running);
        if (!controller.signal.aborted) { setJob(result.job); setError(""); }
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (!controller.signal.aborted && shouldRetry) timer = window.setTimeout(() => void load(), 1000);
      }
    }
    setJob(null);
    void load();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [threadId, revision, refresh]);

  useEffect(() => {
    const output = outputRef.current;
    if (output && pinned.current) output.scrollTop = output.scrollHeight;
  }, [job?.output]);

  async function stop() {
    setBusy(true);
    try {
      const response = await fetch(`/api/thread/scripts?threadId=${encodeURIComponent(threadId)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "stop" }) });
      if (!response.ok) throw new Error(await response.text());
      setRefresh((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setBusy(false); }
  }

  const status = job?.running ? tr("运行中", "Running") : job?.stopped ? tr("已停止", "Stopped") : job?.exitCode === 0 ? tr("已完成", "Completed") : job?.exitCode != null ? tr(`失败（退出码 ${job.exitCode}）`, `Failed (exit ${job.exitCode})`) : tr("失败", "Failed");
  return <section aria-label={tr("脚本输出", "Script output")} className="flex h-[min(15rem,40vh)] min-h-0 shrink-0 flex-col border-t bg-(--terminal-background) text-(--terminal-foreground)">
    <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3 text-xs"><TerminalIcon className="size-4 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{job ? `${job.name} · ${status}` : tr("脚本输出", "Script output")}</span>{job?.running && <Button variant="ghost-muted" size="icon-xs" disabled={busy} onClick={() => void stop()} aria-label={tr("停止脚本", "Stop script")}><SquareIcon /></Button>}<Button variant="ghost-muted" size="icon-xs" onClick={onClose} aria-label={tr("关闭脚本输出", "Close script output")}><XIcon /></Button></div>
    {error && <p role="alert" className="px-3 py-2 text-xs text-destructive">{error}</p>}
    <pre ref={outputRef} onScroll={(event) => { const target = event.currentTarget; pinned.current = target.scrollHeight - target.scrollTop - target.clientHeight < 32; }} className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all p-3 font-mono text-xs leading-relaxed">{job ? job.output || tr("暂无输出", "No output yet") : tr("尚未运行项目脚本", "No project script has been run")}</pre>
  </section>;
}

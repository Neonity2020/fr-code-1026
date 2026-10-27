import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_SCRIPT_ICONS, type ProjectScriptIcon } from "@pi-web/protocol";

export interface ProjectScript { id: string; name: string; command: string; icon?: ProjectScriptIcon }
interface ScriptJob { name: string; output: string; running: boolean; exitCode: number | null; stopped: boolean; error: string | null; process: ChildProcess }

function resolveIcon(icon: unknown): ProjectScriptIcon {
  if (icon === undefined) return "play";
  if (typeof icon !== "string" || !PROJECT_SCRIPT_ICONS.includes(icon as ProjectScriptIcon)) throw new Error("Invalid script icon");
  return icon as ProjectScriptIcon;
}

export class ProjectScripts {
  private readonly file: string;
  private readonly jobs = new Map<string, ScriptJob>();

  constructor(dataDir: string) { this.file = join(dataDir, "project-scripts.json"); }

  private read(): Record<string, ProjectScript[]> {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.file, "utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid project scripts file");
      return parsed as Record<string, ProjectScript[]>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }

  list(cwd: string) { return this.read()[cwd] ?? []; }

  fileScripts(cwd: string) {
    const file = join(cwd, "t3.json");
    try {
      if (statSync(file).size > 1024 * 1024) throw new Error("t3.json is too large");
      const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid t3.json");
      const scripts: unknown = "scripts" in parsed ? parsed.scripts : [];
      if (!Array.isArray(scripts) || scripts.length > 50) throw new Error("Invalid scripts in t3.json");
      // shortcut: automatic script options are not imported, add them when the runner supports them.
      const fileScripts = scripts.map((item: unknown) => {
        if (!item || typeof item !== "object" || !("name" in item) || typeof item.name !== "string" || !("command" in item) || typeof item.command !== "string") throw new Error("Invalid scripts in t3.json");
        const name = item.name.trim();
        const command = item.command.trim();
        if (!name || !command || name.length > 200 || command.length > 4000) throw new Error("Invalid scripts in t3.json");
        return { name, command, icon: resolveIcon("icon" in item ? item.icon : undefined) };
      });
      const saved = this.list(cwd);
      return { fileScripts: fileScripts.filter((script) => !saved.some((item) => item.command === script.command || item.name.toLowerCase() === script.name.toLowerCase())), fileError: null };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { fileScripts: [], fileError: null };
      return { fileScripts: [], fileError: error instanceof Error ? error.message : String(error) };
    }
  }

  importFileScript(cwd: string, name: string, command: string) {
    const { fileScripts } = this.fileScripts(cwd);
    const script = fileScripts.find((item) => item.name === name && item.command === command);
    if (!script) throw new Error("Script changed or has already been imported; refresh and try again");
    return this.save(cwd, script);
  }

  save(cwd: string, script: { id?: string; name: string; command: string; icon?: unknown }) {
    const name = script.name.trim();
    const command = script.command.trim();
    if (!name || !command || name.length > 200 || command.length > 4000) throw new Error("A name and command are required");
    const all = this.read();
    const scripts = all[cwd] ?? [];
    const index = script.id ? scripts.findIndex((item) => item.id === script.id) : -1;
    if (script.id && index < 0) throw new Error("Script not found");
    const saved = { id: script.id ?? randomUUID(), name, command, icon: resolveIcon(script.icon) };
    if (index < 0) scripts.push(saved); else scripts[index] = saved;
    all[cwd] = scripts;
    this.write(all);
    return saved;
  }

  delete(cwd: string, id: string) {
    const all = this.read();
    const scripts = all[cwd] ?? [];
    if (!scripts.some((item) => item.id === id)) throw new Error("Script not found");
    all[cwd] = scripts.filter((item) => item.id !== id);
    this.write(all);
  }

  private write(all: Record<string, ProjectScript[]>) {
    const temp = `${this.file}.${randomUUID()}.tmp`;
    writeFileSync(temp, JSON.stringify(all, null, 2), { mode: 0o600 });
    renameSync(temp, this.file);
  }

  status(threadId: string) {
    const job = this.jobs.get(threadId);
    return job ? { name: job.name, output: job.output, running: job.running, exitCode: job.exitCode, stopped: job.stopped, error: job.error } : null;
  }

  run(threadId: string, cwd: string, id: string) {
    const script = this.list(cwd).find((item) => item.id === id);
    if (!script) throw new Error("Script not found");
    if (this.jobs.get(threadId)?.running) throw new Error("A script is already running in this thread");
    const child = spawn(script.command, { cwd, shell: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    const job: ScriptJob = { name: script.name, output: "", running: true, exitCode: null, stopped: false, error: null, process: child };
    this.jobs.set(threadId, job);
    // shortcut: retain only the last 100,000 characters, upgrade to a terminal buffer for full scrollback.
    const append = (data: Buffer) => { job.output = (job.output + data.toString()).slice(-100_000); };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.on("error", (error) => { job.error = error.message; job.output += `\n${error.message}`; job.running = false; });
    child.on("close", (code) => { job.running = false; job.exitCode = code; });
    return this.status(threadId);
  }

  stop(threadId: string) {
    const job = this.jobs.get(threadId);
    if (!job?.running || !job.process.pid) throw new Error("No script is running");
    if (process.platform === "win32") job.process.kill();
    else process.kill(-job.process.pid, "SIGTERM");
    job.stopped = true;
  }

  dispose() {
    for (const [threadId, job] of this.jobs) {
      if (job.running) {
        try { this.stop(threadId); } catch { /* process already exited */ }
      }
    }
  }
}

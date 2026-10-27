/**
 * pi-web 服务端入口：
 * - GET /ws            WebSocket（订阅快照/事件流 + dispatch 命令）
 * - GET /api/health    健康检查
 * - GET /api/config    默认 cwd + pi 安装状态
 * - GET /api/threads   线程列表
 * - 其余 GET           托管 apps/web/dist（SPA 回退）
 *
 * v1 无鉴权（本机使用）。协议语义（快照→事件→synchronized、afterSequence、
 * commandId 幂等）与 t3code 的 orchestration-v2 对齐。
 */
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import type { ClientMessage, ServerMessage } from "@pi-web/protocol";
import { PiThreadRunner, checkPiStatus } from "@pi-web/provider-pi";
import { ThreadStore, type ThreadSubscriber } from "./threads.ts";
import { countUntrackedLines, getFilePatch, parseGitStatus } from "./git-status.ts";
import { checkoutRemoteBranch, commitChanges, createBranch, getPushTarget, localBranches, pushBranch, remoteBranches, switchBranch, syncRemote } from "./git-actions.ts";
import { ProjectScripts } from "./project-scripts.ts";
import { availableEditors, editorLaunch } from "./editors.ts";
import { Terminals } from "./terminals.ts";

const PORT = Number(process.env.PORT ?? 6115);
const serverDir = path.dirname(fileURLToPath(import.meta.url)); // apps/server/src
const repoDir = path.resolve(serverDir, "../../..");
const dataDir = process.env.PI_WEB_DATA_DIR ?? path.join(repoDir, ".data");
const webDist = path.resolve(repoDir, "apps/web/dist");
const defaultCwd = process.env.PI_WEB_DEFAULT_CWD ?? process.cwd();
const homeDir = os.homedir();
const execFileAsync = promisify(execFile);

function expandHomePath(inputPath: string): string {
  const trimmed = inputPath.trim();
  if (trimmed === "~") return homeDir;
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.join(homeDir, trimmed.slice(2));
  }
  return trimmed;
}

function resolveHostProjectPath(rawPath: string, baseCwd: string = defaultCwd): string {
  const expanded = expandHomePath(rawPath);
  if (expanded.length === 0) return baseCwd;
  return path.isAbsolute(expanded) ? path.resolve(expanded) : path.resolve(baseCwd, expanded);
}

interface BrowseDirectoryEntry {
  name: string;
  fullPath: string;
  isGitRepo: boolean;
}

async function browseHostDirectories(partialPathRaw: string, baseCwd: string = defaultCwd) {
  const trimmed = partialPathRaw.trim();
  const effectiveRaw = trimmed.length === 0 ? `${ baseCwd.replace(/\/+$/, "") }/` : trimmed;
  const resolvedInputPath = resolveHostProjectPath(effectiveRaw, baseCwd);
  const endsWithSeparator = /[\\/]$/.test(effectiveRaw) || effectiveRaw === "~";
  const parentPath = endsWithSeparator ? resolvedInputPath : path.dirname(resolvedInputPath);
  const prefix = endsWithSeparator ? "" : path.basename(resolvedInputPath);

  let exists = false;
  try {
    const stat = await fsp.stat(resolvedInputPath);
    exists = stat.isDirectory();
  } catch {
    exists = false;
  }

  let dirents: fs.Dirent[] = [];
  let accessError: string | null = null;
  try {
    dirents = await fsp.readdir(parentPath, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code && code !== "ENOENT" && code !== "ENOTDIR") {
      accessError = (error as Error).message;
    }
  }

  const showHidden = prefix.startsWith(".");
  const lowerPrefix = prefix.toLowerCase();
  const entries: BrowseDirectoryEntry[] = [];

  for (const dirent of dirents) {
    if (!dirent.name.toLowerCase().startsWith(lowerPrefix)) continue;
    if (!showHidden && dirent.name.startsWith(".")) continue;
    const fullPath = path.join(parentPath, dirent.name);
    let isDirectory = dirent.isDirectory();
    if (!isDirectory && dirent.isSymbolicLink()) {
      try {
        isDirectory = (await fsp.stat(fullPath)).isDirectory();
      } catch {
        isDirectory = false;
      }
    }
    if (!isDirectory) continue;
    let isGitRepo = false;
    try {
      await fsp.lstat(path.join(fullPath, ".git"));
      isGitRepo = true;
    } catch {
      isGitRepo = false;
    }
    entries.push({ name: dirent.name, fullPath, isGitRepo });
  }

  entries.sort((left, right) => left.name.localeCompare(right.name));
  const upCandidate = path.dirname(parentPath);
  const canBrowseUp = upCandidate !== parentPath;

  return {
    parentPath,
    resolvedPath: resolvedInputPath,
    exists,
    canBrowseUp,
    upPath: canBrowseUp ? upCandidate : null,
    homeDir,
    accessError,
    entries,
  };
}

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  ".next",
  ".turbo",
  ".cache",
  ".data",
  ".pnpm-store",
  "target",
  "build",
]);

async function listDirectoryFiles(rootCwd: string, maxFiles = 1000): Promise<string[]> {
  const result: string[] = [];
  async function crawl(currentDir: string, relativeDir: string) {
    if (result.length >= maxFiles) return;
    let dirents: fs.Dirent[] = [];
    try {
      dirents = await fsp.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of dirents) {
      if (result.length >= maxFiles) break;
      if (d.name.startsWith(".") && d.name !== ".env") continue;
      if (d.isDirectory()) {
        if (!IGNORED_DIRS.has(d.name)) {
          await crawl(path.join(currentDir, d.name), relativeDir ? `${relativeDir}/${d.name}` : d.name);
        }
      } else if (d.isFile()) {
        result.push(relativeDir ? `${relativeDir}/${d.name}` : d.name);
      }
    }
  }
  await crawl(rootCwd, "");
  return result;
}

function pickFolderFromNativeDialog(options: {
  initialPath?: string;
  prompt?: string;
}): Promise<{ cancelled: boolean; path: string | null; error?: string }> {
  const promptText = (options.prompt ?? "Select project folder").replace(/["\\]/g, "\\$&");
  let validInitialDir: string | null = null;
  if (options.initialPath && options.initialPath.trim().length > 0) {
    const candidate = resolveHostProjectPath(options.initialPath);
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        validInitialDir = candidate;
      } else {
        const parent = path.dirname(candidate);
        if (fs.existsSync(parent) && fs.statSync(parent).isDirectory()) {
          validInitialDir = parent;
        }
      }
    } catch {
      validInitialDir = null;
    }
  }

  if (process.platform === "darwin") {
    const escapedDir = validInitialDir ? validInitialDir.replace(/["\\]/g, "\\$&") : null;
    const script = escapedDir
      ? `POSIX path of (choose folder with prompt "${promptText}" default location (POSIX file "${escapedDir}"))`
      : `POSIX path of (choose folder with prompt "${promptText}")`;
    return new Promise((resolve) => {
      execFile("osascript", ["-e", script], (error, stdout) => {
        if (error) {
          resolve({ cancelled: true, path: null });
          return;
        }
        const raw = stdout.trim();
        if (!raw) {
          resolve({ cancelled: true, path: null });
          return;
        }
        const normalized = raw.length > 1 ? raw.replace(/\/+$/, "") : raw;
        resolve({ cancelled: false, path: normalized });
      });
    });
  }

  if (process.platform === "linux") {
    const args = ["--file-selection", "--directory", `--title=${options.prompt ?? "Select project folder"}`];
    if (validInitialDir) {
      args.push(`--filename=${validInitialDir}/`);
    }
    return new Promise((resolve) => {
      execFile("zenity", args, (error, stdout) => {
        if (error) {
          resolve({ cancelled: true, path: null });
          return;
        }
        const raw = stdout.trim();
        if (!raw) {
          resolve({ cancelled: true, path: null });
          return;
        }
        resolve({ cancelled: false, path: raw.length > 1 ? raw.replace(/\/+$/, "") : raw });
      });
    });
  }

  return Promise.resolve({
    cancelled: true,
    path: null,
    error: "Native folder picker is not supported on this platform.",
  });
}

const store = new ThreadStore(dataDir, defaultCwd);
const projectScripts = new ProjectScripts(dataDir);
const terminals = new Terminals();
process.on("exit", () => { projectScripts.dispose(); terminals.dispose(); });
const runners = new Map<string, PiThreadRunner>();

const runnerFor = (threadId: string): PiThreadRunner | undefined => {
  let runner = runners.get(threadId);
  if (!runner) {
    const projection = store.get(threadId);
    if (!projection) return undefined;
    runner = new PiThreadRunner(store, threadId, () => store.get(threadId)?.summary.cwd ?? defaultCwd);
    runners.set(threadId, runner);
  }
  return runner;
};

// ---------- HTTP ----------

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname === "/api/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  if (url.pathname === "/api/config") {
    const force = url.searchParams.get("refresh") === "1" || url.searchParams.get("force") === "true";
    void checkPiStatus(process.env.PI_BIN ?? "pi", force).then((pi) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ defaultCwd, homeDir, projects: store.listProjects(), pi }));
    });
    return;
  }
  if (url.pathname === "/api/threads") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ threads: store.listThreads(), projects: store.listProjects() }));
    return;
  }
  if (url.pathname === "/api/editors" && request.method === "GET") {
    void availableEditors().then((editors) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ editors }));
    });
    return;
  }
  if (url.pathname === "/api/thread/scripts") {
    const threadId = url.searchParams.get("threadId") ?? "";
    const thread = store.get(threadId);
    if (!thread) { response.writeHead(404); response.end(); return; }
    if (request.method === "GET") {
      try {
        const result = { scripts: projectScripts.list(thread.summary.cwd), ...projectScripts.fileScripts(thread.summary.cwd), job: projectScripts.status(threadId) };
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(result));
      } catch (error) {
        response.writeHead(500, { "content-type": "text/plain" });
        response.end(error instanceof Error ? error.message : String(error));
      }
      return;
    }
    if (request.method !== "POST" || request.headers.origin !== `http://${request.headers.host}` || request.headers["content-type"] !== "application/json") {
      response.writeHead(403); response.end(); return;
    }
    let body = "";
    request.on("data", (chunk) => { body += String(chunk); if (body.length > 8192) request.destroy(); });
    request.on("end", () => {
      try {
        const input: unknown = JSON.parse(body);
        if (!input || typeof input !== "object" || !("action" in input)) throw new Error("Invalid action");
        if (input.action === "save" && "name" in input && typeof input.name === "string" && "command" in input && typeof input.command === "string" && (!("id" in input) || typeof input.id === "string")) {
          projectScripts.save(thread.summary.cwd, { name: input.name, command: input.command, ...("id" in input ? { id: input.id as string } : {}), ...("icon" in input ? { icon: input.icon } : {}) });
        } else if (input.action === "delete" && "id" in input && typeof input.id === "string") {
          projectScripts.delete(thread.summary.cwd, input.id);
        } else if (input.action === "import" && "name" in input && typeof input.name === "string" && "command" in input && typeof input.command === "string") {
          projectScripts.importFileScript(thread.summary.cwd, input.name, input.command);
        } else if (input.action === "run" && "id" in input && typeof input.id === "string") {
          projectScripts.run(threadId, thread.summary.cwd, input.id);
        } else if (input.action === "stop") {
          projectScripts.stop(threadId);
        } else throw new Error("Invalid action");
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ scripts: projectScripts.list(thread.summary.cwd), ...projectScripts.fileScripts(thread.summary.cwd), job: projectScripts.status(threadId) }));
      } catch (error) {
        response.writeHead(400, { "content-type": "text/plain" });
        response.end(error instanceof Error ? error.message : String(error));
      }
    });
    return;
  }
  if (url.pathname === "/api/thread/git" && request.method === "GET") {
    const thread = store.get(url.searchParams.get("threadId") ?? "");
    if (!thread) {
      response.writeHead(404);
      response.end();
      return;
    }
    const cwd = thread.summary.cwd;
    void (async () => {
      try {
        const git = async (...args: string[]) => (await execFileAsync("git", args, { cwd, maxBuffer: 4 * 1024 * 1024 })).stdout;
        const isRepo = await git("rev-parse", "--is-inside-work-tree").then((value) => value.trim() === "true", (error: unknown) => {
          if (error && typeof error === "object" && "stderr" in error && typeof error.stderr === "string" && error.stderr.includes("not a git repository")) return false;
          throw error;
        });
        if (!isRepo) {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ branch: null, files: [], additions: 0, deletions: 0, hostname: os.hostname() }));
          return;
        }
        const root = (await git("rev-parse", "--show-toplevel")).trim();
        const rootGit = async (...args: string[]) => (await execFileAsync("git", args, { cwd: root, maxBuffer: 4 * 1024 * 1024 })).stdout;
        const hasHead = await rootGit("rev-parse", "--verify", "HEAD").then(() => true, () => false);
        const [branch, status, diff, branches, remoteRefs, pushTarget] = await Promise.all([
          git("branch", "--show-current"),
          rootGit("status", "--porcelain=v1", "-z", "--untracked-files=all"),
          hasHead ? rootGit("diff", "--no-ext-diff", "--numstat", "HEAD") : Promise.all([rootGit("diff", "--no-ext-diff", "--numstat", "--cached"), rootGit("diff", "--no-ext-diff", "--numstat")]).then((parts) => parts.join("\n")),
          localBranches(cwd),
          remoteBranches(cwd),
          getPushTarget(cwd),
        ]);
        const stats = parseGitStatus(status, diff);
        const untracked = await countUntrackedLines(root, status);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ branch: branch.trim() || "HEAD", branches, remoteBranches: remoteRefs, pushTarget, ...stats, additions: stats.additions + untracked.additions, statsIncomplete: untracked.incomplete, hostname: os.hostname() }));
      } catch (error) {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
    })();
    return;
  }
  if (url.pathname === "/api/thread/diff" && request.method === "GET") {
    const thread = store.get(url.searchParams.get("threadId") ?? "");
    const file = url.searchParams.get("file");
    const mode = url.searchParams.get("mode") ?? "all";
    if (!thread || !file || (mode !== "all" && mode !== "staged" && mode !== "unstaged")) { response.writeHead(400); response.end(); return; }
    void getFilePatch(thread.summary.cwd, file, mode).then((result) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(result));
    }, (error: unknown) => {
      response.writeHead(400, { "content-type": "text/plain" });
      response.end(error instanceof Error ? error.message : String(error));
    });
    return;
  }
  if (url.pathname === "/api/thread/export" && request.method === "GET") {
    const thread = store.get(url.searchParams.get("threadId") ?? "");
    if (!thread) {
      response.writeHead(404);
      response.end();
      return;
    }
    const format = url.searchParams.get("format") ?? "markdown";
    const items = [...thread.items.values()].sort((a, b) => a.ordinal - b.ordinal);
    if (format === "json") {
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${encodeURIComponent(thread.summary.title || "thread")}.json"`,
      });
      response.end(JSON.stringify({ summary: thread.summary, items }, null, 2));
      return;
    }
    const lines: string[] = [
      `# ${thread.summary.title || "Thread"}`,
      "",
      `- **ID**: \`${thread.summary.id}\``,
      `- **Project**: \`${thread.summary.cwd}\``,
      `- **Model**: \`${thread.summary.model || "default"}\``,
      `- **Date**: ${new Date(thread.summary.createdAt).toISOString()}`,
      "",
      "---",
      "",
    ];
    for (const item of items) {
      switch (item.type) {
        case "user_message":
          lines.push(`### 👤 User`, "", item.text, "");
          if (item.attachments && item.attachments.length > 0) {
            lines.push("**Attachments:**");
            for (const att of item.attachments) {
              lines.push(`- \`${att.name}\` (${att.mimeType})`);
            }
            lines.push("");
          }
          break;
        case "assistant_message":
          lines.push(`### 🤖 Assistant`, "", item.text, "");
          break;
        case "reasoning":
          lines.push(`<details>`, `<summary>💭 Thought Process</summary>`, "", item.text, "", `</details>`, "");
          break;
        case "command_execution":
          lines.push(`> ⚡ **Command**: \`${item.input}\``, "");
          if (item.output) {
            lines.push("```", item.output, "```", "");
          }
          break;
        case "file_change":
          lines.push(`> 📝 **File Change**: \`${item.fileName}\``, "");
          if (item.diffStr) {
            lines.push("```diff", item.diffStr, "```", "");
          } else if (item.newStr) {
            lines.push("```", item.newStr, "```", "");
          }
          break;
        case "dynamic_tool":
          lines.push(`> 🔧 **Tool**: \`${item.toolName}\``, "");
          if (item.output) {
            lines.push("```", item.output, "```", "");
          }
          break;
      }
    }
    response.writeHead(200, {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${encodeURIComponent(thread.summary.title || "thread")}.md"`,
    });
    response.end(lines.join("\n"));
    return;
  }
  if (url.pathname === "/api/thread/files" && request.method === "GET") {
    const thread = store.get(url.searchParams.get("threadId") ?? "");
    if (!thread) {
      response.writeHead(404);
      response.end();
      return;
    }
    const cwd = thread.summary.cwd;
    void (async () => {
      try {
        let files: string[] = [];
        try {
          const stdout = (await execFileAsync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
            cwd,
            maxBuffer: 8 * 1024 * 1024,
          })).stdout;
          files = stdout.split("\n").filter((f) => f.length > 0 && !f.startsWith(".git/"));
        } catch {
          files = await listDirectoryFiles(cwd);
        }
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ files }));
      } catch (error) {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
    })();
    return;
  }
  if (url.pathname === "/api/thread/git-action" && request.method === "POST") {
    if (request.headers.origin !== `http://${request.headers.host}` || request.headers["content-type"] !== "application/json") {
      response.writeHead(403);
      response.end();
      return;
    }
    const thread = store.get(url.searchParams.get("threadId") ?? "");
    if (!thread) {
      response.writeHead(404);
      response.end();
      return;
    }
    let body = "";
    request.on("data", (chunk) => {
      body += String(chunk);
      if (body.length > 8192) request.destroy();
    });
    request.on("end", () => {
      void (async () => {
        try {
          const input: unknown = JSON.parse(body);
          if (!input || typeof input !== "object" || !("action" in input)) throw new Error("Invalid action");
          if (input.action === "switch" && "branch" in input && typeof input.branch === "string") {
            await switchBranch(thread.summary.cwd, input.branch);
          } else if (input.action === "checkout-remote" && "ref" in input && typeof input.ref === "string") {
            await checkoutRemoteBranch(thread.summary.cwd, input.ref);
          } else if (input.action === "create-branch" && "branch" in input && typeof input.branch === "string" && "base" in input && typeof input.base === "string") {
            await createBranch(thread.summary.cwd, input.branch, input.base);
          } else if (input.action === "commit" && "message" in input && typeof input.message === "string") {
            await commitChanges(thread.summary.cwd, input.message);
          } else if (input.action === "push" && "branch" in input && typeof input.branch === "string" && "remote" in input && typeof input.remote === "string" && "ref" in input && typeof input.ref === "string") {
            await pushBranch(thread.summary.cwd, { branch: input.branch, remote: input.remote, ref: input.ref });
          } else if ((input.action === "fetch" || input.action === "pull") && "branch" in input && typeof input.branch === "string" && "remote" in input && typeof input.remote === "string" && "ref" in input && typeof input.ref === "string") {
            await syncRemote(thread.summary.cwd, input.action, { branch: input.branch, remote: input.remote, ref: input.ref });
          } else {
            throw new Error("Invalid action");
          }
          response.writeHead(204);
          response.end();
        } catch (error) {
          response.writeHead(400, { "content-type": "text/plain" });
          response.end(error instanceof Error ? error.message : String(error));
        }
      })();
    });
    return;
  }
  if (url.pathname === "/api/thread/open" && request.method === "POST") {
    const origin = request.headers.origin;
    if (!origin || origin !== `http://${request.headers.host}` || request.headers["content-type"] !== "application/json") {
      response.writeHead(403);
      response.end();
      return;
    }
    const thread = store.get(url.searchParams.get("threadId") ?? "");
    const target = url.searchParams.get("target");
    if (!thread || !target) {
      response.writeHead(400);
      response.end();
      return;
    }
    const launch = editorLaunch(target, thread.summary.cwd, process.platform);
    if (!launch) {
      response.writeHead(400);
      response.end("Unknown editor or unsupported platform.");
      return;
    }
    void execFileAsync(launch.command, launch.args).then(() => {
      response.writeHead(204);
      response.end();
    }, (error: unknown) => {
      response.writeHead(500, { "content-type": "text/plain" });
      response.end(error instanceof Error ? error.message : String(error));
    });
    return;
  }
  if (url.pathname === "/api/fs/browse" && request.method === "GET") {
    const partialPath = url.searchParams.get("path") ?? "";
    const baseCwd = url.searchParams.get("cwd") ?? defaultCwd;
    void browseHostDirectories(partialPath, baseCwd)
      .then((result) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(result));
      })
      .catch((error: unknown) => {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      });
    return;
  }
  if (url.pathname === "/api/fs/pick-folder" && request.method === "POST") {
    let rawBody = "";
    request.on("data", (chunk) => {
      rawBody += String(chunk);
    });
    request.on("end", () => {
      let options: { initialPath?: string; prompt?: string } = {};
      if (rawBody.trim().length > 0) {
        try {
          options = JSON.parse(rawBody) as { initialPath?: string; prompt?: string };
        } catch {
          options = {};
        }
      }
      void pickFolderFromNativeDialog(options).then((result) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(result));
      });
    });
    return;
  }

  if (request.method !== "GET" || !fs.existsSync(webDist)) {
    response.writeHead(404);
    response.end("pi-web: web build not found (run `pnpm build` in apps/web)");
    return;
  }
  const relative = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "");
  let filePath = path.normalize(path.join(webDist, relative));
  if (!filePath.startsWith(webDist)) {
    response.writeHead(403);
    response.end();
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(webDist, "index.html");
  }
  response.writeHead(200, {
    "content-type": MIME[path.extname(filePath)] ?? "application/octet-stream",
  });
  fs.createReadStream(filePath).pipe(response);
});

// ---------- WebSocket ----------

const wss = new WebSocketServer({ noServer: true });
const terminalWss = new WebSocketServer({ noServer: true, maxPayload: 65536 });
server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname === "/ws") {
    wss.handleUpgrade(request, socket, head, (client) => wss.emit("connection", client, request));
    return;
  }
  if (url.pathname === "/ws/terminal") {
    const host = request.headers.host ?? "";
    let hostname = "";
    try { hostname = new URL(`http://${host}`).hostname; } catch { /* invalid host */ }
    const address = request.socket.remoteAddress ?? "";
    const localAddress = address === "::1" || address === "127.0.0.1" || address === "::ffff:127.0.0.1";
    const localHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
    if (!localAddress || !localHost || request.headers.origin !== `http://${host}` || !store.get(url.searchParams.get("threadId") ?? "")) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    terminalWss.handleUpgrade(request, socket, head, (client) => terminalWss.emit("connection", client, request));
    return;
  }
  socket.destroy();
});

terminalWss.on("connection", (socket, request) => {
  const url = new URL(request.url ?? "/", `http://localhost:${PORT}`);
  const threadId = url.searchParams.get("threadId") ?? "";
  const thread = store.get(threadId);
  if (!thread) { socket.close(); return; }
  try {
    const session = terminals.connect(threadId, thread.summary.cwd, (message) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    });
    socket.on("close", session.disconnect);
    socket.on("message", (raw) => {
      try {
        const message: unknown = JSON.parse(String(raw));
        if (!message || typeof message !== "object" || !("type" in message)) return;
        if (message.type === "input" && "data" in message && typeof message.data === "string" && message.data.length <= 32768) session.write(message.data);
        else if (message.type === "resize" && "cols" in message && "rows" in message && Number.isInteger(message.cols) && Number.isInteger(message.rows) && typeof message.cols === "number" && typeof message.rows === "number" && message.cols >= 2 && message.cols <= 300 && message.rows >= 2 && message.rows <= 300) session.resize(message.cols, message.rows);
        else if (message.type === "terminate") session.terminate();
      } catch { /* ignore malformed input or exited terminal */ }
    });
  } catch (error) {
    socket.send(JSON.stringify({ type: "error", message: error instanceof Error ? error.message : String(error) }));
    socket.close();
  }
});

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

wss.on("connection", (socket) => {
  const subscribed = new Set<string>();
  let listSubscribed = false;

  const subscriber: ThreadSubscriber = {
    sendEvent: (stored) => send(socket, { kind: "event", ...stored }),
    sendSnapshot: (projection) =>
      send(socket, {
        kind: "snapshot",
        threadId: projection.summary.id,
        snapshotSequence: projection.nextSequence - 1,
        items: [...projection.items.values()].sort((a, b) => a.ordinal - b.ordinal),
      }),
    sendSynchronized: (threadId) => send(socket, { kind: "synchronized", threadId }),
    sendThreads: (threads, projects) => send(socket, { kind: "threads", threads, projects }),
    sendProjects: (projects) => send(socket, { kind: "projects", projects }),
  };

  socket.on("close", () => {
    for (const threadId of subscribed) store.unsubscribe(threadId, subscriber);
    if (listSubscribed) store.unsubscribeThreads(subscriber);
  });

  socket.on("message", (raw) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(String(raw)) as ClientMessage;
    } catch {
      return;
    }
    switch (message.kind) {
      case "subscribe-threads": {
        listSubscribed = true;
        store.subscribeThreads(subscriber);
        return;
      }
      case "subscribe": {
        if (subscribed.has(message.threadId)) return;
        subscribed.add(message.threadId);
        const ok = store.subscribe(message.threadId, subscriber, message.afterSequence);
        if (!ok) send(socket, { kind: "nack", commandId: "", message: `unknown thread ${message.threadId}` });
        return;
      }
      case "unsubscribe": {
        subscribed.delete(message.threadId);
        store.unsubscribe(message.threadId, subscriber);
        return;
      }
      case "dispatch": {
        const { command, commandId } = message;
        try {
          switch (command.type) {
            case "thread.create": {
              const normalizedCwd = resolveHostProjectPath(command.cwd);
              try {
                fs.mkdirSync(normalizedCwd, { recursive: true });
              } catch {
                // ignore if read-only
              }
              store.createThread(normalizedCwd, command.title, {
                model: command.model,
                thinkingLevel: command.thinkingLevel,
              });
              send(socket, { kind: "ack", commandId });
              return;
            }
            case "thread.fork": {
              store.forkThread(command.sourceThreadId, command.title);
              send(socket, { kind: "ack", commandId });
              return;
            }
            case "thread.delete": {
              terminals.close(command.threadId);
              runnerFor(command.threadId)?.dispose();
              runners.delete(command.threadId);
              store.deleteThread(command.threadId);
              send(socket, { kind: "ack", commandId });
              return;
            }
            case "thread.rename": {
              const title = command.title.trim();
              if (title.length > 0) {
                store.updateSummary(command.threadId, { title }, { preserveUpdatedAt: true });
              }
              send(socket, { kind: "ack", commandId });
              return;
            }
            case "thread.set_model": {
              const existingRunner = runners.get(command.threadId);
              if (existingRunner) {
                void existingRunner.setModel(command.model, command.thinkingLevel);
              } else {
                store.updateSummary(
                  command.threadId,
                  {
                    model: command.model,
                    ...(command.thinkingLevel !== undefined
                      ? { thinkingLevel: command.thinkingLevel }
                      : {}),
                  },
                  { preserveUpdatedAt: true },
                );
              }
              send(socket, { kind: "ack", commandId });
              return;
            }
            case "thread.pin": {
              store.updateSummary(
                command.threadId,
                { pinnedAt: command.pinned ? Date.now() : null },
                { preserveUpdatedAt: true },
              );
              send(socket, { kind: "ack", commandId });
              return;
            }
            case "thread.settle": {
              store.updateSummary(
                command.threadId,
                {
                  settledAt: command.settled ? Date.now() : null,
                  ...(command.settled ? { snoozedUntil: null, wokeAt: null } : {}),
                },
                { preserveUpdatedAt: true },
              );
              send(socket, { kind: "ack", commandId });
              return;
            }
            case "thread.snooze": {
              const projection = store.get(command.threadId);
              const wasSnoozed = (projection?.summary.snoozedUntil ?? null) !== null;
              store.updateSummary(
                command.threadId,
                {
                  snoozedUntil: command.snoozedUntil,
                  ...(command.snoozedUntil !== null
                    ? { settledAt: null, wokeAt: null }
                    : { wokeAt: wasSnoozed ? Date.now() : null }),
                },
                { preserveUpdatedAt: true },
              );
              send(socket, { kind: "ack", commandId });
              return;
            }
            case "thread.acknowledge_woke": {
              store.updateSummary(
                command.threadId,
                { wokeAt: null },
                { preserveUpdatedAt: true },
              );
              send(socket, { kind: "ack", commandId });
              return;
            }
            case "thread.mark_read": {
              store.updateSummary(
                command.threadId,
                { unread: false },
                { preserveUpdatedAt: true },
              );
              send(socket, { kind: "ack", commandId });
              return;
            }
            case "project.add": {
              const normalizedCwd = resolveHostProjectPath(command.cwd);
              try {
                fs.mkdirSync(normalizedCwd, { recursive: true });
              } catch {
                // ignore if read-only
              }
              store.addProject(normalizedCwd);
              send(socket, { kind: "ack", commandId });
              return;
            }
            case "project.remove": {
              const normalizedCwd = resolveHostProjectPath(command.cwd);
              store.removeProject(normalizedCwd);
              send(socket, { kind: "ack", commandId });
              return;
            }
            case "message.send": {
              const runner = runnerFor(command.threadId);
              if (!runner) {
                send(socket, { kind: "nack", commandId, message: `unknown thread ${command.threadId}` });
                return;
              }
              const projection = store.get(command.threadId);
              if (
                projection &&
                (projection.summary.settledAt != null || projection.summary.snoozedUntil != null)
              ) {
                store.updateSummary(command.threadId, {
                  settledAt: null,
                  snoozedUntil: null,
                  wokeAt: null,
                });
              }
              void runner.sendMessage(command.text, {
                model: command.model,
                thinkingLevel: command.thinkingLevel,
                attachments: command.attachments,
              });
              send(socket, { kind: "ack", commandId });
              return;
            }
            case "thread.stop": {
              runnerFor(command.threadId)?.stop();
              send(socket, { kind: "ack", commandId });
              return;
            }
            case "approval.respond": {
              const ok =
                runnerFor(command.threadId)?.respondApproval(command.requestId, command.decision) ??
                false;
              if (ok) send(socket, { kind: "ack", commandId });
              else
                send(socket, {
                  kind: "nack",
                  commandId,
                  message: "approval request not pending",
                });
              return;
            }
            default: {
              send(socket, { kind: "nack", commandId, message: "unknown command" });
            }
          }
        } catch (error) {
          send(socket, {
            kind: "nack",
            commandId,
            message: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }
      default:
        return;
    }
  });
});

if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, () => {
    console.log(`[pi-web] server listening on http://localhost:${PORT}`);
    console.log(`[pi-web] data dir: ${dataDir}`);
    console.log(`[pi-web] web dist: ${webDist} (${fs.existsSync(webDist) ? "found" : "missing, run: pnpm --filter @pi-web/web build"})`);
  });
}

export { server, store, PORT };

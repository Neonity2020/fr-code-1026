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
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import type { ClientMessage, ServerMessage } from "@pi-web/protocol";
import { PiThreadRunner, checkPiStatus } from "@pi-web/provider-pi";
import { ThreadStore, type ThreadSubscriber } from "./threads.ts";

const PORT = Number(process.env.PORT ?? 6115);
const serverDir = path.dirname(fileURLToPath(import.meta.url)); // apps/server/src
const repoDir = path.resolve(serverDir, "../../..");
const dataDir = process.env.PI_WEB_DATA_DIR ?? path.join(repoDir, ".data");
const webDist = path.resolve(repoDir, "apps/web/dist");
const defaultCwd = process.env.PI_WEB_DEFAULT_CWD ?? process.cwd();
const homeDir = os.homedir();

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
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname === "/api/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  if (url.pathname === "/api/config") {
    void checkPiStatus().then((pi) => {
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

const wss = new WebSocketServer({ server, path: "/ws" });

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
            case "thread.delete": {
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

server.listen(PORT, () => {
  console.log(`[pi-web] server listening on http://localhost:${PORT}`);
  console.log(`[pi-web] data dir: ${dataDir}`);
  console.log(`[pi-web] web dist: ${webDist} (${fs.existsSync(webDist) ? "found" : "missing, run: pnpm --filter @pi-web/web build"})`);
});

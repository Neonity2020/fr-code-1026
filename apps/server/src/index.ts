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
import * as fs from "node:fs";
import * as http from "node:http";
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
      response.end(JSON.stringify({ defaultCwd, projects: store.listProjects(), pi }));
    });
    return;
  }
  if (url.pathname === "/api/threads") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ threads: store.listThreads(), projects: store.listProjects() }));
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
              store.createThread(command.cwd, command.title);
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
              store.addProject(command.cwd);
              send(socket, { kind: "ack", commandId });
              return;
            }
            case "project.remove": {
              store.removeProject(command.cwd);
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
              void runner.sendMessage(command.text);
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

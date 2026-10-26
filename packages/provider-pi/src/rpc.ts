/**
 * pi RPC 进程驱动：spawn `pi --mode rpc`，stdin/stdout 走 LF 分隔的 JSON 记录。
 * 协议形状取自 t3code `packages/provider-pi/src/server/rpc.ts` 与 `adapter.ts`。
 *
 * 注意：不能用 node:readline 分帧 —— 它会按 U+2028/U+2029 额外切行并损坏记录
 * （t3code rpc.ts 首行注释同款问题），这里手动按 \n 切分并去掉行尾 \r。
 */
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import type { PiModelInfo, PiStatus, PiThinkingLevel } from "@pi-web/protocol";

export type PiRecord = Record<string, unknown>;

const PI_THINKING_LEVELS: ReadonlyArray<PiThinkingLevel> = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

export function parsePiModelSlug(slug: string): { provider: string; modelId: string } | null {
  const separator = slug.indexOf("/");
  if (separator <= 0 || separator === slug.length - 1) return null;
  return { provider: slug.slice(0, separator), modelId: slug.slice(separator + 1) };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function supportedPiThinkingLevelsFromModel(model: unknown): PiThinkingLevel[] {
  if (!isObjectRecord(model) || model["reasoning"] !== true) return [];
  const rawMap = model["thinkingLevelMap"];
  const thinkingLevelMap = isObjectRecord(rawMap) ? rawMap : undefined;
  return PI_THINKING_LEVELS.filter((level) => {
    const mapped = thinkingLevelMap?.[level];
    if (mapped === null) return false;
    if (level === "xhigh" || level === "max") return mapped !== undefined;
    return true;
  });
}

export interface PiRpcSpawnOptions {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
}

export class PiRpcConnection extends EventEmitter {
  readonly #child: ChildProcessWithoutNullStreams;
  #buffer = "";
  #closed = false;
  readonly #pending = new Map<
    number,
    { resolve: (value: PiRecord) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >();
  #nextRequestId = 1;

  constructor(options: PiRpcSpawnOptions) {
    super();
    this.#child = spawn(options.command, [...options.args], {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
      // 独立进程组，终止时连子孙进程一起带走
      detached: process.platform !== "win32",
    });

    this.#child.stdout.setEncoding("utf8");
    this.#child.stdout.on("data", (chunk: string) => this.#onData(chunk));
    this.#child.stderr.setEncoding("utf8");
    this.#child.stderr.on("data", (chunk: string) => this.emit("stderr", chunk));
    this.#child.on("error", (error) => this.#onClose(error));
    this.#child.on("exit", (code, signal) => this.#onClose(new Error(`pi exited (${code ?? signal})`)));
  }

  static launch(
    cwd: string,
    env: NodeJS.ProcessEnv = process.env,
    extraArgs: ReadonlyArray<string> = [],
  ): PiRpcConnection {
    return new PiRpcConnection({
      command: process.env.PI_BIN ?? "pi",
      args: ["--mode", "rpc", ...extraArgs],
      cwd,
      env,
    });
  }

  #onData(chunk: string): void {
    this.#buffer += chunk;
    let newlineIndex = this.#buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = this.#buffer.slice(0, newlineIndex).replace(/\r$/, "");
      this.#buffer = this.#buffer.slice(newlineIndex + 1);
      if (line.trim().length > 0) this.#onLine(line);
      newlineIndex = this.#buffer.indexOf("\n");
    }
  }

  #onLine(line: string): void {
    let record: PiRecord;
    try {
      record = JSON.parse(line) as PiRecord;
    } catch {
      this.emit("unparsed", line);
      return;
    }
    // pi 对 request 的响应带 `id` 字段；事件没有
    const rawId = record["id"];
    const id = typeof rawId === "number" ? rawId : undefined;
    if (id !== undefined) {
      const pending = this.#pending.get(id);
      if (pending) {
        clearTimeout(pending.timer);
        this.#pending.delete(id);
        pending.resolve(record);
        return;
      }
    }
    this.emit("event", record);
  }

  #onClose(error: Error): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
    this.emit("close", error);
  }

  send(record: PiRecord): void {
    if (this.#closed) throw new Error("pi rpc connection is closed");
    this.#child.stdin.write(`${JSON.stringify(record)}\n`);
  }

  request(record: PiRecord, timeoutMs = 10_000): Promise<PiRecord> {
    return new Promise((resolve, reject) => {
      if (this.#closed) {
        reject(new Error("pi rpc connection is closed"));
        return;
      }
      const id = this.#nextRequestId;
      this.#nextRequestId += 1;
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`pi rpc request timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      this.#child.stdin.write(`${JSON.stringify({ ...record, id })}\n`);
    });
  }

  /** 终止整个进程组（pi 可能派生工具子进程） */
  terminate(): void {
    if (this.#closed) return;
    const pid = this.#child.pid;
    if (pid === undefined) return;
    try {
      if (process.platform !== "win32") {
        process.kill(-pid, "SIGTERM");
      } else {
        this.#child.kill("SIGTERM");
      }
    } catch {
      this.#child.kill("SIGTERM");
    }
    setTimeout(() => {
      try {
        if (process.platform !== "win32") process.kill(-pid, "SIGKILL");
        else this.#child.kill("SIGKILL");
      } catch {
        /* already dead */
      }
    }, 2_000).unref();
  }
}

export async function discoverPiModels(cwd = process.cwd()): Promise<{
  defaultModel?: string;
  defaultThinkingLevel?: PiThinkingLevel;
  models: PiModelInfo[];
}> {
  const conn = PiRpcConnection.launch(cwd, process.env, ["--no-session"]);
  try {
    const [stateRes, modelsRes] = await Promise.all([
      conn.request({ type: "get_state" }, 10_000),
      conn.request({ type: "get_available_models" }, 10_000),
    ]);

    const stateData = isObjectRecord(stateRes["data"]) ? stateRes["data"] : {};
    const activeModel = isObjectRecord(stateData["model"]) ? stateData["model"] : undefined;
    const activeProvider =
      activeModel && typeof activeModel["provider"] === "string"
        ? activeModel["provider"]
        : undefined;
    const activeId =
      activeModel && typeof activeModel["id"] === "string" ? activeModel["id"] : undefined;
    const defaultModel =
      activeProvider && activeId ? `${activeProvider}/${activeId}` : undefined;
    const rawThinking = stateData["thinkingLevel"];
    const defaultThinkingLevel =
      typeof rawThinking === "string" &&
      (PI_THINKING_LEVELS as ReadonlyArray<string>).includes(rawThinking)
        ? (rawThinking as PiThinkingLevel)
        : undefined;

    const modelsData = isObjectRecord(modelsRes["data"]) ? modelsRes["data"] : {};
    const rawModels = Array.isArray(modelsData["models"]) ? modelsData["models"] : [];
    const seen = new Set<string>();
    const models: PiModelInfo[] = [];

    for (const entry of rawModels) {
      if (!isObjectRecord(entry)) continue;
      const provider = typeof entry["provider"] === "string" ? entry["provider"].trim() : "";
      const id = typeof entry["id"] === "string" ? entry["id"].trim() : "";
      if (!provider || !id) continue;
      const slug = `${provider}/${id}`;
      if (seen.has(slug)) continue;
      seen.add(slug);
      const name =
        typeof entry["name"] === "string" && entry["name"].trim().length > 0
          ? entry["name"].trim()
          : id;
      const reasoning = entry["reasoning"] === true;
      const thinkingLevels = supportedPiThinkingLevelsFromModel(entry);
      const contextWindow =
        typeof entry["contextWindow"] === "number" && Number.isFinite(entry["contextWindow"])
          ? entry["contextWindow"]
          : undefined;
      models.push({
        slug,
        id,
        name,
        subProvider: provider,
        reasoning,
        thinkingLevels,
        ...(contextWindow !== undefined ? { contextWindow } : {}),
      });
    }

    return {
      ...(defaultModel ? { defaultModel } : {}),
      ...(defaultThinkingLevel ? { defaultThinkingLevel } : {}),
      models,
    };
  } finally {
    conn.terminate();
  }
}

let cachedPiStatus: PiStatus | undefined;

export async function checkPiStatus(piBin = process.env.PI_BIN ?? "pi"): Promise<PiStatus> {
  if (cachedPiStatus) return cachedPiStatus;
  const versionStatus = await new Promise<PiStatus>((resolve) => {
    execFile(piBin, ["--version"], { timeout: 5_000 }, (error, stdout) => {
      resolve(
        error
          ? { installed: false, error: error.message }
          : { installed: true, version: stdout.trim().split("\n")[0] },
      );
    });
  });

  if (!versionStatus.installed) {
    cachedPiStatus = versionStatus;
    return cachedPiStatus;
  }

  try {
    const discovered = await discoverPiModels();
    cachedPiStatus = {
      ...versionStatus,
      ...discovered,
    };
  } catch {
    cachedPiStatus = versionStatus;
  }

  return cachedPiStatus;
}

/**
 * pi RPC 进程驱动：spawn `pi --mode rpc`，stdin/stdout 走 LF 分隔的 JSON 记录。
 * 协议形状取自 t3code `packages/provider-pi/src/server/rpc.ts` 与 `adapter.ts`。
 *
 * 注意：不能用 node:readline 分帧 —— 它会按 U+2028/U+2029 额外切行并损坏记录
 * （t3code rpc.ts 首行注释同款问题），这里手动按 \n 切分并去掉行尾 \r。
 */
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import type { PiStatus } from "@pi-web/protocol";

export type PiRecord = Record<string, unknown>;

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

  static launch(cwd: string, env: NodeJS.ProcessEnv = process.env): PiRpcConnection {
    return new PiRpcConnection({
      command: process.env.PI_BIN ?? "pi",
      args: ["--mode", "rpc"],
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

let cachedPiStatus: PiStatus | undefined;

export function checkPiStatus(piBin = process.env.PI_BIN ?? "pi"): Promise<PiStatus> {
  if (cachedPiStatus) return Promise.resolve(cachedPiStatus);
  return new Promise((resolve) => {
    execFile(piBin, ["--version"], { timeout: 5_000 }, (error, stdout) => {
      cachedPiStatus = error
        ? { installed: false, error: error.message }
        : { installed: true, version: stdout.trim().split("\n")[0] };
      resolve(cachedPiStatus);
    });
  });
}

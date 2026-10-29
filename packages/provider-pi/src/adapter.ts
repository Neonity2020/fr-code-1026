/**
 * pi 事件 → 领域事件适配器。
 * 事件映射语义对齐 t3code `packages/provider-pi/src/server/adapter.ts`：
 * - message_update(text_delta/thinking_delta) → 流式 assistant_message / reasoning
 * - tool_execution_{start,update,end} → command_execution / file_change / dynamic_tool
 * - extension_ui_request(confirm) → approval_request，应答为 extension_ui_response
 * - agent_settled → 一轮结束，线程回 idle
 */
import { randomBytes } from "node:crypto";
import {
  firstLineTitle,
  type AttachmentItem,
  type DomainEvent,
  type PiThinkingLevel,
  type ThreadId,
  type ThreadStatus,
  type ThreadSummary,
  type ThreadSessionStats,
  type TurnItem,
  type TurnItemBase,
  type TurnItemStatus,
} from "@pi-web/protocol";
import { PiRpcConnection, parsePiModelSlug, type PiRecord } from "./rpc.ts";
import { foldAssistantUsage, markCompacted, statsFromSessionRpc, type PiUsageLike } from "./stats.ts";

export interface PiThreadStorePort {
  emit(threadId: ThreadId, event: DomainEvent): unknown;
  get(threadId: ThreadId):
    | {
        summary: ThreadSummary;
        items: ReadonlyMap<string, TurnItem>;
      }
    | undefined;
  updateSummary(
    threadId: ThreadId,
    patch: Partial<ThreadSummary>,
    options?: { preserveUpdatedAt?: boolean },
  ): void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const stringField = (record: unknown, key: string): string | undefined =>
  isRecord(record) && typeof record[key] === "string" ? record[key] : undefined;

const numberField = (record: unknown, key: string): number | undefined =>
  isRecord(record) && typeof record[key] === "number" && Number.isFinite(record[key])
    ? record[key]
    : undefined;

const field = (record: unknown, key: string): unknown =>
  isRecord(record) ? record[key] : undefined;

/** pi 工具输出 content 可能是 string 或 [{type:"text",text}] 数组 */
function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      isRecord(part) && typeof part["text"] === "string"
        ? part["text"]
        : JSON.stringify(part),
    )
    .filter((text) => text.length > 0)
    .join("\n");
}

interface PendingApproval {
  nativeId: number | string;
  turnItemId: string;
}

export class PiThreadRunner {
  readonly #store: PiThreadStorePort;
  readonly #threadId: ThreadId;
  readonly #getCwd: () => string;
  #conn: PiRpcConnection | undefined;
  #ordinal = 0;
  /** assistant 消息组序号（message_start 递增，保证流式 item id 稳定） */
  #assistantSeq = 0;
  #streaming = new Map<string, string>();
  #toolItems = new Map<string, string>();
  #toolArgs = new Map<string, unknown>();
  #pendingApprovals = new Map<string, PendingApproval>();
  #status: ThreadStatus = "idle";
  #appliedModel: string | null = null;
  #appliedThinking: PiThinkingLevel | null = null;
  /** 会话统计（上下文窗口 / 累计 token 与费用），喂给 t3code ContextWindowMeter 复刻 */
  #stats: ThreadSessionStats | null;
  readonly #resolveContextWindow:
    | ((modelSlug: string | null | undefined) => number | null)
    | undefined;

  constructor(
    store: PiThreadStorePort,
    threadId: ThreadId,
    getCwd: () => string,
    resolveContextWindow?: (modelSlug: string | null | undefined) => number | null,
  ) {
    this.#store = store;
    this.#threadId = threadId;
    this.#getCwd = getCwd;
    this.#resolveContextWindow = resolveContextWindow;
    this.#stats = store.get(threadId)?.summary.stats ?? null;
  }

  get status(): ThreadStatus {
    return this.#status;
  }

  #emitItem(item: TurnItem): void {
    this.#store.emit(this.#threadId, {
      type: "turn_item.updated",
      threadId: this.#threadId,
      turnItem: item,
    });
  }

  #upsertItem(item: TurnItem): void {
    this.#store.emit(this.#threadId, {
      type: "turn_item.updated",
      threadId: this.#threadId,
      turnItem: item,
    });
  }

  #setStatus(status: ThreadStatus): void {
    if (this.#status === status) return;
    this.#status = status;
    this.#store.updateSummary(this.#threadId, { status });
  }

  ensureProcess(): PiRpcConnection {
    if (this.#conn) return this.#conn;
    const conn = PiRpcConnection.launch(this.#getCwd());
    this.#conn = conn;
    conn.on("event", (record) => {
      try {
        this.#handleEvent(record);
      } catch (error) {
        console.error(`[pi-web] handler error (thread ${this.#threadId}):`, error);
      }
    });
    conn.on("stderr", (chunk: string) => {
      const text = chunk.trim();
      if (text.length > 0) console.error(`[pi stderr] ${text.slice(0, 500)}`);
    });
    conn.on("close", () => {
      this.#conn = undefined;
      this.#appliedModel = null;
      this.#appliedThinking = null;
      this.#failOpenItems("pi 进程已退出");
      if (this.#status === "running" || this.#status === "waiting") {
        this.#setStatus("idle");
      }
    });
    return conn;
  }

  #openStreamItem(key: string, make: (id: string) => TurnItem): TurnItem {
    const itemId = this.#streaming.get(key);
    if (itemId !== undefined) {
      const projection = this.#store.get(this.#threadId);
      const existing = projection?.items.get(itemId);
      if (existing) return existing;
    }
    const item = make(`ti-${cryptoRandomId()}`);
    this.#streaming.set(key, item.id);
    return item;
  }

  #handleEvent(event: PiRecord): void {
    switch (event["type"]) {
      case "agent_start":
        return;
      case "message_start": {
        const role = stringField(event["message"], "role");
        if (role === "assistant") this.#assistantSeq += 1;
        return;
      }
      case "message_update": {
        const delta = event["assistantMessageEvent"];
        if (!isRecord(delta)) return;
        const deltaType = stringField(delta, "type");
        const contentIndex = numberField(delta, "contentIndex") ?? 0;
        const now = Date.now();
        if (deltaType === "text_delta" || deltaType === "thinking_delta") {
          const key = `${this.#assistantSeq}:${deltaType === "text_delta" ? "text" : "think"}:${contentIndex}`;
          const existing = this.#openStreamItem(key, (id) =>
            deltaType === "text_delta"
              ? {
                  ...base(id, this.#threadId, this.#ordinal++, now),
                  type: "assistant_message",
                  text: "",
                  streaming: true,
                  status: "running",
                }
              : {
                  ...base(id, this.#threadId, this.#ordinal++, now),
                  type: "reasoning",
                  text: "",
                  streaming: true,
                  status: "running",
                },
          );
          if (existing.type !== "assistant_message" && existing.type !== "reasoning") return;
          this.#upsertItem({
            ...existing,
            text: existing.text + (stringField(delta, "delta") ?? ""),
            streaming: true,
            status: "running",
            completedAt: null,
          } as TurnItem);
          return;
        }
        if (deltaType === "text_end" || deltaType === "thinking_end") {
          const key = `${this.#assistantSeq}:${deltaType === "text_end" ? "text" : "think"}:${contentIndex}`;
          const itemId = this.#streaming.get(key);
          if (itemId === undefined) return;
          this.#streaming.delete(key);
          const projection = this.#store.get(this.#threadId);
          const existing = projection?.items.get(itemId);
          if (!existing) return;
          const finalText =
            stringField(delta, "content") ?? stringField(delta, "thinking") ?? "";
          this.#upsertItem(
            finalText.length > 0
              ? ({ ...existing, text: finalText, streaming: false, status: "completed", completedAt: now } as TurnItem)
              : ({ ...existing, streaming: false, status: "completed", completedAt: now } as TurnItem),
          );
          return;
        }
        return;
      }
      case "message_end": {
        const message = event["message"];
        if (stringField(message, "role") !== "assistant") return;
        this.#finalizeAllStreaming();
        const stopReason = stringField(message, "stopReason");
        if (stopReason === "error") {
          const now = Date.now();
          this.#emitItem({
            ...base(`ti-${cryptoRandomId()}`, this.#threadId, this.#ordinal++, now),
            type: "error",
            status: "failed",
            startedAt: now,
            completedAt: now,
            text: stringField(message, "errorMessage") ?? "pi 报告模型错误。",
          });
          return;
        }
        // 与 pi getContextUsage 一致：aborted/error 消息的 usage 不可信
        if (stopReason === "aborted") return;
        if (!isRecord(message)) return;
        const usage = message["usage"];
        if (!isRecord(usage)) return;
        const modelSlug = this.#statsModelSlug(message);
        this.#applyStats(
          foldAssistantUsage(this.#stats, usage as PiUsageLike, this.#contextWindowFor(modelSlug)),
        );
        return;
      }
      case "tool_execution_start": {
        const toolCallId = stringField(event, "toolCallId");
        if (toolCallId === undefined) return;
        const args = event["args"];
        this.#toolArgs.set(toolCallId, args);
        const item = this.#toolItem(toolCallId, stringField(event, "toolName") ?? "tool", args, "running");
        this.#toolItems.set(toolCallId, item.id);
        this.#upsertItem(item);
        return;
      }
      case "tool_execution_update": {
        const toolCallId = stringField(event, "toolCallId");
        const itemId = toolCallId === undefined ? undefined : this.#toolItems.get(toolCallId);
        if (!toolCallId || !itemId) return;
        const projection = this.#store.get(this.#threadId);
        const existing = projection?.items.get(itemId);
        if (!existing) return;
        const output = contentText(field(event["partialResult"], "content"));
        this.#upsertItem(withToolOutput(existing, output, "running") as TurnItem);
        return;
      }
      case "tool_execution_end": {
        const toolCallId = stringField(event, "toolCallId");
        const itemId = toolCallId === undefined ? undefined : this.#toolItems.get(toolCallId);
        if (!toolCallId || !itemId) return;
        const projection = this.#store.get(this.#threadId);
        const existing = projection?.items.get(itemId);
        if (!existing) return;
        const isError = event["isError"] === true;
        const status: TurnItemStatus = isError ? "failed" : "completed";
        const output = contentText(field(event["result"], "content"));
        const details = field(event["result"], "details");
        this.#upsertItem(
          withToolResult(existing, {
            status,
            output,
            exitCode: numberField(details, "exitCode"),
            diffStr: stringField(details, "patch"),
          }) as TurnItem,
        );
        return;
      }
      case "compaction_start": {
        const now = Date.now();
        this.#emitItem({
          ...base(`ti-${cryptoRandomId()}`, this.#threadId, this.#ordinal++, now),
          type: "system_notice",
          status: "running",
          startedAt: now,
          completedAt: null,
          text: "正在压缩上下文…",
        });
        return;
      }
      case "compaction_end": {
        const projection = this.#store.get(this.#threadId);
        const open = [...(projection?.items.values() ?? [])]
          .filter((item) => item.type === "system_notice" && item.status === "running")
          .sort((a, b) => b.ordinal - a.ordinal)[0];
        if (!open) return;
        const aborted = event["aborted"] === true;
        const errorMessage = stringField(event, "errorMessage");
        if (!aborted && !errorMessage) {
          this.#applyStats(markCompacted(this.#stats));
        }
        this.#upsertItem({
          ...open,
          status: aborted ? "cancelled" : errorMessage ? "failed" : "completed",
          text: errorMessage ?? (aborted ? "上下文压缩已取消" : "上下文压缩完成"),
          completedAt: Date.now(),
        } as TurnItem);
        return;
      }
      case "auto_retry_start": {
        const attempt = numberField(event, "attempt") ?? 1;
        const now = Date.now();
        this.#emitItem({
          ...base(`ti-${cryptoRandomId()}`, this.#threadId, this.#ordinal++, now),
          type: "system_notice",
          status: "running",
          startedAt: now,
          completedAt: null,
          text: `provider 自动重试（第 ${attempt} 次）…`,
        });
        return;
      }
      case "auto_retry_end": {
        const projection = this.#store.get(this.#threadId);
        const open = [...(projection?.items.values() ?? [])]
          .filter((item) => item.type === "system_notice" && item.status === "running")
          .sort((a, b) => b.ordinal - a.ordinal)[0];
        if (!open) return;
        this.#upsertItem({ ...open, status: "completed", completedAt: Date.now() } as TurnItem);
        return;
      }
      case "extension_ui_request": {
        const method = stringField(event, "method");
        const nativeIdRaw = event["id"];
        const nativeId =
          typeof nativeIdRaw === "number" || typeof nativeIdRaw === "string"
            ? nativeIdRaw
            : undefined;
        if (method !== "confirm" || nativeId === undefined) return;
        const requestId = stringField(event, "requestId") ?? `req-${cryptoRandomId()}`;
        const turnItemId = `ti-${cryptoRandomId()}`;
        this.#pendingApprovals.set(requestId, { nativeId, turnItemId });
        this.#upsertItem({
          ...base(turnItemId, this.#threadId, this.#ordinal++, Date.now()),
          type: "approval_request",
          requestId,
          title: stringField(event, "title") ?? "pi 请求确认",
          message: stringField(event, "message"),
          status: "waiting",
        });
        this.#setStatus("waiting");
        return;
      }
      case "extension_error": {
        const now = Date.now();
        this.#emitItem({
          ...base(`ti-${cryptoRandomId()}`, this.#threadId, this.#ordinal++, now),
          type: "error",
          status: "failed",
          startedAt: now,
          completedAt: now,
          text: stringField(event, "message") ?? "pi 扩展错误。",
        });
        return;
      }
      case "agent_settled": {
        const aborted = event["aborted"] === true;
        this.#finalizeAllStreaming(aborted ? "cancelled" : undefined);
        for (const requestId of [...this.#pendingApprovals.keys()]) {
          this.#resolveApprovalItem(requestId, "cancelled");
        }
        this.#setStatus("idle");
        if (!aborted) this.#reconcileStats();
        return;
      }
      default:
        return;
    }
  }

  /** tool_execution_start 时按 t3code 语义选 item 类型 */
  #toolItem(_toolCallId: string, toolName: string, args: unknown, status: TurnItemStatus): TurnItem {
    const now = Date.now();
    const shared = base(`ti-${cryptoRandomId()}`, this.#threadId, this.#ordinal++, now);
    const argRecord = isRecord(args) ? args : {};
    if (toolName === "bash" || toolName === "powershell") {
      return {
        ...shared,
        type: "command_execution",
        title: toolName,
        input: typeof argRecord["command"] === "string" ? argRecord["command"] : "",
        status,
        startedAt: now,
        completedAt: null,
      };
    }
    if (toolName === "edit" || toolName === "write") {
      const fileName =
        typeof argRecord["path"] === "string"
          ? argRecord["path"]
          : typeof argRecord["file_path"] === "string"
            ? argRecord["file_path"]
            : "unknown";
      return {
        ...shared,
        type: "file_change",
        title: toolName,
        fileName,
        newStr: toolName === "write" && typeof argRecord["content"] === "string" ? argRecord["content"] : undefined,
        status,
        startedAt: now,
        completedAt: null,
      };
    }
    return {
      ...shared,
      type: "dynamic_tool",
      title: toolName,
      toolName,
      input: args,
      status,
      startedAt: now,
      completedAt: null,
    };
  }

  #finalizeAllStreaming(finalStatus?: TurnItemStatus): void {
    const projection = this.#store.get(this.#threadId);
    if (!projection) return;
    const now = Date.now();
    for (const itemId of this.#streaming.values()) {
      const existing = projection.items.get(itemId);
      if (!existing) continue;
      const hasText =
        (existing.type === "assistant_message" || existing.type === "reasoning") &&
        existing.text.trim().length > 0;
      this.#upsertItem({
        ...existing,
        streaming: false,
        status: finalStatus ?? (hasText ? "completed" : "cancelled"),
        completedAt: now,
      } as TurnItem);
    }
    this.#streaming.clear();
  }

  #failOpenItems(message: string): void {
    const projection = this.#store.get(this.#threadId);
    if (!projection) return;
    const now = Date.now();
    for (const item of projection.items.values()) {
      if (item.status === "running" || item.streaming === true) {
        this.#upsertItem({
          ...item,
          streaming: false,
          status: "failed",
          completedAt: now,
        } as TurnItem);
      }
    }
    this.#toolItems.clear();
    this.#emitItem({
      ...base(`ti-${cryptoRandomId()}`, this.#threadId, this.#ordinal++, now),
      type: "error",
      status: "failed",
      startedAt: now,
      completedAt: now,
      text: message,
    });
  }

  #resolveApprovalItem(requestId: string, status: TurnItemStatus): void {
    const pending = this.#pendingApprovals.get(requestId);
    if (!pending) return;
    this.#pendingApprovals.delete(requestId);
    const projection = this.#store.get(this.#threadId);
    const existing = projection?.items.get(pending.turnItemId);
    if (existing?.type === "approval_request") {
      this.#upsertItem({ ...existing, status, completedAt: Date.now() } as TurnItem);
    }
    if (this.#pendingApprovals.size === 0 && this.#status === "waiting") {
      this.#setStatus("running");
    }
  }

  // ---- 会话统计（t3code ContextWindowMeter 数据源） ----

  /** assistant 消息里 model 为子 provider 的裸 id，拼上 provider 得到 pi-web slug */
  #statsModelSlug(message: Record<string, unknown>): string | null {
    const provider = stringField(message, "provider");
    const modelId = stringField(message, "model");
    if (!modelId) return this.#store.get(this.#threadId)?.summary.model ?? null;
    return provider ? `${provider}/${modelId}` : modelId;
  }

  #contextWindowFor(modelSlug: string | null): number | null {
    const resolved = this.#resolveContextWindow?.(modelSlug);
    return typeof resolved === "number" && Number.isFinite(resolved) && resolved > 0
      ? resolved
      : null;
  }

  #applyStats(stats: ThreadSessionStats): void {
    this.#stats = stats;
    this.#store.updateSummary(
      this.#threadId,
      { stats },
      { preserveUpdatedAt: true },
    );
  }

  /** agent_settled 后用 pi get_session_stats 对账（compaction 感知的权威数据） */
  #reconcileStats(): void {
    const conn = this.#conn;
    if (!conn) return;
    void conn
      .request({ type: "get_session_stats" }, 10_000)
      .then((response) => {
        const data = response["data"];
        const stats = statsFromSessionRpc(data);
        if (stats) this.#applyStats(stats);
      })
      .catch(() => {
        /* pi 已退出或超时：保留本地折叠值 */
      });
  }

  /** 手动压缩上下文（pi RPC `compact`），完成事件经 compaction_end 回流 */
  compactContext(): boolean {
    if (!this.#conn) return false;
    void this.#conn.request({ type: "compact" }, 120_000).catch(() => {});
    return true;
  }

  async #syncSelection(
    conn: PiRpcConnection,
    modelSlug: string | null | undefined,
    thinkingLevel: PiThinkingLevel | null | undefined,
  ): Promise<void> {
    if (modelSlug && modelSlug !== "default" && modelSlug !== this.#appliedModel) {
      const parsed = parsePiModelSlug(modelSlug);
      if (parsed) {
        await conn.request(
          { type: "set_model", provider: parsed.provider, modelId: parsed.modelId },
          10_000,
        );
        this.#appliedModel = modelSlug;
      }
    }
    if (thinkingLevel && thinkingLevel !== this.#appliedThinking) {
      await conn.request({ type: "set_thinking_level", level: thinkingLevel }, 10_000);
      this.#appliedThinking = thinkingLevel;
    }
  }

  async setModel(model: string, thinkingLevel?: PiThinkingLevel | null): Promise<void> {
    this.#store.updateSummary(this.#threadId, {
      model,
      ...(thinkingLevel !== undefined ? { thinkingLevel } : {}),
    });
    if (!this.#conn) return;
    try {
      await this.#syncSelection(
        this.#conn,
        model,
        thinkingLevel ?? this.#store.get(this.#threadId)?.summary.thinkingLevel,
      );
    } catch (error) {
      console.error(`[pi-web] setModel failed (thread ${this.#threadId}):`, error);
    }
  }

  async sendMessage(
    text: string,
    selection?: {
      model?: string;
      thinkingLevel?: PiThinkingLevel | null;
      attachments?: AttachmentItem[];
    },
  ): Promise<void> {
    const now = Date.now();
    const attachments =
      selection?.attachments && selection.attachments.length > 0
        ? selection.attachments
        : undefined;
    this.#upsertItem({
      ...base(`ti-${cryptoRandomId()}`, this.#threadId, this.#ordinal++, now),
      type: "user_message",
      text,
      status: "completed",
      startedAt: now,
      completedAt: now,
      ...(attachments ? { attachments } : {}),
    });
    const summary = this.#store.get(this.#threadId)?.summary;
    const defaultTitle = summary ? firstLineTitle(summary.cwd) : undefined;
    const titlePatch: Partial<ThreadSummary> = {};
    if (summary && (summary.title === "New thread" || summary.title === defaultTitle)) {
      titlePatch.title = text.replace(/\s+/g, " ").trim().slice(0, 48) || summary.title;
    }
    if (selection?.model) {
      titlePatch.model = selection.model;
    }
    if (selection?.thinkingLevel !== undefined) {
      titlePatch.thinkingLevel = selection.thinkingLevel;
    }
    if (Object.keys(titlePatch).length > 0) {
      this.#store.updateSummary(this.#threadId, titlePatch);
    }

    try {
      const conn = this.ensureProcess();
      const latestSummary = this.#store.get(this.#threadId)?.summary;
      await this.#syncSelection(
        conn,
        selection?.model ?? latestSummary?.model,
        selection?.thinkingLevel ?? latestSummary?.thinkingLevel,
      );
      this.#setStatus("running");

      let effectivePrompt = text;
      if (attachments && attachments.length > 0) {
        const textAttachments = attachments.filter((a) => a.content && a.content.length > 0);
        if (textAttachments.length > 0) {
          effectivePrompt +=
            "\n\n" +
            textAttachments
              .map((a) => `[Context File: ${a.name}]\n\`\`\`\n${a.content}\n\`\`\``)
              .join("\n\n");
        }
      }

      const imageAttachments =
        attachments?.filter((a) => a.mimeType.startsWith("image/") && a.url) ?? [];
      const piImages = imageAttachments.map((img) => {
        const match = img.url!.match(/^data:([^;]+);base64,(.+)$/);
        return {
          type: "image",
          mimeType: match ? match[1] : img.mimeType,
          data: match ? match[2] : img.url!,
        };
      });

      conn.send({
        type: "prompt",
        message: effectivePrompt,
        ...(piImages.length > 0 ? { images: piImages } : {}),
        streamingBehavior: "steer",
      });
    } catch (error) {
      this.#setStatus("error");
      const failedAt = Date.now();
      this.#emitItem({
        ...base(`ti-${cryptoRandomId()}`, this.#threadId, this.#ordinal++, failedAt),
        type: "error",
        status: "failed",
        startedAt: failedAt,
        completedAt: failedAt,
        text: `无法启动 pi：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  stop(): void {
    try {
      this.#conn?.request({ type: "abort" }, 5_000).catch(() => {});
    } catch {
      /* connection already closing */
    }
  }

  respondApproval(requestId: string, decision: "accept" | "decline"): boolean {
    const pending = this.#pendingApprovals.get(requestId);
    if (!pending || !this.#conn) return false;
    this.#conn.send({
      type: "extension_ui_response",
      id: pending.nativeId,
      confirmed: decision === "accept",
    });
    this.#resolveApprovalItem(requestId, decision === "accept" ? "completed" : "cancelled");
    return true;
  }

  dispose(): void {
    this.#conn?.terminate();
    this.#conn = undefined;
  }
}

function base(id: string, threadId: ThreadId, ordinal: number, startedAt: number): TurnItemBase {
  return {
    id,
    threadId,
    ordinal,
    status: "running",
    startedAt,
    completedAt: null,
  };
}

function withToolOutput(item: TurnItem, output: string, status: TurnItemStatus): TurnItem {
  if (item.type === "command_execution" || item.type === "dynamic_tool") {
    return { ...item, status, ...(output.length > 0 ? { output } : {}) };
  }
  return item;
}

function withToolResult(
  item: TurnItem,
  result: { status: TurnItemStatus; output: string; exitCode?: number; diffStr?: string },
): TurnItem {
  const now = Date.now();
  if (item.type === "command_execution") {
    return {
      ...item,
      status: result.status,
      completedAt: now,
      ...(result.output.length > 0 ? { output: result.output } : {}),
      ...(result.exitCode !== undefined ? { exitCode: result.exitCode } : {}),
    };
  }
  if (item.type === "file_change") {
    return {
      ...item,
      status: result.status,
      completedAt: now,
      ...(result.diffStr !== undefined ? { diffStr: result.diffStr } : {}),
      ...(result.status === "failed" && result.output.trim().length > 0 && result.diffStr === undefined
        ? { diffStr: result.output }
        : {}),
    };
  }
  if (item.type === "dynamic_tool") {
    return {
      ...item,
      status: result.status,
      completedAt: now,
      ...(result.output.length > 0 ? { output: result.output } : {}),
    };
  }
  return item;
}

function cryptoRandomId(): string {
  return randomBytes(8).toString("hex");
}

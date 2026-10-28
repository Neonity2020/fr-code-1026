/**
 * pi-web 协议契约：前端 ↔ 服务端的唯一边界。
 *
 * 数据模型对齐 t3code 的 `packages/contracts/src/orchestrationV2.ts`（TurnItem /
 * ThreadProjection / snapshot→event→synchronized 订阅流 / commandId 幂等命令），
 * 只保留单 pi provider 需要的子集。保持命名一致是为了未来可直接升级回 t3code 的
 * 完整时间线组件与同步引擎。
 */

export {
  applyTurnItemPreview,
  deriveLatestPreview,
  domainEventThreadId,
  firstLineTitle,
  upsertTurnItem,
} from "./projection.ts";

// ---------- 实体 ID ----------

export type ThreadId = string;
export type TurnItemId = string;
export type CommandId = string;
export const PROJECT_SCRIPT_ICONS = ["play", "test", "lint", "configure", "build", "debug"] as const;
export type ProjectScriptIcon = typeof PROJECT_SCRIPT_ICONS[number];

export interface AttachmentItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  /** base64 data url for images or file content preview */
  url?: string;
  /** text content if it is a text/code file */
  content?: string;
  /** relative path if it's a workspace file reference */
  path?: string;
}

export interface ScopedThreadRef {
  environmentId: string;
  threadId: ThreadId;
}

// ---------- TurnItem：时间线原子单元（渲染协议） ----------

export type TurnItemStatus =
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface TurnItemBase {
  id: TurnItemId;
  threadId: ThreadId;
  ordinal: number;
  status: TurnItemStatus;
  startedAt: number | null;
  completedAt: number | null;
  /** 流式 item（assistant_message / reasoning）在输出中时为 true */
  streaming?: boolean;
}

export type TurnItem =
  | (TurnItemBase & { type: "user_message"; text: string; attachments?: AttachmentItem[] })
  | (TurnItemBase & { type: "assistant_message"; text: string })
  | (TurnItemBase & { type: "reasoning"; text: string })
  | (TurnItemBase & {
      type: "command_execution";
      title: string;
      input: string;
      output?: string;
      exitCode?: number;
    })
  | (TurnItemBase & {
      type: "file_change";
      title: string;
      fileName: string;
      diffStr?: string;
      newStr?: string;
    })
  | (TurnItemBase & {
      type: "dynamic_tool";
      title: string;
      toolName: string;
      input?: unknown;
      output?: string;
    })
  | (TurnItemBase & {
      type: "approval_request";
      requestId: string;
      title: string;
      message?: string;
    })
  | (TurnItemBase & { type: "error"; text: string })
  | (TurnItemBase & { type: "system_notice"; text: string });

// ---------- 线程 ----------

export type ProjectIconColor =
  | "gray"
  | "red"
  | "orange"
  | "amber"
  | "yellow"
  | "lime"
  | "green"
  | "emerald"
  | "teal"
  | "cyan"
  | "sky"
  | "blue"
  | "indigo"
  | "violet"
  | "purple"
  | "fuchsia"
  | "pink"
  | "rose";

export type ThreadStatus = "idle" | "running" | "waiting" | "error";

export type PiThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export interface PiModelInfo {
  /** Full slug in `provider/modelId` format, e.g. `"minimax/MiniMax-M3.1-Flash"` */
  slug: string;
  /** Model ID within the sub-provider, e.g. `"MiniMax-M3.1-Flash"` */
  id: string;
  /** Human-readable display name, e.g. `"MiniMax-M3.1-Flash"` */
  name: string;
  /** Sub-provider inside pi, e.g. `"minimax"`, `"anthropic"`, `"agnes"` */
  subProvider: string;
  /** Whether the model supports reasoning/thinking levels */
  reasoning: boolean;
  /** Supported thinking levels for this model */
  thinkingLevels: PiThinkingLevel[];
  /** Context window size in tokens */
  contextWindow?: number;
}

// ---------- 线程会话统计（上下文窗口） ----------

export interface ThreadSessionStats {
  /** 当前上下文已占用 token 数（压缩后可能为 null） */
  usedTokens: number | null;
  /** 模型上下文窗口上限 */
  contextWindow: number | null;
  /** 占用百分比 */
  percent: number | null;
  /** 会话累计处理 token 数 */
  totalTokens: number | null;
  /** 会话累计费用 */
  cost: number | null;
}

export interface ThreadSummary {
  id: ThreadId;
  title: string;
  cwd: string;
  status: ThreadStatus;
  createdAt: number;
  updatedAt: number;
  /** 当前线程绑定的 Pi 模型 slug（provider/modelId） */
  model?: string | null;
  /** 会话统计（上下文窗口 / 累计 token 与费用），对齐 t3code ContextWindowMeter 数据源 */
  stats?: ThreadSessionStats | null;
  /** 当前线程的推理思考档位 */
  thinkingLevel?: PiThinkingLevel | null;
  /** Git 分支名（默认 main） */
  branch?: string | null;
  /** 侧栏预览：最近一条可见消息的摘要 */
  latestPreview?: string;
  /** 置顶时间戳（ms），null/undefined 表示未置顶 */
  pinnedAt?: number | null;
  /** 归档/Settle 时间戳（ms），null/undefined 表示在活跃收件箱 */
  settledAt?: number | null;
  /** 延后提醒截止时间戳（ms），null/undefined 表示未 Snooze */
  snoozedUntil?: number | null;
  /** Snooze 到期唤醒时间戳（ms） */
  wokeAt?: number | null;
  /** 是否有未查看的新回复完成 */
  unread?: boolean;
}

// ---------- 领域事件（事件溯源，全局递增 sequence） ----------

export type DomainEvent =
  | { type: "thread.created"; thread: ThreadSummary }
  | { type: "thread.updated"; thread: ThreadSummary }
  | { type: "thread.deleted"; threadId: ThreadId }
  | { type: "turn_item.updated"; threadId: ThreadId; turnItem: TurnItem };

export interface StoredEvent {
  sequence: number;
  event: DomainEvent;
}

// ---------- WS：client → server ----------

export type ClientMessage =
  | { kind: "subscribe-threads" }
  | { kind: "subscribe"; threadId: ThreadId; afterSequence?: number }
  | { kind: "unsubscribe"; threadId: ThreadId }
  | { kind: "dispatch"; commandId: CommandId; command: Command };

export type Command =
  | {
      type: "thread.create";
      cwd: string;
      title?: string;
      model?: string;
      thinkingLevel?: PiThinkingLevel | null;
    }
  | {
      type: "thread.fork";
      sourceThreadId: ThreadId;
      title?: string;
    }
  | { type: "thread.delete"; threadId: ThreadId }
  | { type: "thread.rename"; threadId: ThreadId; title: string }
  | {
      type: "thread.set_model";
      threadId: ThreadId;
      model: string;
      thinkingLevel?: PiThinkingLevel | null;
    }
  | { type: "thread.pin"; threadId: ThreadId; pinned: boolean }
  | { type: "thread.settle"; threadId: ThreadId; settled: boolean }
  | { type: "thread.snooze"; threadId: ThreadId; snoozedUntil: number | null }
  | { type: "thread.acknowledge_woke"; threadId: ThreadId }
  | { type: "thread.mark_read"; threadId: ThreadId }
  | { type: "project.add"; cwd: string }
  | { type: "project.remove"; cwd: string }
  | {
      type: "message.send";
      threadId: ThreadId;
      text: string;
      model?: string;
      thinkingLevel?: PiThinkingLevel | null;
      attachments?: AttachmentItem[];
    }
  | { type: "thread.stop"; threadId: ThreadId }
  | { type: "thread.compact"; threadId: ThreadId }
  | {
      type: "approval.respond";
      threadId: ThreadId;
      requestId: string;
      decision: "accept" | "decline";
    };

// ---------- WS：server → client ----------

export type ServerMessage =
  /** 线程列表（subscribe-threads 的回执，也在列表变化时主动推送） */
  | { kind: "threads"; threads: ThreadSummary[]; projects?: string[] }
  /** 项目目录列表更新 */
  | { kind: "projects"; projects: string[] }
  /** 订阅回放：先快照，再增量事件，最后 synchronized（对齐 t3code ThreadStream） */
  | { kind: "snapshot"; threadId: ThreadId; snapshotSequence: number; items: TurnItem[] }
  | { kind: "event"; sequence: number; event: DomainEvent }
  /** 前向兼容：未知事件类型仍推进 sequence 游标（对齐 t3code unknown-event） */
  | { kind: "unknown-event"; sequence: number; eventType: string }
  | { kind: "synchronized"; threadId: ThreadId }
  | { kind: "ack"; commandId: CommandId }
  | { kind: "nack"; commandId: CommandId; message: string };

// ---------- REST ----------

export interface PiStatus {
  installed: boolean;
  version?: string;
  error?: string;
  defaultModel?: string;
  defaultThinkingLevel?: PiThinkingLevel;
  models?: PiModelInfo[];
}

export interface ServerConfigResponse {
  defaultCwd: string;
  projects?: string[];
  pi: PiStatus;
}

/**
 * TurnItem 行渲染器。视觉语言对齐 t3code 的时间线：
 * - 用户消息 = 主题色块；
 * - 助手消息 = markdown 直排；
 * - 工作条目（命令 / 文件改动 / 工具调用）= 扁平的工作日志行（图标 + 文本 + 状态），
 *   展开后缩进显示输出；连续的工作条目会折叠成一行摘要（见 timelineGrouping.ts）；
 * - 审批卡 = 带 Accept/Decline 的操作面板。
 */
import { useState } from "react";
import {
  BrainIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleXIcon,
  FileCodeIcon,
  FileDiffIcon,
  ImageIcon,
  TerminalIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import type { AttachmentItem, TurnItem } from "@pi-web/protocol";
import { transport, useAppStore } from "@pi-web/client-runtime";
import { useI18n } from "~/i18n";
import { cn } from "~/lib/utils";
import { ChatMarkdown } from "./ChatMarkdown";
import { WorkLogButton, WorkLogDetails } from "./WorkLog";
import {
  formatDurationLabel,
  workGroupDuration,
  type ReasoningTurnItem,
  type WorkGroupSummary,
  type WorkTurnItem,
} from "./timelineGrouping";

export function TurnItemRow({ item }: { item: TurnItem }) {
  switch (item.type) {
    case "user_message":
      return <UserMessageRow text={item.text} attachments={item.attachments} />;
    case "assistant_message":
      return <AssistantMessageRow text={item.text} streaming={item.streaming === true} />;
    case "reasoning":
      return <ReasoningRow text={item.text} streaming={item.streaming === true} />;
    case "command_execution":
    case "file_change":
    case "dynamic_tool":
      return <WorkRow item={item} />;
    case "approval_request":
      return (
        <ApprovalRow
          requestId={item.requestId}
          title={item.title}
          message={item.message}
          status={item.status}
        />
      );
    case "error":
      return (
        <div className="bg-error-surface text-error-foreground flex items-start gap-2 rounded-lg px-3 py-2 text-xs">
          <CircleXIcon className="mt-0.5 size-3.5 shrink-0 text-error" />
          <span className="whitespace-pre-wrap">{item.text}</span>
        </div>
      );
    case "system_notice":
      return (
        <div
          className={cn(
            "text-muted-foreground flex items-center gap-1.5 px-1 py-0.5 text-2xs",
            item.status === "running" && "animate-pulse",
          )}
        >
          {item.text}
        </div>
      );
    default:
      return null;
  }
}

/** 连续工作条目的折叠行（对齐 t3code work-toggle 行）。 */
export function WorkGroupRow({
  items,
  summary,
}: {
  items: readonly WorkTurnItem[];
  summary: WorkGroupSummary;
}) {
  const [open, setOpen] = useState(false);
  const { tr } = useI18n();

  const label = workGroupLabel(summary, tr);
  const duration = workGroupDuration(summary);
  const icon =
    summary.counts.command > 0 ? (
      <TerminalIcon className="size-4 shrink-0 stroke-2 text-icon-muted" />
    ) : summary.counts.file_change > 0 ? (
      <FileDiffIcon className="size-4 shrink-0 stroke-2 text-icon-muted" />
    ) : (
      <WrenchIcon className="size-4 shrink-0 stroke-2 text-icon-muted" />
    );

  return (
    <div className="my-0.5">
      <WorkLogButton
        icon={icon}
        label={
          <span className="flex min-w-0 items-center gap-1.5">
            {open ? (
              <ChevronDownIcon className="size-3.5 shrink-0 text-icon-muted" />
            ) : (
              <ChevronRightIcon className="size-3.5 shrink-0 text-icon-muted" />
            )}
            <span className="truncate">{label}</span>
          </span>
        }
        trailing={
          <span className="flex shrink-0 items-center gap-2">
            {duration !== null ? (
              <span className="text-muted-foreground text-xs tabular-nums">
                {formatDurationLabel(duration)}
              </span>
            ) : null}
            {summary.hasFailure ? <CircleXIcon className="text-error size-3.5" /> : null}
            {summary.running ? <RunningIndicator /> : null}
          </span>
        }
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((previous) => !previous)}
      />
      {open ? (
        <WorkLogDetails kind="panel">
          <div className="ms-1 flex flex-col gap-0.5">
            {items.map((item) => (
              <WorkRow key={item.id} item={item} nested />
            ))}
          </div>
        </WorkLogDetails>
      ) : null}
    </div>
  );
}

/** 连续思考条目的折叠行（对齐 t3code 的 “Thought (×N)”）。 */
export function ReasoningGroupRow({ items }: { items: readonly ReasoningTurnItem[] }) {
  const [open, setOpen] = useState(false);
  const { tr } = useI18n();
  const streaming = items.some((item) => item.streaming === true);
  const label = streaming
    ? tr("思考中…", "Thinking…")
    : tr(`思考过程 (×${items.length})`, `Thought (×${items.length})`);

  return (
    <div className="my-0.5">
      <WorkLogButton
        icon={<BrainIcon className="size-4 shrink-0 stroke-2 text-icon-muted" />}
        label={
          <span className="flex min-w-0 items-center gap-1.5">
            {open ? (
              <ChevronDownIcon className="size-3.5 shrink-0 text-icon-muted" />
            ) : (
              <ChevronRightIcon className="size-3.5 shrink-0 text-icon-muted" />
            )}
            <span className="truncate">{label}</span>
          </span>
        }
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((previous) => !previous)}
      />
      {open ? (
        <WorkLogDetails kind="panel">
          <div className="ms-1 flex flex-col gap-0.5">
            {items.map((item) => (
              <ReasoningRow key={item.id} text={item.text} streaming={item.streaming === true} />
            ))}
          </div>
        </WorkLogDetails>
      ) : null}
    </div>
  );
}

function workGroupLabel(
  summary: WorkGroupSummary,
  tr: (zh: string, en: string) => string,
): string {
  const parts: string[] = [];
  if (summary.counts.command > 0) {
    const count = summary.counts.command;
    parts.push(
      tr(
        `运行了 ${count} 条命令`,
        count === 1 ? "Ran a command" : `Ran ${count} commands`,
      ),
    );
  }
  if (summary.counts.file_change > 0) {
    const count = summary.counts.file_change;
    parts.push(
      tr(
        `修改了 ${count} 个文件`,
        count === 1 ? "Changed a file" : `Changed ${count} files`,
      ),
    );
  }
  if (summary.counts.tool > 0) {
    const count = summary.counts.tool;
    parts.push(
      tr(
        `调用了 ${count} 个工具`,
        count === 1 ? "Used a tool" : `Used ${count} tools`,
      ),
    );
  }
  return parts.join(tr(" · ", " · "));
}

/** 单个工作条目：命令 / 文件改动 / 工具调用。 */
function WorkRow({ item, nested = false }: { item: WorkTurnItem; nested?: boolean }) {
  const [open, setOpen] = useState(false);
  const { tr } = useI18n();

  const label = workItemLabel(item, tr);
  const detail = workItemDetail(item);
  const icon = workItemIcon(item);
  const hasBody = detail !== null;

  return (
    <div className={cn("my-0.5", nested && "py-0")}>
      <WorkLogButton
        icon={icon}
        label={
          <span className="flex min-w-0 items-center gap-1.5">
            {hasBody ? (
              open ? (
                <ChevronDownIcon className="size-3.5 shrink-0 text-icon-muted" />
              ) : (
                <ChevronRightIcon className="size-3.5 shrink-0 text-icon-muted" />
              )
            ) : null}
            <span className={cn("truncate", item.type === "command_execution" && "font-mono text-xs")}>
              {label}
            </span>
          </span>
        }
        trailing={
          <WorkStatusTrailing
            status={item.status}
            exitCode={item.type === "command_execution" ? item.exitCode : undefined}
          />
        }
        aria-expanded={hasBody ? open : undefined}
        aria-label={label}
        onClick={() => {
          if (!hasBody) return;
          setOpen((previous) => !previous);
        }}
      />
      {open && hasBody ? (
        <WorkLogDetails>
          <pre className="text-2xs text-muted-foreground font-mono whitespace-pre-wrap break-all">
            {detail}
          </pre>
        </WorkLogDetails>
      ) : null}
    </div>
  );
}

function workItemIcon(item: WorkTurnItem) {
  switch (item.type) {
    case "command_execution":
      return <TerminalIcon className="size-4 shrink-0 stroke-2 text-icon-muted" />;
    case "file_change":
      return <FileDiffIcon className="size-4 shrink-0 stroke-2 text-icon-muted" />;
    default:
      return <WrenchIcon className="size-4 shrink-0 stroke-2 text-icon-muted" />;
  }
}

function workItemLabel(
  item: WorkTurnItem,
  tr: (zh: string, en: string) => string,
): string {
  switch (item.type) {
    case "command_execution": {
      const command = item.input.split("\n")[0]?.trim();
      return command && command.length > 0 ? command : item.title;
    }
    case "file_change":
      return item.fileName || item.title;
    default:
      return item.title || tr("工具调用", "Tool call");
  }
}

/** 展开后显示的内容：命令输出 / diff / 工具入参。 */
function workItemDetail(item: WorkTurnItem): string | null {
  if (item.type === "command_execution") {
    const output = item.output?.trim();
    if (output) return output;
    const input = item.input.trim();
    return input.length > 0 ? input : null;
  }
  if (item.type === "file_change") {
    if (item.diffStr !== undefined && item.diffStr.trim().length > 0) return item.diffStr;
    if (item.newStr !== undefined && item.newStr.length > 0) {
      return item.newStr.split("\n").map((line) => `+ ${line}`).join("\n");
    }
    return null;
  }
  if (item.output !== undefined && item.output.trim().length > 0) return item.output;
  if (item.input !== undefined) return JSON.stringify(item.input, null, 2);
  return null;
}

function WorkStatusTrailing({
  status,
  exitCode,
}: {
  status: TurnItem["status"];
  exitCode?: number;
}) {
  return (
    <span className="flex shrink-0 items-center gap-2">
      {exitCode !== undefined && exitCode !== 0 ? (
        <span className="text-error text-2xs">exit {exitCode}</span>
      ) : null}
      {status === "running" ? <RunningIndicator /> : null}
      {status === "completed" ? <CircleCheckIcon className="text-success size-3.5" /> : null}
      {status === "failed" ? <CircleXIcon className="text-error size-3.5" /> : null}
      {status === "cancelled" ? (
        <span className="bg-muted-foreground size-2 rounded-full" aria-hidden />
      ) : null}
      {status === "waiting" ? (
        <span className="bg-warning size-2 rounded-full" aria-hidden />
      ) : null}
    </span>
  );
}

function RunningIndicator() {
  return (
    <span
      className="border-primary border-t-primary/30 size-3 animate-spin rounded-full border-2"
      aria-hidden
    />
  );
}

function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UserMessageRow({
  text,
  attachments,
}: {
  text: string;
  attachments?: AttachmentItem[];
}) {
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  return (
    <div className="mt-3 flex flex-col items-end gap-1.5 first:mt-0">
      {attachments && attachments.length > 0 && (
        <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
          {attachments.map((att) => {
            const isImage = att.mimeType.startsWith("image/") && att.url;
            if (isImage) {
              return (
                <button
                  key={att.id}
                  type="button"
                  onClick={() => setLightboxImage(att.url!)}
                  className="group relative max-h-48 max-w-xs overflow-hidden rounded-xl border border-border/60 bg-card text-left shadow-xs transition-opacity hover:opacity-95"
                >
                  <img
                    src={att.url}
                    alt={att.name}
                    className="max-h-48 max-w-xs object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 py-1 text-2xs text-white truncate">
                    {att.name}
                  </div>
                </button>
              );
            }
            return (
              <div
                key={att.id}
                className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/70 px-2.5 py-1 text-xs text-foreground"
              >
                <FileCodeIcon className="size-3.5 text-muted-foreground" />
                <span className="font-mono text-2xs truncate max-w-[180px]">{att.name}</span>
                {att.size > 0 && (
                  <span className="text-3xs text-muted-foreground">
                    ({formatAttachmentSize(att.size)})
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {text.length > 0 && (
        <div className="bg-message text-message-foreground max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2.5 text-sm whitespace-pre-wrap">
          {text}
        </div>
      )}
      {lightboxImage && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
        >
          <div className="relative max-h-full max-w-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxImage}
              alt="Enlarged attachment"
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              aria-label="Close image preview"
              className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AssistantMessageRow({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <div className="py-1">
      <ChatMarkdown text={text} />
      {streaming && (
        <span className="bg-foreground ml-0.5 inline-block h-3.5 w-[2px] animate-pulse align-middle" />
      )}
    </div>
  );
}

function ReasoningRow({ text, streaming }: { text: string; streaming: boolean }) {
  const [open, setOpen] = useState(false);
  const { tr } = useI18n();
  if (text.trim().length === 0 && !streaming) return null;
  return (
    <div className="my-0.5">
      <WorkLogButton
        icon={<BrainIcon className="size-4 shrink-0 stroke-2 text-icon-muted" />}
        label={
          <span className="truncate">
            {streaming ? tr("思考中…", "Thinking…") : tr("思考过程", "Thought process")}
          </span>
        }
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
      />
      {open ? (
        <WorkLogDetails>
          <p className="text-muted-foreground text-xs whitespace-pre-wrap">{text}</p>
        </WorkLogDetails>
      ) : null}
    </div>
  );
}

function ApprovalRow({
  requestId,
  title,
  message,
  status,
}: {
  requestId: string;
  title: string;
  message?: string;
  status: TurnItem["status"];
}) {
  const { tr } = useI18n();
  const respond = (decision: "accept" | "decline") => {
    transport.dispatch({
      type: "approval.respond",
      requestId,
      decision,
      threadId: useAppStore.getState().activeThreadId ?? "",
    });
  };
  if (status !== "waiting") {
    return (
      <div className="text-muted-foreground flex items-center gap-1.5 px-1 py-0.5 text-2xs">
        {status === "completed"
          ? tr("已允许", "Approved")
          : tr("已拒绝/取消", "Declined / Cancelled")}
        ：{title}
      </div>
    );
  }
  return (
    <div className="bg-warning-surface my-1 rounded-lg border border-border p-3">
      <div className="text-xs font-medium">{title}</div>
      {message && <div className="text-muted-foreground mt-0.5 text-2xs">{message}</div>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => respond("accept")}
          className="bg-primary text-primary-foreground hover:bg-message-action-hover rounded-md px-3 py-1 text-xs font-medium"
        >
          {tr("允许", "Approve")}
        </button>
        <button
          type="button"
          onClick={() => respond("decline")}
          className="hover:bg-sidebar-row-hover rounded-md border border-border px-3 py-1 text-xs"
        >
          {tr("拒绝", "Decline")}
        </button>
      </div>
    </div>
  );
}

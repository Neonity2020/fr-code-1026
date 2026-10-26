/**
 * TurnItem 行渲染器。视觉语言对齐 t3code 的时间线：
 * 用户消息 = 主题色块；助手消息 = markdown 直排；工具行 = 可折叠的等宽卡片；
 * 审批卡 = 带 Accept/Decline 的操作面板。
 */
import { useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleXIcon,
  FileDiffIcon,
  TerminalIcon,
  WrenchIcon,
} from "lucide-react";
import type { TurnItem } from "@pi-web/protocol";
import { transport, useAppStore } from "@pi-web/client-runtime";
import { useI18n } from "~/i18n";
import { cn } from "~/lib/utils";
import { ChatMarkdown } from "./ChatMarkdown";

export function TurnItemRow({ item }: { item: TurnItem }) {
  switch (item.type) {
    case "user_message":
      return <UserMessageRow text={item.text} />;
    case "assistant_message":
      return <AssistantMessageRow text={item.text} streaming={item.streaming === true} />;
    case "reasoning":
      return <ReasoningRow text={item.text} streaming={item.streaming === true} />;
    case "command_execution":
      return (
        <ToolRow
          icon={<TerminalIcon className="size-3.5" />}
          title={item.input.split("\n")[0]?.slice(0, 120) || item.title}
          status={item.status}
          output={item.output}
          exitCode={item.exitCode}
          mono
        >
          {item.input}
        </ToolRow>
      );
    case "file_change":
      return (
        <ToolRow
          icon={<FileDiffIcon className="size-3.5" />}
          title={item.fileName}
          status={item.status}
          output={renderDiffText(item)}
        >
          {null}
        </ToolRow>
      );
    case "dynamic_tool":
      return (
        <ToolRow
          icon={<WrenchIcon className="size-3.5" />}
          title={item.title}
          status={item.status}
          output={item.output}
        >
          {item.input === undefined ? null : (
            <pre className="text-2xs text-muted-foreground overflow-x-auto">
              {JSON.stringify(item.input, null, 2)}
            </pre>
          )}
        </ToolRow>
      );
    case "approval_request":
      return <ApprovalRow requestId={item.requestId} title={item.title} message={item.message} status={item.status} />;
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

function UserMessageRow({ text }: { text: string }) {
  return (
    <div className="mt-3 flex justify-end first:mt-0">
      <div className="bg-message text-message-foreground max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2.5 text-sm whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
}

function AssistantMessageRow({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <div className="py-1">
      <ChatMarkdown text={text} />
      {streaming && <span className="bg-foreground ml-0.5 inline-block h-3.5 w-[2px] animate-pulse align-middle" />}
    </div>
  );
}

function ReasoningRow({ text, streaming }: { text: string; streaming: boolean }) {
  const [open, setOpen] = useState(false);
  const { tr } = useI18n();
  if (text.trim().length === 0) return null;
  return (
    <div className="text-muted-foreground py-0.5">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        className="hover:text-foreground flex items-center gap-1 text-2xs"
      >
        {open ? <ChevronDownIcon className="size-3" /> : <ChevronRightIcon className="size-3" />}
        {streaming ? tr("思考中…", "Thinking…") : tr("思考过程", "Thought process")}
      </button>
      {open && <div className="mt-1 border-l border-border pl-3 text-xs whitespace-pre-wrap">{text}</div>}
    </div>
  );
}

const STATUS_ICON = {
  running: <span className="border-primary border-t-primary/30 size-3 animate-spin rounded-full border-2" />,
  waiting: <span className="bg-warning size-2 rounded-full" />,
  completed: <CircleCheckIcon className="text-success size-3.5" />,
  failed: <CircleXIcon className="text-error size-3.5" />,
  cancelled: <span className="bg-muted-foreground size-2 rounded-full" />,
  interrupted: <span className="bg-warning size-2 rounded-full" />,
} as const;

function ToolRow({
  icon,
  title,
  status,
  output,
  exitCode,
  mono,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  status: TurnItem["status"];
  output?: string;
  exitCode?: number;
  mono?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const hasBody = children !== null || (output !== undefined && output.trim().length > 0);
  return (
    <div className="bg-code/40 my-0.5 overflow-hidden rounded-lg border border-border">
      <button
        type="button"
        onClick={() => hasBody && setOpen((previous) => !previous)}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-1.5 text-left",
          hasBody && "cursor-pointer hover:bg-sidebar-row-hover",
        )}
      >
        <span className="text-muted-foreground">{icon}</span>
        <span className={cn("text-xs truncate", mono && "font-mono")}>{title}</span>
        {exitCode !== undefined && exitCode !== 0 && (
          <span className="text-error text-2xs">exit {exitCode}</span>
        )}
        <span className="ml-auto flex items-center gap-1.5">{STATUS_ICON[status]}</span>
      </button>
      {open && (
        <div className="border-border border-t px-3 py-2">
          {children}
          {output !== undefined && output.trim().length > 0 && (
            <pre className="text-2xs text-muted-foreground max-h-64 overflow-auto font-mono whitespace-pre-wrap">
              {output}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function renderDiffText(item: Extract<TurnItem, { type: "file_change" }>): string | undefined {
  if (item.diffStr !== undefined && item.diffStr.trim().length > 0) return item.diffStr;
  if (item.newStr !== undefined && item.newStr.length > 0) {
    return item.newStr.split("\n").map((line) => `+ ${line}`).join("\n");
  }
  return undefined;
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
    transport.dispatch({ type: "approval.respond", requestId, decision, threadId: useAppStore.getState().activeThreadId ?? "" });
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

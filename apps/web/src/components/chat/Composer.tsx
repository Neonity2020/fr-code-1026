/**
 * 输入区（t3code ChatComposer 的轻量版）：同款 ComposerSurface（原样复制）+
 * TipTap 编辑内核 + 底部控制行（模型 chip / 权限模式 chip / 附件 / 圆形发送键），
 * 视觉对齐 t3code 新线程 hero 态。mention、上下文 chip、附件上传等完整能力
 * 后续按 components/chat/ChatComposer.tsx 渐进移植。
 */
import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  ArrowUpIcon,
  ChevronDownIcon,
  LockIcon,
  PaperclipIcon,
  SquareIcon,
} from "lucide-react";
import type { ThreadId } from "@pi-web/protocol";
import { transport } from "@pi-web/client-runtime";
import { ComposerSurface } from "./ComposerSurface";

export function Composer({
  threadId,
  running,
  autoFocus = false,
}: {
  threadId: ThreadId;
  running: boolean;
  autoFocus?: boolean;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false }),
      Placeholder.configure({ placeholder: "Ask for changes, send follow-ups, or attach images" }),
    ],
    editorProps: {
      attributes: {
        class:
          "composer-tiptap-content min-h-14 max-h-64 overflow-y-auto px-3.5 py-3 text-sm outline-none",
        // Placeholder 扩展给空段落加 .is-editor-empty；文案经 CSS 变量传入
        style: "--composer-placeholder: 'Ask for changes, send follow-ups, or attach images'",
        role: "textbox",
        "aria-multiline": "true",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
          event.preventDefault();
          submit();
          return true;
        }
        return false;
      },
    },
  });

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      .composer-tiptap-content p { margin: 0; }
      .composer-tiptap-content p + p { margin-top: 0.5em; }
      .composer-tiptap-content p.is-editor-empty:first-child::before {
        content: var(--composer-placeholder, "");
        color: var(--contrast-placeholder);
        pointer-events: none;
        float: left;
        height: 0;
      }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  useEffect(() => {
    if (autoFocus) {
      const timer = setTimeout(() => editor?.commands.focus("end"), 50);
      return () => clearTimeout(timer);
    }
  }, [autoFocus, editor]);

  const hasText = (editor?.getText().trim().length ?? 0) > 0;

  const submit = () => {
    if (!editor || running) return;
    const text = editor.getText().trim();
    if (text.length === 0) return;
    transport.dispatch({ type: "message.send", threadId, text });
    editor.commands.clearContent();
    editor.commands.focus("end");
  };

  return (
    <ComposerSurface.Shell>
      <ComposerSurface.Host>
        <div className="relative z-10">
          <EditorContent editor={editor} />
          <div className="flex items-center justify-between gap-1 px-2.5 pb-2.5">
            <div className="flex min-w-0 items-center gap-1">
              {/* 模型 chip：pi 单 provider，静态展示 */}
              <ComposerChip icon={<PiGlyph />} label="pi" />
              <ChipSeparator />
              {/* 权限模式 chip：pi 默认 full access，静态展示 */}
              <ComposerChip icon={<LockIcon className="size-3.5" />} label="Full access" />
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                disabled
                title="附件（待实现）"
                className="text-muted-foreground hover:bg-sidebar-row-hover flex size-7 items-center justify-center rounded-md opacity-50"
              >
                <PaperclipIcon className="size-4" />
              </button>
              {running ? (
                <button
                  type="button"
                  onClick={() => transport.dispatch({ type: "thread.stop", threadId })}
                  title="停止"
                  className="bg-message-action text-message-action-foreground flex size-7 items-center justify-center rounded-full"
                >
                  <SquareIcon className="size-3 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  title="发送"
                  disabled={!hasText}
                  className="bg-message-action text-message-action-foreground hover:bg-message-action-hover flex size-7 items-center justify-center rounded-full disabled:opacity-40"
                >
                  <ArrowUpIcon className="size-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </ComposerSurface.Host>
    </ComposerSurface.Shell>
  );
}

function ComposerChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      className="text-muted-foreground hover:bg-sidebar-row-hover flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium"
    >
      {icon}
      <span>{label}</span>
      <ChevronDownIcon className="size-3 opacity-60" />
    </button>
  );
}

function ChipSeparator() {
  return <div className="bg-border mx-0.5 h-4 w-px" />;
}

function PiGlyph() {
  return (
    <svg
      viewBox="165.29 165.29 469.43 469.43"
      aria-hidden="true"
      className="size-3.5 shrink-0 fill-[#0F0F0F] dark:fill-[#F5F5F5]"
    >
      <path
        d="M165.29 165.29H517.36V400H400V517.36H282.65V634.72H165.29ZM282.65 282.65V400H400V282.65Z"
        fillRule="evenodd"
      />
      <path d="M517.36 400H634.72V634.72H517.36Z" />
    </svg>
  );
}

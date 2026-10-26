/**
 * 输入区（t3code ChatComposer 的轻量版）：同款 ComposerSurface（原样复制）+
 * TipTap 编辑内核 + 底部控制行（模型 chip / 权限模式 chip / 附件 / 圆形发送键），
 * 视觉对齐 t3code 新线程 hero 态。mention、上下文 chip、附件上传等完整能力
 * 后续按 components/chat/ChatComposer.tsx 渐进移植。
 */
import { useEffect, useMemo } from "react";
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
import type { PiThinkingLevel, ThreadId } from "@pi-web/protocol";
import { transport, useAppStore } from "@pi-web/client-runtime";
import { useI18n } from "~/i18n";
import { ComposerSurface } from "./ComposerSurface";
import { PiModelPicker, PiThinkingPicker } from "./PiModelPicker";

export function Composer({
  threadId,
  running,
  autoFocus = false,
}: {
  threadId: ThreadId;
  running: boolean;
  autoFocus?: boolean;
}) {
  const piStatus = useAppStore((s) => s.piStatus);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const selectedThinkingLevel = useAppStore((s) => s.selectedThinkingLevel);
  const setSelectedModel = useAppStore((s) => s.setSelectedModel);
  const patchThreadSummary = useAppStore((s) => s.patchThreadSummary);
  const threadSummary = useAppStore((s) => s.threads.find((t) => t.id === threadId));
  const { tr } = useI18n();

  const models = useMemo(() => piStatus?.models ?? [], [piStatus?.models]);
  const effectiveModelSlug =
    threadSummary?.model ??
    selectedModel ??
    piStatus?.defaultModel ??
    models[0]?.slug ??
    null;

  const activeModelInfo = useMemo(() => {
    if (!effectiveModelSlug) return models[0] ?? null;
    return (
      models.find(
        (m) =>
          m.slug.toLowerCase() === effectiveModelSlug.toLowerCase() ||
          m.id === effectiveModelSlug,
      ) ??
      models[0] ??
      null
    );
  }, [effectiveModelSlug, models]);

  const effectiveThinkingLevel: PiThinkingLevel | null =
    threadSummary?.thinkingLevel ??
    selectedThinkingLevel ??
    piStatus?.defaultThinkingLevel ??
    null;

  const handleModelChange = (slug: string) => {
    const nextModel = models.find((m) => m.slug === slug);
    const nextThinking: PiThinkingLevel | null =
      nextModel && nextModel.thinkingLevels.length > 0
        ? effectiveThinkingLevel && nextModel.thinkingLevels.includes(effectiveThinkingLevel)
          ? effectiveThinkingLevel
          : nextModel.thinkingLevels.includes("medium")
            ? "medium"
            : (nextModel.thinkingLevels[0] ?? null)
        : "off";

    setSelectedModel(slug, nextThinking);
    patchThreadSummary(threadId, { model: slug, thinkingLevel: nextThinking });
    transport.dispatch({
      type: "thread.set_model",
      threadId,
      model: slug,
      ...(nextThinking ? { thinkingLevel: nextThinking } : {}),
    });
  };

  const handleThinkingChange = (level: PiThinkingLevel) => {
    const slug = effectiveModelSlug ?? models[0]?.slug;
    if (!slug) return;
    setSelectedModel(slug, level);
    patchThreadSummary(threadId, { model: slug, thinkingLevel: level });
    transport.dispatch({
      type: "thread.set_model",
      threadId,
      model: slug,
      thinkingLevel: level,
    });
  };

  const placeholderText = tr(
    "提出代码修改、继续追问，或附加图片",
    "Ask for changes, send follow-ups, or attach images",
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false }),
      Placeholder.configure({ placeholder: placeholderText }),
    ],
    editorProps: {
      attributes: {
        class:
          "composer-tiptap-content min-h-14 max-h-64 overflow-y-auto px-3.5 py-3 text-sm outline-none",
        // Placeholder 扩展给空段落加 .is-editor-empty；文案经 CSS 变量传入
        style: `--composer-placeholder: '${placeholderText}'`,
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
    editor?.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: {
          class:
            "composer-tiptap-content min-h-14 max-h-64 overflow-y-auto px-3.5 py-3 text-sm outline-none",
          style: `--composer-placeholder: '${placeholderText}'`,
          role: "textbox",
          "aria-multiline": "true",
        },
      },
    });
  }, [editor, placeholderText]);

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
    transport.dispatch({
      type: "message.send",
      threadId,
      text,
      ...(effectiveModelSlug ? { model: effectiveModelSlug } : {}),
      ...(effectiveThinkingLevel ? { thinkingLevel: effectiveThinkingLevel } : {}),
    });
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
              <PiModelPicker
                models={models}
                selectedModelSlug={effectiveModelSlug}
                onSelectModel={handleModelChange}
              />
              {activeModelInfo && activeModelInfo.thinkingLevels.length > 0 ? (
                <>
                  <ChipSeparator />
                  <PiThinkingPicker
                    levels={activeModelInfo.thinkingLevels}
                    selectedLevel={effectiveThinkingLevel}
                    onSelectLevel={handleThinkingChange}
                  />
                </>
              ) : null}
              <ChipSeparator />
              {/* 权限模式 chip：pi 默认 full access，静态展示 */}
              <ComposerChip
                icon={<LockIcon className="size-3.5" />}
                label={tr("完全访问", "Full access")}
              />
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                disabled
                title={tr("附件（待实现）", "Attachments (coming soon)")}
                className="text-muted-foreground hover:bg-sidebar-row-hover flex size-7 items-center justify-center rounded-md opacity-50"
              >
                <PaperclipIcon className="size-4" />
              </button>
              {running ? (
                <button
                  type="button"
                  onClick={() => transport.dispatch({ type: "thread.stop", threadId })}
                  title={tr("停止", "Stop")}
                  className="bg-message-action text-message-action-foreground flex size-7 items-center justify-center rounded-full"
                >
                  <SquareIcon className="size-3 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  title={tr("发送", "Send")}
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

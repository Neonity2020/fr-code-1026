/**
 * 输入区（t3code ChatComposer 的轻量增强版）：
 * - ComposerSurface（原样对齐 t3code Shell / Host / Main / ContextStrip 设计）
 * - TipTap 编辑内核 + 底部控制行（模型 chip / 权限模式 chip / 附件上传 / 圆形发送键）
 * - 附件上传（点击按钮 / 文件拖拽 / 剪贴板截图粘贴），并在 ContextStrip 渲染 Chip
 * - `@` 键呼出工作区文件模糊检索弹出层（ComposerMentionPopup），一键插入文件引用
 * - 草稿持久化与模型/思考档位联动
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  ArrowUpIcon,
  ChevronDownIcon,
  FileCodeIcon,
  LockIcon,
  PaperclipIcon,
  SquareIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import type { AttachmentItem, PiThinkingLevel, ThreadId } from "@pi-web/protocol";
import { transport, useAppStore } from "@pi-web/client-runtime";
import { useI18n } from "~/i18n";
import { ComposerSurface } from "./ComposerSurface";
import { PiModelPicker, PiThinkingPicker } from "./PiModelPicker";
import { useComposerDraftStore } from "./composerDraftStore";
import { ComposerMentionPopup, useThreadFiles } from "./ComposerMentionPopup";

interface MentionState {
  query: string;
  matchStart: number;
  matchEnd: number;
}

function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Mention popup state
  const [mentionState, setMentionState] = useState<MentionState | null>(null);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const allFiles = useThreadFiles(threadId);

  const filteredMentionFiles = useMemo(() => {
    if (!mentionState) return [];
    const q = mentionState.query.trim().toLowerCase();
    if (q.length === 0) return allFiles.slice(0, 10);
    return allFiles
      .filter((file) => file.toLowerCase().includes(q))
      .slice(0, 10);
  }, [mentionState, allFiles]);

  const mentionStateRef = useRef(mentionState);
  mentionStateRef.current = mentionState;
  const filteredFilesRef = useRef(filteredMentionFiles);
  filteredFilesRef.current = filteredMentionFiles;
  const mentionSelectedIndexRef = useRef(mentionSelectedIndex);
  mentionSelectedIndexRef.current = mentionSelectedIndex;

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

  const addFiles = async (files: FileList | File[]) => {
    const newItems: AttachmentItem[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 8 * 1024 * 1024) continue;
      const isImage = file.type.startsWith("image/");
      if (isImage) {
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        newItems.push({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          mimeType: file.type || "image/png",
          size: file.size,
          url: dataUrl,
        });
      } else {
        const text = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsText(file);
        });
        newItems.push({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          mimeType: file.type || "text/plain",
          size: file.size,
          content: text,
        });
      }
    }
    if (newItems.length > 0) {
      setAttachments((prev) => [...prev, ...newItems]);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const placeholderText = tr(
    "提出代码修改、继续追问，输入 @ 引用文件或附加图片",
    "Ask for changes, send follow-ups, type @ to mention files, or attach images",
  );

  const insertMentionFile = (filePath: string) => {
    if (!editor || !mentionStateRef.current) return;
    const { matchStart, matchEnd } = mentionStateRef.current;
    editor
      .chain()
      .focus()
      .deleteRange({ from: matchStart, to: matchEnd })
      .insertContent(`@${filePath} `)
      .run();
    setMentionState(null);
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false }),
      Placeholder.configure({ placeholder: placeholderText }),
    ],
    editorProps: {
      attributes: {
        class:
          "composer-tiptap-content min-h-14 max-h-64 overflow-y-auto px-3.5 py-3 text-sm outline-none",
        style: `--composer-placeholder: '${placeholderText}'`,
        role: "textbox",
        "aria-multiline": "true",
      },
      handleKeyDown: (_view, event) => {
        if (mentionStateRef.current && filteredFilesRef.current.length > 0) {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setMentionSelectedIndex(
              (prev) => (prev + 1) % filteredFilesRef.current.length,
            );
            return true;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setMentionSelectedIndex(
              (prev) =>
                (prev - 1 + filteredFilesRef.current.length) %
                filteredFilesRef.current.length,
            );
            return true;
          }
          if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            const selected = filteredFilesRef.current[mentionSelectedIndexRef.current];
            if (selected) {
              insertMentionFile(selected);
              return true;
            }
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setMentionState(null);
            return true;
          }
        }

        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
          event.preventDefault();
          submit();
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const files = event.clipboardData?.files;
        if (files && files.length > 0) {
          event.preventDefault();
          void addFiles(files);
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

  // 草稿：挂载时恢复未发送的内容，编辑时保存
  const restoredDraftRef = useRef(false);
  const setDraft = useComposerDraftStore((state) => state.setDraft);
  const clearDraft = useComposerDraftStore((state) => state.clearDraft);

  useEffect(() => {
    if (!editor || restoredDraftRef.current) return;
    restoredDraftRef.current = true;
    const saved = useComposerDraftStore.getState().getDraft(threadId);
    if (saved.length > 0) editor.commands.setContent(saved);
  }, [editor, threadId]);

  useEffect(() => {
    if (!editor) return;
    const onUpdate = ({ editor: updated }: { editor: NonNullable<typeof editor> }) => {
      setDraft(threadId, updated.getText());

      // Check cursor for @ mention
      const { from, to } = updated.state.selection;
      if (from === to) {
        const textBefore = updated.state.doc.textBetween(
          Math.max(0, from - 50),
          from,
          "\n",
          "\0",
        );
        const match = textBefore.match(/(?:^|\s)@([^\s]*)$/);
        if (match) {
          const query = match[1]!;
          const matchStart = from - query.length - 1;
          setMentionState({ query, matchStart, matchEnd: from });
          setMentionSelectedIndex(0);
        } else {
          setMentionState(null);
        }
      } else {
        setMentionState(null);
      }
    };

    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
    };
  }, [editor, setDraft, threadId]);

  const hasText = (editor?.getText().trim().length ?? 0) > 0;
  const canSend = (hasText || attachments.length > 0) && !running;

  const submit = () => {
    if (!editor || running) return;
    const text = editor.getText().trim();
    if (text.length === 0 && attachments.length === 0) return;

    transport.dispatch({
      type: "message.send",
      threadId,
      text: text.length > 0 ? text : tr("请查看附加的内容", "Please see attached content"),
      ...(effectiveModelSlug ? { model: effectiveModelSlug } : {}),
      ...(effectiveThinkingLevel ? { thinkingLevel: effectiveThinkingLevel } : {}),
      ...(attachments.length > 0 ? { attachments } : {}),
    });
    editor.commands.clearContent();
    editor.commands.focus("end");
    clearDraft(threadId);
    setAttachments([]);
    setMentionState(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void addFiles(e.dataTransfer.files);
    }
  };

  return (
    <>
      <ComposerSurface.Shell contextStrip={attachments.length > 0}>
        <ComposerSurface.Host
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-background/90 backdrop-blur-xs">
              <p className="flex items-center gap-2 text-sm font-medium text-primary">
                <UploadIcon className="size-4 animate-bounce" />
                {tr("拖放文件或图片至此添加为上下文", "Drop files or images here to add as context")}
              </p>
            </div>
          )}

          <div className="relative z-10">
            {mentionState && (
              <ComposerMentionPopup
                threadId={threadId}
                query={mentionState.query}
                selectedIndex={mentionSelectedIndex}
                onSelect={insertMentionFile}
                onClose={() => setMentionState(null)}
              />
            )}

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
                {/* 权限模式 chip：pi 默认 full access */}
                <ComposerChip
                  icon={<LockIcon className="size-3.5" />}
                  label={tr("完全访问", "Full access")}
                />
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={(e) => {
                    if (e.target.files) void addFiles(e.target.files);
                    e.target.value = "";
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title={tr("添加附件或图片", "Add attachment or image")}
                  className="text-muted-foreground hover:bg-sidebar-row-hover flex size-7 items-center justify-center rounded-md transition-colors"
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
                    disabled={!canSend}
                    className="bg-message-action text-message-action-foreground hover:bg-message-action-hover flex size-7 items-center justify-center rounded-full disabled:opacity-40 transition-opacity"
                  >
                    <ArrowUpIcon className="size-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </ComposerSurface.Host>

        {attachments.length > 0 && (
          <ComposerSurface.ContextStrip>
            <div className="flex w-full items-center gap-1.5 overflow-x-auto py-1">
              {attachments.map((att) => {
                const isImage = att.mimeType.startsWith("image/") && att.url;
                return (
                  <div
                    key={att.id}
                    className="group flex shrink-0 items-center gap-1.5 rounded-lg border border-border/70 bg-card/90 px-2 py-1 text-xs text-foreground shadow-xs transition-colors hover:border-border"
                  >
                    {isImage ? (
                      <button
                        type="button"
                        onClick={() => setPreviewImage(att.url!)}
                        className="size-5 shrink-0 overflow-hidden rounded cursor-zoom-in"
                      >
                        <img src={att.url} alt={att.name} className="size-full object-cover" />
                      </button>
                    ) : (
                      <FileCodeIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="font-mono text-2xs truncate max-w-[120px]" title={att.name}>
                      {att.name}
                    </span>
                    <span className="text-3xs text-muted-foreground">
                      {formatAttachmentSize(att.size)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(att.id)}
                      className="ml-0.5 text-muted-foreground hover:text-foreground rounded p-0.5 transition-colors"
                      aria-label={tr("移除附件", "Remove attachment")}
                    >
                      <XIcon className="size-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </ComposerSurface.ContextStrip>
        )}
      </ComposerSurface.Shell>

      {previewImage && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
        >
          <div className="relative max-h-full max-w-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={previewImage}
              alt="Preview"
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              aria-label="Close preview"
              className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function ComposerChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      className="text-muted-foreground hover:bg-sidebar-row-hover flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors"
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

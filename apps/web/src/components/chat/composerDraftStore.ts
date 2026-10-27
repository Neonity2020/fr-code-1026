/**
 * Composer 草稿：按线程保存未发送的输入，切换线程不再丢内容。
 * 对齐 t3code composerDraftStore 的行为（本项目只需要纯文本草稿）。
 */
import { create } from "zustand";

const STORAGE_KEY = "fr-code:composer-drafts:v1";

function readDrafts(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const drafts: Record<string, string> = {};
    for (const [threadId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string" && value.length > 0) drafts[threadId] = value;
    }
    return drafts;
  } catch {
    return {};
  }
}

function writeDrafts(drafts: Record<string, string>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // 存储不可用时只保留内存状态
  }
}

export interface ComposerDraftStore {
  drafts: Record<string, string>;
  getDraft: (threadId: string) => string;
  setDraft: (threadId: string, text: string) => void;
  clearDraft: (threadId: string) => void;
}

export const useComposerDraftStore = create<ComposerDraftStore>((set, get) => ({
  drafts: readDrafts(),
  getDraft: (threadId) => get().drafts[threadId] ?? "",
  setDraft: (threadId, text) =>
    set((state) => {
      const next = { ...state.drafts };
      if (text.trim().length === 0) delete next[threadId];
      else next[threadId] = text;
      writeDrafts(next);
      return { drafts: next };
    }),
  clearDraft: (threadId) =>
    set((state) => {
      if (state.drafts[threadId] === undefined) return state;
      const next = { ...state.drafts };
      delete next[threadId];
      writeDrafts(next);
      return { drafts: next };
    }),
}));

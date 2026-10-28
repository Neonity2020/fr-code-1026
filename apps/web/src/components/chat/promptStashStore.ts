/**
 * 提示词暂存（对齐 t3code `promptStashStore`）：
 * - ⌘S / Ctrl+S 把 composer 当前内容压入暂存队列，输入区随即清空
 * - 队列持久化在 localStorage，图片附件按字符预算裁剪（超预算的附件只记名字）
 * - 菜单里可以恢复（take）或删除条目
 *
 * 与 t3code 的差异：本项目附件统一用 `AttachmentItem`（data URL），
 * 没有单独的「已上传文件」通道，所以只保留图片/文本附件一种形态。
 */
import { create } from "zustand";
import type { AttachmentItem } from "@pi-web/protocol";

export const PROMPT_STASH_STORAGE_KEY = "fr-code:prompt-stash:v1";
/** 队列上限：超出后最旧的条目被挤出。 */
export const MAX_STASH_ENTRIES = 20;
/**
 * 单条条目的附件字符预算。localStorage 是同源共享的 ~5MB 配额，
 * 超出预算的图片直接丢弃（只留名字），提示词本身一定保留。
 */
export const MAX_STASH_ENTRY_ATTACHMENT_CHARS = 2_700_000;

export interface PromptStashEntry {
  id: string;
  createdAt: number;
  prompt: string;
  attachments: AttachmentItem[];
  /** 因超出附件预算而未能保存的附件名。 */
  droppedAttachmentNames: string[];
}

interface PersistedState {
  version: 1;
  state: { entries: PromptStashEntry[] };
}

function resolveStorage(): { storage: Storage | null; durable: boolean } {
  // localStorage 的访问本身可能抛 SecurityError（策略禁用 / 沙箱 iframe），
  // 所以不只是 get/set 要包一层，读取属性也要包。
  try {
    const globalLocalStorage = (globalThis as { localStorage?: Storage }).localStorage;
    if (globalLocalStorage) return { storage: globalLocalStorage, durable: true };
  } catch {
    // 落到 window.localStorage 兜底
  }
  try {
    const windowLocalStorage = (globalThis as { window?: { localStorage?: Storage } }).window
      ?.localStorage;
    if (windowLocalStorage) return { storage: windowLocalStorage, durable: true };
  } catch {
    // 落到内存实现
  }
  return { storage: null, durable: false };
}

const { storage, durable: storageIsDurable } = resolveStorage();

/** 内存兜底：localStorage 不可用时依然能暂存，只是刷新后丢失。 */
const memoryFallback = new Map<string, string>();

function readRaw(key: string): string | null {
  if (storage) {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  }
  return memoryFallback.get(key) ?? null;
}

function writeRaw(key: string, value: string): boolean {
  if (storage) {
    try {
      storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
  memoryFallback.set(key, value);
  return true;
}

function persistEntries(entries: PromptStashEntry[]): { written: boolean; durable: boolean } {
  const payload: PersistedState = { version: 1, state: { entries } };
  try {
    const written = writeRaw(PROMPT_STASH_STORAGE_KEY, JSON.stringify(payload));
    return { written, durable: written && storageIsDurable };
  } catch {
    return { written: false, durable: false };
  }
}

function readPersistedEntries(): PromptStashEntry[] {
  try {
    const raw = readRaw(PROMPT_STASH_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<PersistedState> | null;
    const entries = parsed?.state?.entries;
    if (!Array.isArray(entries)) return [];
    return entries.filter(
      (entry): entry is PromptStashEntry =>
        !!entry && typeof entry.id === "string" && typeof entry.prompt === "string",
    );
  } catch {
    return [];
  }
}

/**
 * 按预算切分附件：早加入的优先保留，超出预算的附件只留下名字。
 */
export function partitionStashAttachments(attachments: AttachmentItem[]): {
  kept: AttachmentItem[];
  droppedNames: string[];
} {
  const kept: AttachmentItem[] = [];
  const droppedNames: string[] = [];
  let usedChars = 0;
  for (const attachment of attachments) {
    const size = attachment.url?.length ?? attachment.content?.length ?? 0;
    if (usedChars + size > MAX_STASH_ENTRY_ATTACHMENT_CHARS) {
      droppedNames.push(attachment.name);
      continue;
    }
    usedChars += size;
    kept.push(attachment);
  }
  return { kept, droppedNames };
}

export interface PromptStashStore {
  entries: PromptStashEntry[];
  /** 压入队列；超出上限时挤出最旧条目。写入失败时返回 written=false。 */
  stashEntry: (
    entry: PromptStashEntry,
  ) => { evicted: PromptStashEntry | null; written: boolean; durable: boolean };
  /** 取出并移除条目（恢复语义）。 */
  takeEntry: (entryId: string) => { entry: PromptStashEntry | null; durable: boolean };
  /** 仅移除条目（删除语义）。 */
  removeEntry: (entryId: string) => { removed: PromptStashEntry | null; durable: boolean };
}

export const usePromptStashStore = create<PromptStashStore>((set, get) => ({
  entries: readPersistedEntries(),
  stashEntry: (entry) => {
    const nextEntries = [entry, ...get().entries];
    const evicted = nextEntries.length > MAX_STASH_ENTRIES ? (nextEntries.pop() ?? null) : null;
    const { written, durable } = persistEntries(nextEntries);
    // 写盘失败时不能留下可见条目：调用方会保留 composer 内容，
    // 否则会同时存在两份提示词。
    if (!written) return { evicted: null, written: false, durable: false };
    set(() => ({ entries: nextEntries }));
    return { evicted, written: true, durable };
  },
  takeEntry: (entryId) => {
    const entries = get().entries;
    const entry = entries.find((candidate) => candidate.id === entryId) ?? null;
    if (!entry) return { entry: null, durable: true };
    const nextEntries = entries.filter((candidate) => candidate.id !== entryId);
    const { durable } = persistEntries(nextEntries);
    set(() => ({ entries: nextEntries }));
    return { entry, durable };
  },
  removeEntry: (entryId) => {
    const entries = get().entries;
    const removed = entries.find((candidate) => candidate.id === entryId) ?? null;
    if (!removed) return { removed: null, durable: true };
    const nextEntries = entries.filter((candidate) => candidate.id !== entryId);
    const { durable } = persistEntries(nextEntries);
    set(() => ({ entries: nextEntries }));
    return { removed, durable };
  },
}));

/** 生成条目 id（测试可注入固定值）。 */
export function createStashEntryId(): string {
  return `stash-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 客户端状态：zustand 单 store。
 * 结构对齐 t3code client-runtime 的 EnvironmentThreadState 思路：
 * 每线程持有 items（投影）+ sequence 游标 + status。
 */
import { create } from "zustand";
import {
  upsertTurnItem,
  type PiStatus,
  type PiThinkingLevel,
  type ThreadId,
  type ThreadSummary,
  type TurnItem,
} from "@pi-web/protocol";

export type ThreadLiveStatus = "empty" | "loading" | "live";
export type ConnectionStatus = "connecting" | "online" | "offline";
export type SidebarUtilityPage = "settings" | "pull-requests" | "usage";
export type AppLocale = "zh-CN" | "en";
export type SettingsSectionId =
  | "general"
  | "appearance"
  | "keybindings"
  | "snap-shots"
  | "providers"
  | "integrations"
  | "scheduled-tasks"
  | "source-control"
  | "storage"
  | "connections"
  | "archived";

const LOCALE_STORAGE_KEY = "fr-code:locale";
const ACTIVE_THREAD_STORAGE_KEY = "fr-code:active-thread-id";

function readInitialLocale(): AppLocale {
  try {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      if (saved === "zh-CN" || saved === "en") {
        document.documentElement.lang = saved;
        return saved;
      }
      document.documentElement.lang = "zh-CN";
    }
  } catch {
    // ignore storage errors
  }
  return "zh-CN";
}

function readInitialActiveThreadId(): ThreadId | null {
  try {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(ACTIVE_THREAD_STORAGE_KEY);
      return saved && saved.trim().length > 0 ? saved : null;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

function writeActiveThreadId(threadId: ThreadId | null): void {
  try {
    if (typeof window !== "undefined") {
      if (threadId) {
        window.localStorage.setItem(ACTIVE_THREAD_STORAGE_KEY, threadId);
      } else {
        window.localStorage.removeItem(ACTIVE_THREAD_STORAGE_KEY);
      }
    }
  } catch {
    // ignore storage errors
  }
}

export interface ThreadUndoNotice {
  kind: "settled" | "snoozed";
  threadId: ThreadId;
  title: string;
}

export interface ThreadState {
  items: TurnItem[];
  /** 已应用到的最新 sequence（断线重连时作 afterSequence 续传游标） */
  sequence: number;
  status: ThreadLiveStatus;
}

export interface AppStore {
  threads: ThreadSummary[];
  /** 服务端首帧 threads 列表是否已到达（防止刷新时因空数组竞态误触发自动新建线程） */
  threadsLoaded: boolean;
  projects: string[];
  selectedProjectCwd: string | null;
  activeThreadId: ThreadId | null;
  activeUtilityPage: SidebarUtilityPage | null;
  activeSettingsSection: SettingsSectionId;
  undoNotice: ThreadUndoNotice | null;
  byThread: Record<ThreadId, ThreadState>;
  connection: ConnectionStatus;
  defaultCwd: string | null;
  piStatus: PiStatus | null;
  selectedModel: string | null;
  selectedThinkingLevel: PiThinkingLevel | null;
  locale: AppLocale;
  /** 「新建线程」意图：下一个 thread.created 事件到达时自动选中 */
  newThreadRequested: boolean;
  /** 命令面板是否打开（侧边栏与快捷键共用同一个入口） */
  commandPaletteOpen: boolean;

  setConnection(connection: ConnectionStatus): void;
  setLocale(locale: AppLocale): void;
  setThreads(threads: ThreadSummary[]): void;
  setProjects(projects: string[]): void;
  setSelectedProjectCwd(cwd: string | null): void;
  setActiveUtilityPage(page: SidebarUtilityPage | null): void;
  setActiveSettingsSection(section: SettingsSectionId): void;
  setUndoNotice(notice: ThreadUndoNotice | null): void;
  patchThreadSummary(threadId: ThreadId, patch: Partial<ThreadSummary>): void;
  setConfig(config: { defaultCwd: string; projects?: string[]; piStatus: PiStatus | null }): void;
  setSelectedModel(model: string, thinkingLevel?: PiThinkingLevel | null): void;
  setActiveThread(threadId: ThreadId | null): void;
  markNewThreadRequested(): void;
  setCommandPaletteOpen(open: boolean): void;
  setThreadStatus(threadId: ThreadId, status: ThreadLiveStatus): void;
  applySnapshot(threadId: ThreadId, snapshotSequence: number, items: TurnItem[]): void;
  /** 按序号去重折叠事件（对齐 t3code applyItems 的 sequence 门控） */
  applyEvent(
    threadId: ThreadId,
    sequence: number,
    eventType: string,
    apply: () => TurnItem[] | null,
  ): void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  threads: [],
  threadsLoaded: false,
  projects: [],
  selectedProjectCwd: null,
  activeThreadId: readInitialActiveThreadId(),
  activeUtilityPage: null,
  activeSettingsSection: "general",
  undoNotice: null,
  byThread: {},
  connection: "connecting",
  defaultCwd: null,
  piStatus: null,
  selectedModel: null,
  selectedThinkingLevel: null,
  locale: readInitialLocale(),
  newThreadRequested: false,
  commandPaletteOpen: false,

  setConnection: (connection) => set({ connection }),
  setLocale: (locale) => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
        document.documentElement.lang = locale;
      }
    } catch {
      // ignore storage errors
    }
    set({ locale });
  },
  setThreads: (threads) => set({ threads, threadsLoaded: true }),
  setProjects: (projects) => set({ projects }),
  setSelectedProjectCwd: (selectedProjectCwd) => set({ selectedProjectCwd }),
  setActiveUtilityPage: (activeUtilityPage) => set({ activeUtilityPage }),
  setActiveSettingsSection: (activeSettingsSection) => set({ activeSettingsSection }),
  setUndoNotice: (undoNotice) => set({ undoNotice }),
  patchThreadSummary: (threadId, patch) =>
    set((state) => ({
      threads: state.threads.map((thread) =>
        thread.id === threadId ? { ...thread, ...patch } : thread,
      ),
    })),
  setConfig: ({ defaultCwd, projects, piStatus }) =>
    set((state) => ({
      defaultCwd,
      piStatus,
      selectedModel:
        state.selectedModel ??
        piStatus?.defaultModel ??
        piStatus?.models?.[0]?.slug ??
        null,
      selectedThinkingLevel:
        state.selectedThinkingLevel ?? piStatus?.defaultThinkingLevel ?? null,
      projects:
        projects && projects.length > 0
          ? projects
          : state.projects.length > 0
            ? state.projects
            : [defaultCwd],
    })),
  setSelectedModel: (model, thinkingLevel) =>
    set((state) => ({
      selectedModel: model,
      selectedThinkingLevel:
        thinkingLevel !== undefined ? thinkingLevel : state.selectedThinkingLevel,
    })),
  setActiveThread: (threadId) => {
    writeActiveThreadId(threadId);
    set({ activeThreadId: threadId, activeUtilityPage: null });
  },
  markNewThreadRequested: () => set({ newThreadRequested: true }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setThreadStatus: (threadId, status) =>
    set((state) => ({
      byThread: {
        ...state.byThread,
        [threadId]: { items: [], sequence: 0, ...(state.byThread[threadId] ?? {}), status },
      },
    })),

  applySnapshot: (threadId, snapshotSequence, items) =>
    set((state) => ({
      byThread: {
        ...state.byThread,
        [threadId]: {
          items,
          sequence: snapshotSequence,
          status: state.byThread[threadId]?.status ?? "loading",
        },
      },
    })),

  applyEvent: (threadId, sequence, _eventType, apply) => {
    const current = get().byThread[threadId];
    // 序号门控：旧事件直接丢弃（对齐 shellReducer 的 sequence 门）
    if (current && sequence <= current.sequence) return;
    const nextItems = apply() ?? current?.items ?? [];
    set((state) => ({
      byThread: {
        ...state.byThread,
        [threadId]: {
          items: nextItems,
          sequence,
          status: state.byThread[threadId]?.status ?? "live",
        },
      },
    }));
  },
}));

export { upsertTurnItem as upsertItem };

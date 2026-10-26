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
  /** 「新建线程」意图：下一个 thread.created 事件到达时自动选中 */
  newThreadRequested: boolean;

  setConnection(connection: ConnectionStatus): void;
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
  projects: [],
  selectedProjectCwd: null,
  activeThreadId: null,
  activeUtilityPage: null,
  activeSettingsSection: "general",
  undoNotice: null,
  byThread: {},
  connection: "connecting",
  defaultCwd: null,
  piStatus: null,
  selectedModel: null,
  selectedThinkingLevel: null,
  newThreadRequested: false,

  setConnection: (connection) => set({ connection }),
  setThreads: (threads) => set({ threads }),
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
  setActiveThread: (threadId) => set({ activeThreadId: threadId, activeUtilityPage: null }),
  markNewThreadRequested: () => set({ newThreadRequested: true }),
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

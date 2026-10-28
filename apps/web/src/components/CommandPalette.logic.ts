/**
 * 命令面板纯逻辑,对齐 t3code CommandPalette.logic.ts:
 * - 条目/分组模型(action + submenu)
 * - `>` 前缀动作过滤、分词匹配与排序(rankCommandPaletteItemMatch)
 * - 线程/项目条目构建
 * - 面板开合 reducer(含 add-project / new-thread-in 打开意图)
 *
 * 注意:命令面板本体已重构到 components/command-palette/;
 * 这里现在只服务于 ⌘P 文件选择器（components/files/ProjectFilePicker）。
 */
import type { ReactNode } from "react";
import type { ThreadId, ThreadSummary } from "@pi-web/protocol";
import { projectBasename } from "../projectIdentity.ts";
import { formatCompactRelativeTime } from "./Sidebar.snooze.ts";

import { normalizeSearchText } from "../lib/utils.ts";

export { normalizeSearchText };

export const RECENT_THREAD_LIMIT = 12;
export const ITEM_ICON_CLASS = "size-4 text-icon-muted";
export const ADDON_ICON_CLASS = "size-4";

export type CommandPaletteOpenIntentKind = "add-project" | "new-thread-in";

export interface CommandPaletteOpenIntent {
  readonly kind: CommandPaletteOpenIntentKind;
}

/**
 * 全局搜索浮层承载互斥的几个表面(对齐 t3code):⌘K 命令面板、⌘P 文件选择器。
 * 同一 reducer 持有 open/mode,保证表面不会叠加、重复按快捷键即关闭。
 */
export type SearchOverlayMode = "command" | "files";

export interface CommandPaletteUiState {
  readonly open: boolean;
  readonly mode: SearchOverlayMode;
  readonly openIntent: CommandPaletteOpenIntent | null;
}

export type CommandPaletteUiAction =
  | { readonly _tag: "SetOpen"; readonly open: boolean }
  | { readonly _tag: "ToggleMode"; readonly mode: SearchOverlayMode }
  | { readonly _tag: "OpenAddProject" }
  | { readonly _tag: "OpenNewThreadIn" }
  | { readonly _tag: "ClearOpenIntent" };

export function reduceCommandPaletteUiState(
  state: CommandPaletteUiState,
  action: CommandPaletteUiAction,
): CommandPaletteUiState {
  switch (action._tag) {
    case "SetOpen":
      return action.open
        ? { open: true, mode: state.mode, openIntent: state.openIntent }
        : { ...state, open: false, openIntent: null };
    case "ToggleMode":
      return state.open && state.mode === action.mode
        ? { ...state, open: false, openIntent: null }
        : { open: true, mode: action.mode, openIntent: null };
    case "OpenAddProject":
      return { open: true, mode: "command", openIntent: { kind: "add-project" } };
    case "OpenNewThreadIn":
      return { open: true, mode: "command", openIntent: { kind: "new-thread-in" } };
    case "ClearOpenIntent":
      return state.openIntent ? { ...state, openIntent: null } : state;
  }
}

export interface CommandPaletteThreadContentMatch {
  readonly source: "user" | "assistant";
  readonly snippet: string;
  readonly query: string;
}

export interface CommandPaletteItem {
  readonly kind: "action" | "submenu";
  readonly value: string;
  readonly searchTerms: ReadonlyArray<string>;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly threadContentMatch?: CommandPaletteThreadContentMatch;
  readonly timestamp?: string;
  readonly icon: ReactNode;
  readonly disabled?: boolean;
  /** Optional content rendered inline before the title text. */
  readonly titleLeadingContent?: ReactNode;
  /** Optional content rendered inline after the title text (before the timestamp). */
  readonly titleTrailingContent?: ReactNode;
  /** Static shortcut label (e.g. "⌘B") shown in the trailing gutter. */
  readonly shortcut?: string;
}

export interface CommandPaletteActionItem extends CommandPaletteItem {
  readonly kind: "action";
  readonly keepOpen?: boolean;
  readonly run: () => Promise<void> | void;
}

export interface CommandPaletteSubmenuItem extends CommandPaletteItem {
  readonly kind: "submenu";
  readonly addonIcon: ReactNode;
  readonly groups: ReadonlyArray<CommandPaletteGroup>;
  readonly initialQuery?: string;
}

export interface CommandPaletteGroup {
  readonly value: string;
  readonly label: string;
  readonly items: ReadonlyArray<CommandPaletteActionItem | CommandPaletteSubmenuItem>;
}

export interface CommandPaletteView {
  readonly addonIcon: ReactNode;
  readonly groups: ReadonlyArray<CommandPaletteGroup>;
  readonly initialQuery?: string;
}

/** 项目 = 线程 cwd 的去重集合;条目 value 前缀避免与线程 value 撞车。 */
export function buildProjectActionItems(input: {
  cwds: ReadonlyArray<string>;
  valuePrefix: string;
  icon: (cwd: string) => ReactNode;
  runProject: (cwd: string) => Promise<void> | void;
  renderDescription?: (cwd: string) => ReactNode;
}): CommandPaletteActionItem[] {
  return input.cwds.map((cwd) => ({
    kind: "action" as const,
    value: `${input.valuePrefix}:${cwd}`,
    searchTerms: [projectBasename(cwd), cwd],
    title: projectBasename(cwd),
    description: input.renderDescription?.(cwd) ?? cwd,
    icon: input.icon(cwd),
    run: () => input.runProject(cwd),
  }));
}

/**
 * 线程条目:置顶优先,其余按 updatedAt 倒序(与侧栏活跃收件箱一致),
 * 描述行 = 项目名 · #分支 · (当前线程)。
 */
export function buildThreadActionItems(input: {
  threads: ReadonlyArray<ThreadSummary>;
  activeThreadId?: ThreadId | null;
  icon: ReactNode;
  formatTimestamp?: (thread: ThreadSummary) => string;
  renderLeadingContent?: (thread: ThreadSummary) => ReactNode;
  renderTrailingContent?: (thread: ThreadSummary) => ReactNode;
  runThread: (threadId: ThreadId) => Promise<void> | void;
  limit?: number;
}): CommandPaletteActionItem[] {
  const sorted = [...input.threads].sort((a, b) => {
    const aPinned = a.pinnedAt ?? 0;
    const bPinned = b.pinnedAt ?? 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    return b.updatedAt - a.updatedAt;
  });
  const visible = input.limit === undefined ? sorted : sorted.slice(0, input.limit);

  return visible.map((thread) => {
    const projectTitle = projectBasename(thread.cwd);
    const descriptionParts: string[] = [projectTitle];
    if (thread.branch) {
      descriptionParts.push(`#${thread.branch}`);
    }
    if (thread.id === input.activeThreadId) {
      descriptionParts.push("Current thread");
    }

    return {
      kind: "action" as const,
      value: `thread:${thread.id}`,
      searchTerms: [thread.title, projectTitle, thread.cwd, thread.branch ?? ""],
      title: thread.title,
      description: descriptionParts.join(" · "),
      timestamp: input.formatTimestamp?.(thread),
      icon: input.icon,
      ...(input.renderLeadingContent ? { titleLeadingContent: input.renderLeadingContent(thread) } : {}),
      ...(input.renderTrailingContent ? { titleTrailingContent: input.renderTrailingContent(thread) } : {}),
      run: () => input.runThread(thread.id),
    };
  });
}

function rankSearchFieldMatch(
  field: string,
  normalizedQuery: string,
  queryTokens: ReadonlyArray<string>,
): number {
  const normalizedField = normalizeSearchText(field);
  if (
    normalizedField.length === 0 ||
    !queryTokens.every((token) => normalizedField.includes(token))
  ) {
    return Number.NEGATIVE_INFINITY;
  }
  if (normalizedField === normalizedQuery) {
    return 3;
  }
  if (normalizedField.startsWith(normalizedQuery)) {
    return 2;
  }
  if (normalizedField.includes(normalizedQuery)) {
    return 1;
  }
  return 0;
}

function rankCommandPaletteItemMatch(
  item: CommandPaletteActionItem | CommandPaletteSubmenuItem,
  normalizedQuery: string,
  queryTokens: ReadonlyArray<string>,
): number {
  const terms = item.searchTerms.filter((term) => term.length > 0);
  if (terms.length === 0) {
    return 0;
  }

  for (const [index, field] of terms.entries()) {
    const fieldRank = rankSearchFieldMatch(field, normalizedQuery, queryTokens);
    if (fieldRank !== Number.NEGATIVE_INFINITY) {
      return 1_000 - index * 100 + fieldRank;
    }
  }

  return 0;
}

/**
 * 根过滤:`>` 前缀只保留 actions 分组;空查询保留 recent-threads,
 * 非空查询追加全量 projects / threads 搜索分组并按相关度重排。
 */
export function filterCommandPaletteGroups(input: {
  activeGroups: ReadonlyArray<CommandPaletteGroup>;
  query: string;
  isInSubmenu: boolean;
  projectSearchItems: ReadonlyArray<CommandPaletteActionItem>;
  threadSearchItems: ReadonlyArray<CommandPaletteActionItem>;
}): CommandPaletteGroup[] {
  const isActionsFilter = input.query.startsWith(">");
  const searchQuery = isActionsFilter ? input.query.slice(1) : input.query;
  const normalizedQuery = normalizeSearchText(searchQuery);

  if (normalizedQuery.length === 0) {
    if (isActionsFilter) {
      return input.activeGroups.filter((group) => group.value !== "recent-threads");
    }
    return [...input.activeGroups];
  }
  const queryTokens = normalizedQuery.split(" ");

  // 子菜单的 activeGroups 本就不含 recent-threads;`>` 与普通查询都从动作分组里搜。
  const baseGroups = input.activeGroups.filter((group) => group.value !== "recent-threads");

  const searchableGroups = [...baseGroups];
  if (!input.isInSubmenu && !isActionsFilter) {
    if (input.projectSearchItems.length > 0) {
      searchableGroups.push({
        value: "projects-search",
        label: "Projects",
        items: input.projectSearchItems,
      });
    }
    if (input.threadSearchItems.length > 0) {
      searchableGroups.push({
        value: "threads-search",
        label: "Threads",
        items: input.threadSearchItems,
      });
    }
  }

  return searchableGroups.flatMap((group) => {
    const entries: Array<{
      item: CommandPaletteActionItem | CommandPaletteSubmenuItem;
      index: number;
      rank: number;
    }> = [];
    group.items.forEach((item, index) => {
      const haystack = normalizeSearchText(item.searchTerms.join(" "));
      if (!queryTokens.every((token) => haystack.includes(token))) {
        return;
      }
      entries.push({
        item,
        index,
        rank: rankCommandPaletteItemMatch(item, normalizedQuery, queryTokens),
      });
    });
    entries.sort((left, right) => right.rank - left.rank || left.index - right.index);
    const items = entries.map((entry) => entry.item);

    if (items.length === 0) {
      return [];
    }

    return [{ value: group.value, label: group.label, items }];
  });
}

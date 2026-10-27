/**
 * 命令面板的数据模型与过滤逻辑（对齐 t3code CommandPalette.logic 的核心部分）。
 *
 * 这里只放纯函数：条目结构、分组过滤与排序。打分复用 @pi-web/shared/paletteSearch，
 * 与 t3code 同一套「词首命中 > 关键词命中 > 拼写容错」的排序规则。
 */
import {
  foldSearchQuery,
  PALETTE_SECONDARY_LIMIT,
  PALETTE_THREAD_LIMIT,
  rankSearchGroups,
  scoreSearchTerms,
  type SearchRange,
} from "@pi-web/shared/paletteSearch";

export interface CommandPaletteItem {
  /** 唯一标识，同时作为 base-ui Autocomplete 的选中值。 */
  value: string;
  title: string;
  description?: string;
  /** 隐藏但可被搜索的关键词。 */
  keywords?: ReadonlyArray<string>;
  /** 右侧快捷键提示。 */
  shortcut?: string;
  /** 所属分组（对应 `CommandPaletteGroup.value`）。 */
  group: string;
  run: () => void;
}

export interface CommandPaletteGroup {
  value: string;
  label: string;
  items: ReadonlyArray<CommandPaletteItem>;
}

export interface RankedCommandPaletteItem extends CommandPaletteItem {
  /** base-ui Autocomplete 用来生成无障碍标签的文本。 */
  label: string;
  /** 标题里的命中区间，用于高亮。 */
  ranges: ReadonlyArray<SearchRange>;
}

export interface RankedCommandPaletteGroup {
  value: string;
  label: string;
  items: ReadonlyArray<RankedCommandPaletteItem>;
}

export const COMMAND_PALETTE_THREAD_GROUP = "threads";
export const COMMAND_PALETTE_ACTION_GROUP = "actions";
export const COMMAND_PALETTE_PROJECT_GROUP = "projects";

/** 分组内的显示上限：线程组给足额度，其余分组只展示最好的几条。 */
function groupLimit(groupValue: string, threadsMatched: boolean): number {
  if (groupValue === COMMAND_PALETTE_THREAD_GROUP) return PALETTE_THREAD_LIMIT;
  return threadsMatched ? PALETTE_SECONDARY_LIMIT : Number.POSITIVE_INFINITY;
}

/**
 * 按查询过滤并排序分组。
 * 空查询时原样返回（按传入顺序），有查询时只保留命中的条目。
 */
export function filterCommandPaletteGroups(
  groups: ReadonlyArray<CommandPaletteGroup>,
  query: string,
): ReadonlyArray<RankedCommandPaletteGroup> {
  const normalizedQuery = foldSearchQuery(query);
  if (normalizedQuery.length === 0) {
    return groups.map((group) => ({
      value: group.value,
      label: group.label,
      items: group.items.map((item) => ({ ...item, label: item.title, ranges: [] })),
    }));
  }

  const ranked = rankSearchGroups(
    groups.map((group) => ({ group, items: group.items })),
    (item) => scoreSearchTerms(normalizedQuery, [item.title, ...(item.keywords ?? [])]),
  );

  const threadsMatched = ranked.some((entry) => entry.group.value === COMMAND_PALETTE_THREAD_GROUP);

  return ranked
    .filter((entry) => entry.ranked.length > 0)
    .map((entry) => ({
      value: entry.group.value,
      label: entry.group.label,
      items: entry.ranked.slice(0, groupLimit(entry.group.value, threadsMatched)).map((rankedItem) => ({
        ...rankedItem.item,
        label: rankedItem.item.title,
        ranges: rankedItem.match.ranges,
      })),
    }));
}

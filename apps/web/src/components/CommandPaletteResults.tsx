/**
 * 命令面板结果列表,对齐 t3code CommandPaletteResults:
 * 分组渲染 + 命中子串高亮(HighlightedSearchText)+ 会话内容匹配行。
 *
 * 注意:命令面板本体已重构到 components/command-palette/;
 * 这个列表现在只服务于 ⌘P 文件选择器（components/files/ProjectFilePicker）。
 */
import { ChevronRightIcon } from "lucide-react";
import { useI18n } from "~/i18n";
import {
  type CommandPaletteActionItem,
  type CommandPaletteGroup,
  type CommandPaletteSubmenuItem,
} from "./CommandPalette.logic";
import {
  CommandCollection,
  CommandGroup,
  CommandGroupLabel,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "./ui/command";
import { cn } from "~/lib/utils";

function foldAsciiCase(value: string): string {
  return value.replace(/[A-Z]/g, (character) => character.toLowerCase());
}

function HighlightedSearchText(props: { text: string; query: string }) {
  const query = props.query.trim();
  if (query.length === 0) return props.text;

  const normalizedText = foldAsciiCase(props.text);
  const normalizedQuery = foldAsciiCase(query);
  const parts: Array<{
    readonly text: string;
    readonly highlighted: boolean;
    readonly start: number;
  }> = [];
  let cursor = 0;

  while (cursor < props.text.length) {
    const matchIndex = normalizedText.indexOf(normalizedQuery, cursor);
    if (matchIndex === -1) {
      parts.push({ text: props.text.slice(cursor), highlighted: false, start: cursor });
      break;
    }
    if (matchIndex > cursor) {
      parts.push({
        text: props.text.slice(cursor, matchIndex),
        highlighted: false,
        start: cursor,
      });
    }
    parts.push({
      text: props.text.slice(matchIndex, matchIndex + query.length),
      highlighted: true,
      start: matchIndex,
    });
    cursor = matchIndex + query.length;
  }

  return parts.map((part) =>
    part.highlighted ? (
      <mark className="bg-transparent font-semibold text-foreground" key={part.start}>
        {part.text}
      </mark>
    ) : (
      part.text
    ),
  );
}

function ThreadContentMatch(props: {
  match: NonNullable<CommandPaletteActionItem["threadContentMatch"]>;
}) {
  const { tr } = useI18n();
  const isUser = props.match.source === "user";
  return (
    <span className="truncate text-xs text-muted-foreground/85">
      <span className={isUser ? "text-blue-400" : "text-emerald-400"}>
        {isUser ? tr("你:", "You:") : tr("Agent:", "Agent:")}
      </span>{" "}
      <HighlightedSearchText text={props.match.snippet} query={props.match.query} />
    </span>
  );
}

interface CommandPaletteResultsProps {
  emptyStateMessage?: string;
  groups: ReadonlyArray<CommandPaletteGroup>;
  highlightedItemValue?: string | null;
  isActionsOnly: boolean;
  onExecuteItem: (item: CommandPaletteActionItem | CommandPaletteSubmenuItem) => void;
}

export function CommandPaletteResults(props: CommandPaletteResultsProps) {
  const { tr } = useI18n();
  if (props.groups.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        {props.emptyStateMessage ??
          (props.isActionsOnly
            ? tr("没有匹配的动作。", "No matching actions.")
            : tr("没有匹配的命令、项目或线程。", "No matching commands, projects, or threads."))}
      </div>
    );
  }

  return (
    <CommandList>
      {props.groups.map((group) => (
        <CommandGroup items={group.items} key={group.value}>
          <CommandGroupLabel className="ps-[9px]">{group.label}</CommandGroupLabel>
          <CommandCollection>
            {(item) =>
              item.disabled ? (
                <DisabledCommandPaletteResultRow item={item} key={item.value} />
              ) : (
                <CommandPaletteResultRow
                  item={item}
                  key={item.value}
                  isActive={props.highlightedItemValue === item.value}
                  onExecuteItem={props.onExecuteItem}
                />
              )
            }
          </CommandCollection>
        </CommandGroup>
      ))}
    </CommandList>
  );
}

function DisabledCommandPaletteResultRow(props: {
  item: CommandPaletteActionItem | CommandPaletteSubmenuItem;
}) {
  return (
    <div className="flex min-h-8 select-none items-center gap-2 rounded-sm px-2 py-1.5 text-base opacity-64 sm:min-h-7 sm:text-sm">
      {props.item.icon}
      {props.item.description || props.item.threadContentMatch ? (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5 text-sm text-foreground">
            {props.item.titleLeadingContent}
            <span className="truncate">{props.item.title}</span>
          </span>
          {props.item.threadContentMatch ? (
            <ThreadContentMatch match={props.item.threadContentMatch} />
          ) : null}
          {props.item.description ? (
            <span className="min-w-0 text-muted-foreground/70 text-xs">
              {props.item.description}
            </span>
          ) : null}
        </span>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-foreground">
          {props.item.titleLeadingContent}
          <span className="truncate">{props.item.title}</span>
        </span>
      )}
      {props.item.titleTrailingContent}
    </div>
  );
}

function CommandPaletteResultRow(props: {
  item: CommandPaletteActionItem | CommandPaletteSubmenuItem;
  isActive: boolean;
  onExecuteItem: (item: CommandPaletteActionItem | CommandPaletteSubmenuItem) => void;
}) {
  return (
    <CommandItem
      value={props.item.value}
      className={cn(
        "cursor-pointer gap-2 hover:bg-transparent hover:text-inherit data-highlighted:bg-transparent data-highlighted:text-inherit data-selected:bg-transparent data-selected:text-inherit [&[data-highlighted][data-selected]]:bg-transparent [&[data-highlighted][data-selected]]:text-inherit",
        props.isActive && "bg-accent! text-accent-foreground!",
      )}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={() => {
        props.onExecuteItem(props.item);
      }}
    >
      {props.item.icon}
      {props.item.description || props.item.threadContentMatch ? (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5 text-sm text-foreground">
            {props.item.titleLeadingContent}
            <span className="truncate">{props.item.title}</span>
          </span>
          {props.item.threadContentMatch ? (
            <ThreadContentMatch match={props.item.threadContentMatch} />
          ) : null}
          {props.item.description ? (
            <span className="min-w-0 text-muted-foreground/70 text-xs">
              {props.item.description}
            </span>
          ) : null}
        </span>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-foreground">
          {props.item.titleLeadingContent}
          <span className="truncate">{props.item.title}</span>
        </span>
      )}
      {props.item.titleTrailingContent}
      {props.item.timestamp ? (
        <span className="min-w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground/70">
          {props.item.timestamp}
        </span>
      ) : null}
      {props.item.shortcut ? <CommandShortcut>{props.item.shortcut}</CommandShortcut> : null}
      {props.item.kind === "submenu" ? (
        <ChevronRightIcon className="-me-0.5 ms-auto size-4 shrink-0 text-muted-foreground/70" />
      ) : null}
    </CommandItem>
  );
}

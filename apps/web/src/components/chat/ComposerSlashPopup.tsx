import {
  BookmarkIcon,
  DownloadIcon,
  FileDiffIcon,
  GitBranchIcon,
  PlusIcon,
  ScrollTextIcon,
  TerminalIcon,
  WrenchIcon,
} from "lucide-react";
import { useI18n } from "~/i18n";
import { cn } from "~/lib/utils";
import type { SlashCommandItem } from "./composerSlash.ts";

function resolveSlashIcon(icon: SlashCommandItem["icon"]) {
  switch (icon) {
    case "new":
      return <PlusIcon className="size-3.5 text-primary" />;
    case "fork":
      return <GitBranchIcon className="size-3.5 text-sky-500" />;
    case "changes":
      return <FileDiffIcon className="size-3.5 text-emerald-500" />;
    case "terminal":
      return <TerminalIcon className="size-3.5 text-amber-500" />;
    case "scripts":
      return <ScrollTextIcon className="size-3.5 text-purple-500" />;
    case "export":
      return <DownloadIcon className="size-3.5 text-indigo-500" />;
    case "stash":
      return <BookmarkIcon className="size-3.5 text-amber-500" />;
    default:
      return <WrenchIcon className="size-3.5 text-muted-foreground" />;
  }
}

export function ComposerSlashPopup({
  commands,
  selectedIndex,
  onSelect,
}: {
  commands: readonly SlashCommandItem[];
  selectedIndex: number;
  onSelect: (command: SlashCommandItem) => void;
}) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  if (commands.length === 0) {
    return (
      <div className="absolute inset-x-2 bottom-full z-40 mb-2 rounded-xl border border-border/80 bg-popover/95 p-3 text-center text-xs text-muted-foreground shadow-xl backdrop-blur-md">
        {isZh ? "未找到匹配的快捷指令" : "No matching commands found"}
      </div>
    );
  }

  return (
    <div
      role="listbox"
      aria-label={isZh ? "快捷指令" : "Slash commands"}
      className="absolute inset-x-2 bottom-full z-40 mb-2 max-h-64 overflow-y-auto rounded-xl border border-border/80 bg-popover/95 p-1 text-popover-foreground shadow-2xl backdrop-blur-md"
    >
      <div className="px-2 py-1 text-3xs font-semibold tracking-wider text-muted-foreground uppercase">
        {isZh ? "快捷指令" : "Slash Commands"}
      </div>
      {commands.map((cmd, idx) => {
        const isSelected = idx === selectedIndex;
        return (
          <button
            key={cmd.id}
            type="button"
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelect(cmd)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
              isSelected
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <div className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border/40 bg-muted/60">
              {resolveSlashIcon(cmd.icon)}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-2xs font-semibold text-foreground">
                  {cmd.command}
                </span>
                <span className="text-2xs text-muted-foreground">·</span>
                <span className="truncate text-xs font-medium text-foreground">
                  {isZh ? cmd.titleZh : cmd.titleEn}
                </span>
              </div>
              <span className="truncate text-3xs text-muted-foreground/80">
                {isZh ? cmd.descriptionZh : cmd.descriptionEn}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

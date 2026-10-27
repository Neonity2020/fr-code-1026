/**
 * 命令面板（对齐 t3code CommandPalette）：⌘K / Ctrl+K 唤起，
 * 输入即筛选，动作分为「命令 / 线程 / 项目」三组。
 *
 * 排序复用 @pi-web/shared/paletteSearch（与 t3code 同一套打分），
 * 过滤逻辑见 commandPaletteModel.ts。
 */
import {
  ArrowDownIcon,
  ArrowUpIcon,
  FileDiffIcon,
  FolderIcon,
  LanguagesIcon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  ScrollTextIcon,
  SettingsIcon,
  SquarePenIcon,
  SunIcon,
  TerminalIcon,
  ToggleLeftIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { splitSearchText } from "@pi-web/shared/paletteSearch";
import { transport, useAppStore } from "@pi-web/client-runtime";
import { useI18n } from "~/i18n";
import { cn, isMacPlatform } from "~/lib/utils";
import { projectBasename } from "~/projectIdentity";
import {
  applyAppearanceMode,
  cycleAppearanceMode,
  readAppearanceMode,
  subscribeAppearanceMode,
  type AppearanceMode,
} from "~/theme/appearancePreference";
import { emitChatPanelAction } from "../chat/chatPanelBus";
import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "../ui/command";
import { Kbd, KbdGroup } from "../ui/kbd";
import { useSidebar } from "../ui/sidebar";
import {
  COMMAND_PALETTE_ACTION_GROUP,
  COMMAND_PALETTE_PROJECT_GROUP,
  COMMAND_PALETTE_THREAD_GROUP,
  filterCommandPaletteGroups,
  type CommandPaletteGroup,
  type CommandPaletteItem,
  type RankedCommandPaletteItem,
} from "./commandPaletteModel";

const APPEARANCE_ICON: Record<AppearanceMode, ReactNode> = {
  system: <MonitorIcon className="size-4" />,
  light: <SunIcon className="size-4" />,
  dark: <MoonIcon className="size-4" />,
};

const APPEARANCE_LABEL: Record<AppearanceMode, { zh: string; en: string }> = {
  system: { zh: "跟随系统", en: "System" },
  light: { zh: "浅色", en: "Light" },
  dark: { zh: "深色", en: "Dark" },
};

export function CommandPalette() {
  const { toggleSidebar } = useSidebar();
  const threads = useAppStore((state) => state.threads);
  const projects = useAppStore((state) => state.projects);
  const defaultCwd = useAppStore((state) => state.defaultCwd);
  const activeThreadId = useAppStore((state) => state.activeThreadId);
  const selectedProjectCwd = useAppStore((state) => state.selectedProjectCwd);
  const setActiveThread = useAppStore((state) => state.setActiveThread);
  const setActiveUtilityPage = useAppStore((state) => state.setActiveUtilityPage);
  const setLocale = useAppStore((state) => state.setLocale);
  const locale = useAppStore((state) => state.locale);
  const { tr } = useI18n();

  const [query, setQuery] = useState("");
  const [appearanceMode, setAppearanceMode] = useState<AppearanceMode>(() =>
    readAppearanceMode(),
  );
  const open = useAppStore((state) => state.commandPaletteOpen);
  const setOpen = useAppStore((state) => state.setCommandPaletteOpen);

  useEffect(() => subscribeAppearanceMode(() => setAppearanceMode(readAppearanceMode())), []);

  // ⌘K / Ctrl+K 唤起面板；输入框获得焦点时按 ⌘K 也应唤起而不是插入字符。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const mod = isMacPlatform(navigator.platform) ? event.metaKey : event.ctrlKey;
      if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        event.stopPropagation();
        if (!open) setQuery("");
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, setOpen]);

  const shortcutHint = isMacPlatform(navigator.platform) ? "⌘K" : "Ctrl+K";

  const currentCwd = useMemo(() => {
    const active = threads.find((thread) => thread.id === activeThreadId);
    return selectedProjectCwd ?? active?.cwd ?? defaultCwd ?? "";
  }, [activeThreadId, defaultCwd, selectedProjectCwd, threads]);

  const startNewThread = useCallback(
    (cwd: string) => {
      const state = useAppStore.getState();
      state.markNewThreadRequested();
      transport.dispatch({
        type: "thread.create",
        cwd: cwd || (defaultCwd ?? ""),
        ...(state.selectedModel ? { model: state.selectedModel } : {}),
        ...(state.selectedThinkingLevel ? { thinkingLevel: state.selectedThinkingLevel } : {}),
      });
    },
    [defaultCwd],
  );

  const groups = useMemo<ReadonlyArray<CommandPaletteGroup>>(() => {
    const actionItems: CommandPaletteItem[] = [
      {
        value: "action:new-thread",
        group: COMMAND_PALETTE_ACTION_GROUP,
        title: tr("新建线程", "New thread"),
        description: currentCwd ? projectBasename(currentCwd) : undefined,
        keywords: ["new", "thread", "create", "新建", "线程"],
        run: () => startNewThread(currentCwd),
      },
      {
        value: "action:toggle-appearance",
        group: COMMAND_PALETTE_ACTION_GROUP,
        title: tr("切换外观", "Toggle appearance"),
        description: APPEARANCE_LABEL[appearanceMode][locale === "zh-CN" ? "zh" : "en"],
        keywords: ["theme", "appearance", "dark", "light", "主题", "外观", "深色", "浅色"],
        run: () => {
          applyAppearanceMode(cycleAppearanceMode(appearanceMode));
        },
      },
      {
        value: "action:toggle-language",
        group: COMMAND_PALETTE_ACTION_GROUP,
        title: tr("切换界面语言", "Toggle interface language"),
        description: locale === "zh-CN" ? "English" : "简体中文",
        keywords: ["language", "locale", "i18n", "语言", "中英文"],
        run: () => setLocale(locale === "zh-CN" ? "en" : "zh-CN"),
      },
      {
        value: "action:toggle-sidebar",
        group: COMMAND_PALETTE_ACTION_GROUP,
        title: tr("切换主侧边栏", "Toggle main sidebar"),
        keywords: ["sidebar", "toggle", "侧边栏"],
        shortcut: isMacPlatform(navigator.platform) ? "⌘B" : "Ctrl+B",
        run: () => toggleSidebar(),
      },
      {
        value: "action:open-settings",
        group: COMMAND_PALETTE_ACTION_GROUP,
        title: tr("打开设置", "Open settings"),
        keywords: ["settings", "preferences", "设置", "偏好"],
        run: () => setActiveUtilityPage("settings"),
      },
    ];

    if (activeThreadId) {
      actionItems.push(
        {
          value: "action:open-terminal",
          group: COMMAND_PALETTE_ACTION_GROUP,
          title: tr("打开终端", "Open terminal"),
          keywords: ["terminal", "shell", "终端"],
          run: () => emitChatPanelAction("open-terminal"),
        },
        {
          value: "action:open-script-output",
          group: COMMAND_PALETTE_ACTION_GROUP,
          title: tr("打开脚本输出", "Open script output"),
          keywords: ["script", "output", "脚本", "输出"],
          run: () => emitChatPanelAction("open-script-output"),
        },
        {
          value: "action:open-changes",
          group: COMMAND_PALETTE_ACTION_GROUP,
          title: tr("查看变更", "Show changes"),
          keywords: ["changes", "diff", "git", "变更", "差异"],
          run: () => emitChatPanelAction("open-changes"),
        },
      );
    }

    const threadItems: CommandPaletteItem[] = threads
      .slice()
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, 30)
      .map((thread) => ({
        value: `thread:${thread.id}`,
        group: COMMAND_PALETTE_THREAD_GROUP,
        title: thread.title || tr("未命名线程", "Untitled thread"),
        description: projectBasename(thread.cwd),
        keywords: [thread.latestPreview ?? "", projectBasename(thread.cwd)],
        run: () => setActiveThread(thread.id),
      }));

    const projectItems: CommandPaletteItem[] = Array.from(
      new Set([
        ...(defaultCwd ? [defaultCwd] : []),
        ...projects,
        ...threads.map((thread) => thread.cwd),
      ]),
    )
      .filter((cwd) => cwd.length > 0)
      .map((cwd) => ({
        value: `project:${cwd}`,
        group: COMMAND_PALETTE_PROJECT_GROUP,
        title: tr(`在 ${projectBasename(cwd)} 中新建线程`, `New thread in ${projectBasename(cwd)}`),
        description: cwd,
        keywords: [cwd, projectBasename(cwd), "new", "thread", "新建", "线程"],
        run: () => startNewThread(cwd),
      }));

    return [
      { value: COMMAND_PALETTE_ACTION_GROUP, label: tr("命令", "Actions"), items: actionItems },
      { value: COMMAND_PALETTE_THREAD_GROUP, label: tr("线程", "Threads"), items: threadItems },
      { value: COMMAND_PALETTE_PROJECT_GROUP, label: tr("项目", "Projects"), items: projectItems },
    ];
  }, [
    activeThreadId,
    appearanceMode,
    currentCwd,
    defaultCwd,
    locale,
    projects,
    setActiveThread,
    setActiveUtilityPage,
    setLocale,
    startNewThread,
    threads,
    toggleSidebar,
    tr,
  ]);

  const filteredGroups = useMemo(
    () => filterCommandPaletteGroups(groups, query),
    [groups, query],
  );

  const paletteItems = useMemo(
    () => filteredGroups.flatMap((group) => group.items),
    [filteredGroups],
  );

  const runItem = useCallback(
    (item: CommandPaletteItem) => {
      setOpen(false);
      setQuery("");
      // 关闭动画之后再执行，避免面板还在时页面就跳走。
      window.setTimeout(() => item.run(), 0);
    },
    [setOpen],
  );

  return (
    <CommandDialog open={open} onOpenChange={(next) => setOpen(next)}>
      <CommandDialogPopup
        aria-label={tr("命令面板", "Command palette")}
        className="overflow-hidden"
        data-command-palette="true"
        onBackdropPointerDown={() => setOpen(false)}
      >
        <Command
          mode="none"
          items={paletteItems}
          value={query}
          onValueChange={(value, details) => {
            // 只同步输入框的改动；选中条目时 base-ui 也会回调 onValueChange。
            if (details.reason === "input-change" || details.reason === "input-clear") {
              setQuery(value);
            }
          }}
        >
          <CommandInput
            placeholder={tr("搜索命令、线程与项目…", "Search commands, threads, and projects...")}
          />
          <CommandList className="max-h-[min(28rem,70vh)]">
            {filteredGroups.map((group) => (
              <CommandGroup items={group.items} key={group.value}>
                {group.label ? <CommandGroupLabel>{group.label}</CommandGroupLabel> : null}
                <CommandCollection>
                  {(item: RankedCommandPaletteItem) => (
                    <CommandItem
                      key={item.value}
                      value={item.value}
                      onClick={() => runItem(item)}
                    >
                      <span className="flex size-4 shrink-0 items-center justify-center text-icon-muted">
                        <PaletteItemIcon item={item} />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm text-foreground">
                          <HighlightedText text={item.title} ranges={item.ranges} />
                        </span>
                        {item.description ? (
                          <span className="truncate text-xs text-muted-foreground/70">
                            {item.description}
                          </span>
                        ) : null}
                      </span>
                      {item.shortcut ? <CommandShortcut>{item.shortcut}</CommandShortcut> : null}
                    </CommandItem>
                  )}
                </CommandCollection>
              </CommandGroup>
            ))}
            <CommandEmpty className="text-muted-foreground py-10 text-center text-sm">
              {tr("没有匹配的命令、线程或项目。", "No matching commands, threads, or projects.")}
            </CommandEmpty>
          </CommandList>
          <CommandFooter>
            <div className="flex items-center gap-3">
              <KbdGroup>
                <Kbd>
                  <ArrowUpIcon />
                </Kbd>
                <Kbd>
                  <ArrowDownIcon />
                </Kbd>
                <span>{tr("选择", "Navigate")}</span>
              </KbdGroup>
              <KbdGroup>
                <Kbd>↵</Kbd>
                <span>{tr("执行", "Run")}</span>
              </KbdGroup>
              <KbdGroup>
                <Kbd>Esc</Kbd>
                <span>{tr("关闭", "Close")}</span>
              </KbdGroup>
            </div>
            <KbdGroup className="text-muted-foreground">
              <Kbd>{shortcutHint}</Kbd>
              <span>{tr("唤起", "Toggle")}</span>
            </KbdGroup>
          </CommandFooter>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}

function PaletteItemIcon({ item }: { item: CommandPaletteItem }) {
  switch (item.value) {
    case "action:new-thread":
      return <SquarePenIcon className="size-4" />;
    case "action:toggle-appearance":
      return APPEARANCE_ICON[readAppearanceMode()];
    case "action:toggle-language":
      return <LanguagesIcon className="size-4" />;
    case "action:toggle-sidebar":
      return <ToggleLeftIcon className="size-4" />;
    case "action:open-settings":
      return <SettingsIcon className="size-4" />;
    case "action:open-terminal":
      return <TerminalIcon className="size-4" />;
    case "action:open-script-output":
      return <ScrollTextIcon className="size-4" />;
    case "action:open-changes":
      return <FileDiffIcon className="size-4" />;
    default:
      break;
  }
  if (item.group === COMMAND_PALETTE_PROJECT_GROUP) return <FolderIcon className="size-4" />;
  if (item.group === COMMAND_PALETTE_THREAD_GROUP) return <PlusIcon className="size-4" />;
  return <SquarePenIcon className="size-4" />;
}

function HighlightedText({
  text,
  ranges,
}: {
  text: string;
  ranges: ReadonlyArray<{ start: number; end: number }>;
}) {
  if (ranges.length === 0) return <>{text}</>;
  return (
    <>
      {splitSearchText(text, ranges).map((part, index) => (
        <span
          key={index}
          className={cn(part.highlighted && "text-foreground bg-(--app-theme-search-match-background) rounded-[3px]")}
        >
          {part.text}
        </span>
      ))}
    </>
  );
}

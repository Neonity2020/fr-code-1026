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
  DownloadIcon,
  FileDiffIcon,
  FolderIcon,
  GitBranchIcon,
  LanguagesIcon,
  MonitorIcon,
  MoonIcon,
  PaintbrushIcon,
  PlusIcon,
  ScrollTextIcon,
  SettingsIcon,
  SquarePenIcon,
  SunIcon,
  TerminalIcon,
  ToggleLeftIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { splitSearchText } from "@pi-web/shared/paletteSearch";
import { transport, useAppStore } from "@pi-web/client-runtime";
import { useCustomThemes } from "~/hooks/useCustomThemes";
import { useTheme } from "~/hooks/useTheme";
import { useI18n } from "~/i18n";
import { cn, isMacPlatform } from "~/lib/utils";
import { projectBasename } from "~/projectIdentity";
import {
  BUILT_IN_THEMES,
  getThemeColorsForMode,
  getThemeDefinition,
} from "~/theme/themePalette";
import {
  applyAppearanceMode,
  cycleAppearanceMode,
  readAppearanceMode,
  subscribeAppearanceMode,
  type AppearanceMode,
} from "~/theme/appearancePreference";
import { downloadThreadAsJson, downloadThreadAsMarkdown } from "~/lib/threadExport";
import { emitChatPanelAction } from "../chat/chatPanelBus";
import { ProjectFilePicker } from "../files/ProjectFilePicker";
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

/** 面板有两种模式：命令模式（⌘K）与文件选择器模式（⌘P）。 */
type CommandPaletteMode = "command" | "files";

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

const THEME_DISPLAY_NAMES: Record<string, { zh: string; en: string }> = {
  "t3-chat": { zh: "FR 默认 (FR Chat)", en: "FR Chat" },
  grove: { zh: "林深 (Grove)", en: "Grove" },
  ocean: { zh: "深海 (Ocean)", en: "Ocean" },
  ember: { zh: "余烬 (Ember)", en: "Ember" },
  iris: { zh: "鸢尾 (Iris)", en: "Iris" },
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
  const [mode, setMode] = useState<CommandPaletteMode>("command");
  const [appearanceMode, setAppearanceMode] = useState<AppearanceMode>(() =>
    readAppearanceMode(),
  );
  const { theme, setTheme } = useTheme();
  const customThemes = useCustomThemes();
  const open = useAppStore((state) => state.commandPaletteOpen);
  const setOpen = useAppStore((state) => state.setCommandPaletteOpen);

  useEffect(() => subscribeAppearanceMode(() => setAppearanceMode(readAppearanceMode())), []);

  // ⌘P 唤起文件选择器时置位，等面板真正打开后再消费，避免和下面的 effect 抢状态。
  const filesModeRequested = useRef(false);

  // 面板从关闭变为打开时决定初始模式：⌘P 进来是文件选择器，其余一律命令模式
  // （侧边栏按钮等外部唤起都回到命令模式，不残留上次的文件选择器）。
  useEffect(() => {
    if (!open) return;
    if (filesModeRequested.current) {
      filesModeRequested.current = false;
      setMode("files");
      return;
    }
    setMode("command");
  }, [open]);

  // ⌘K / Ctrl+K 唤起命令面板，⌘P / Ctrl+P 唤起文件选择器；
  // 输入框获得焦点时按 ⌘K 也应唤起而不是插入字符。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const mod = isMacPlatform(navigator.platform) ? event.metaKey : event.ctrlKey;
      if (!mod || event.shiftKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "k") {
        event.preventDefault();
        event.stopPropagation();
        if (!open) {
          setQuery("");
          setMode("command");
          setOpen(true);
          return;
        }
        // 已经在命令模式里再按一次就关闭；在文件模式里则先切回命令模式。
        if (mode === "command") {
          setOpen(false);
        } else {
          setMode("command");
        }
        return;
      }
      // ⌘P 默认是浏览器打印，必须先 preventDefault 才能接管。
      if (key === "p") {
        event.preventDefault();
        event.stopPropagation();
        if (open && mode === "files") {
          setOpen(false);
          return;
        }
        if (!open) filesModeRequested.current = true;
        setMode("files");
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [mode, open, setOpen]);

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
      ...[...BUILT_IN_THEMES, ...customThemes].map((t) => {
        const isCurrent = theme === t.id;
        const displayName =
          THEME_DISPLAY_NAMES[t.id]?.[locale === "zh-CN" ? "zh" : "en"] ?? t.label;
        return {
          value: `action:theme:${t.id}`,
          group: COMMAND_PALETTE_ACTION_GROUP,
          title: tr(`切换主题: ${displayName}`, `Switch theme: ${displayName}`),
          description: isCurrent ? tr("当前主题 (已启用)", "Active theme") : t.id,
          shortcut: isCurrent ? "✓" : undefined,
          keywords: ["theme", "palette", "主题", "配色", "调色板", t.id, t.label],
          run: () => setTheme(t.id),
        };
      }),
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
        {
          value: "action:fork-thread",
          group: COMMAND_PALETTE_ACTION_GROUP,
          title: tr("分叉当前线程", "Fork current thread"),
          keywords: ["fork", "branch", "duplicate", "分叉", "复制", "分支"],
          run: () => {
            useAppStore.getState().markNewThreadRequested();
            transport.dispatch({
              type: "thread.fork",
              sourceThreadId: activeThreadId,
            });
          },
        },
        {
          value: "action:export-markdown",
          group: COMMAND_PALETTE_ACTION_GROUP,
          title: tr("导出当前对话为 Markdown", "Export conversation as Markdown"),
          keywords: ["export", "markdown", "save", "download", "导出", "下载"],
          run: () => {
            const activeThread = threads.find((t) => t.id === activeThreadId);
            if (!activeThread) return;
            const items = useAppStore.getState().byThread[activeThreadId]?.items ?? [];
            if (items.length > 0) {
              downloadThreadAsMarkdown(activeThread, items);
            } else {
              window.open(
                `/api/thread/export?threadId=${encodeURIComponent(activeThreadId)}&format=markdown`,
                "_blank",
              );
            }
          },
        },
        {
          value: "action:export-json",
          group: COMMAND_PALETTE_ACTION_GROUP,
          title: tr("导出当前对话为 JSON", "Export conversation as JSON"),
          keywords: ["export", "json", "save", "download", "导出", "数据"],
          run: () => {
            const activeThread = threads.find((t) => t.id === activeThreadId);
            if (!activeThread) return;
            const items = useAppStore.getState().byThread[activeThreadId]?.items ?? [];
            if (items.length > 0) {
              downloadThreadAsJson(activeThread, items);
            } else {
              window.open(
                `/api/thread/export?threadId=${encodeURIComponent(activeThreadId)}&format=json`,
                "_blank",
              );
            }
          },
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
    customThemes,
    defaultCwd,
    locale,
    projects,
    setActiveThread,
    setActiveUtilityPage,
    setLocale,
    setTheme,
    startNewThread,
    theme,
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

  // 文件选择器自带输入框与结果面板，整棵子树与命令模式互斥渲染。
  const commandPanel = (
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
                <CommandItem key={item.value} value={item.value} onClick={() => runItem(item)}>
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
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next, details) => {
        // 文件模式下 Esc 先退回命令模式，再按一次才关闭面板（对齐 t3code）。
        if (!next && mode === "files" && details.reason === "escape-key") {
          details.cancel();
          setMode("command");
          return;
        }
        if (!next) setMode("command");
        setOpen(next);
      }}
    >
      <CommandDialogPopup
        aria-label={tr("命令面板", "Command palette")}
        className="overflow-hidden"
        data-command-palette="true"
        data-palette-mode={mode}
        onBackdropPointerDown={() => setOpen(false)}
      >
        {mode === "files" ? (
          <ProjectFilePicker
            setOpen={(next) => {
              if (!next) setMode("command");
              setOpen(next);
            }}
          />
        ) : (
          commandPanel
        )}
      </CommandDialogPopup>
    </CommandDialog>
  );
}

function ThemePaletteDot({ themeId }: { themeId: string }) {
  const def = getThemeDefinition(themeId);
  const darkColors = def ? getThemeColorsForMode(def, "dark") : null;
  const lightColors = def ? getThemeColorsForMode(def, "light") : null;
  const lightAccent = lightColors?.accent ?? "#e4e4e7";
  const darkAccent = darkColors?.accent ?? "#27272a";

  return (
    <span
      aria-hidden="true"
      className="size-3.5 rounded-full border border-border/70 shadow-2xs shrink-0 inline-block"
      style={{
        background: `linear-gradient(135deg, ${lightAccent} 50%, ${darkAccent} 50%)`,
      }}
    />
  );
}

function PaletteItemIcon({ item }: { item: CommandPaletteItem }) {
  if (item.value.startsWith("action:theme:")) {
    const themeId = item.value.replace("action:theme:", "");
    return <ThemePaletteDot themeId={themeId} />;
  }

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
    case "action:fork-thread":
      return <GitBranchIcon className="size-4" />;
    case "action:export-markdown":
    case "action:export-json":
      return <DownloadIcon className="size-4" />;
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

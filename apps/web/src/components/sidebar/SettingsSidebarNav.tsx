import {
  ArchiveIcon,
  BlocksIcon,
  BotIcon,
  CalendarClockIcon,
  createLucideIcon,
  GitBranchIcon,
  HardDriveIcon,
  KeyboardIcon,
  Link2Icon,
  PaletteIcon,
  SearchIcon,
  Settings2Icon,
  XIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
} from "react";
import { useAppStore, type SettingsSectionId } from "@pi-web/client-runtime";
import { getSettingsSectionLabel, useI18n } from "~/i18n";
import { Button } from "../ui/button";
import { Kbd } from "../ui/kbd";
import {
  SidebarContent,
  SidebarGroup,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "../ui/sidebar";

const SnapShotIcon = createLucideIcon("snap-shot", [
  [
    "path",
    {
      d: "M8 3H6a3 3 0 0 0-3 3v2M16 3h2a3 3 0 0 1 3 3v2M21 16v2a3 3 0 0 1-3 3h-2M8 21H6a3 3 0 0 1-3-3v-2",
      key: "capture-frame",
    },
  ],
  ["rect", { width: "10", height: "8", x: "7", y: "8", rx: "2", key: "window" }],
  ["circle", { cx: "12", cy: "12", r: "1.5", key: "lens" }],
]);

export const SETTINGS_SECTION_META: ReadonlyArray<{
  id: SettingsSectionId;
  label: string;
  zhLabel: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { id: "general", label: "General", zhLabel: "通用", icon: Settings2Icon },
  { id: "appearance", label: "Appearance", zhLabel: "外观与语言", icon: PaletteIcon },
  { id: "keybindings", label: "Keybindings", zhLabel: "快捷键", icon: KeyboardIcon },
  { id: "snap-shots", label: "SnapShots", zhLabel: "快照", icon: SnapShotIcon },
  { id: "providers", label: "Providers", zhLabel: "模型服务", icon: BotIcon },
  { id: "integrations", label: "Integrations", zhLabel: "集成", icon: BlocksIcon },
  { id: "scheduled-tasks", label: "Scheduled Tasks", zhLabel: "定时任务", icon: CalendarClockIcon },
  { id: "source-control", label: "Source Control", zhLabel: "版本控制", icon: GitBranchIcon },
  { id: "storage", label: "Storage", zhLabel: "存储", icon: HardDriveIcon },
  { id: "connections", label: "Connections", zhLabel: "连接", icon: Link2Icon },
  { id: "archived", label: "Archive", zhLabel: "归档", icon: ArchiveIcon },
];

export const SETTINGS_SECTION_LABEL_BY_ID: Readonly<Record<SettingsSectionId, string>> =
  Object.fromEntries(SETTINGS_SECTION_META.map((item) => [item.id, item.label])) as Record<
    SettingsSectionId,
    string
  >;

export const SETTINGS_SECTION_ICON_BY_ID: Readonly<
  Record<SettingsSectionId, ComponentType<{ className?: string }>>
> = Object.fromEntries(SETTINGS_SECTION_META.map((item) => [item.id, item.icon])) as Record<
  SettingsSectionId,
  ComponentType<{ className?: string }>
>;

export interface SettingsSearchEntry {
  id: string;
  title: string;
  zhTitle: string;
  description: string;
  zhDescription: string;
  section: SettingsSectionId;
  targetId: string;
}

export const SETTINGS_SEARCH_INDEX: ReadonlyArray<SettingsSearchEntry> = [
  {
    id: "general-language",
    title: "Language",
    zhTitle: "界面语言 (Language)",
    description: "Switch between Simplified Chinese (简体中文) and English",
    zhDescription: "切换简体中文与 English 界面语言",
    section: "general",
    targetId: "setting-language",
  },
  {
    id: "general-model",
    title: "Model",
    zhTitle: "默认模型",
    description: "Default model for new threads",
    zhDescription: "新建线程的默认模型",
    section: "general",
    targetId: "setting-model",
  },
  {
    id: "general-permissions",
    title: "Permissions",
    zhTitle: "默认权限",
    description: "Default permissions for new threads",
    zhDescription: "新建线程的默认权限模式",
    section: "general",
    targetId: "setting-permissions",
  },
  {
    id: "general-workspace",
    title: "Workspace",
    zhTitle: "工作区模式",
    description: "Where new threads start",
    zhDescription: "新线程启动时的工作区目录模式",
    section: "general",
    targetId: "setting-workspace",
  },
  {
    id: "general-submodules",
    title: "Submodules",
    zhTitle: "Git 子模块",
    description: "How new worktrees populate git submodules",
    zhDescription: "新工作树初始化 Git 子模块的方式",
    section: "general",
    targetId: "setting-submodules",
  },
  {
    id: "general-project-grouping",
    title: "Project grouping",
    zhTitle: "按项目分组",
    description: "Group threads under their project in the sidebar",
    zhDescription: "在侧边栏中按所属项目分组展示线程",
    section: "general",
    targetId: "setting-project-grouping",
  },
  {
    id: "general-project-order",
    title: "Project order",
    zhTitle: "项目排序方式",
    description: "How projects are ordered in the sidebar",
    zhDescription: "侧边栏中项目的排列顺序",
    section: "general",
    targetId: "setting-project-order",
  },
  {
    id: "general-auto-resume",
    title: "Auto-resume limited threads",
    zhTitle: "自动恢复限流线程",
    description: "Resume a rate-limited thread automatically when its reset window passes",
    zhDescription: "当配额重置窗口到达时自动恢复被限流的线程",
    section: "general",
    targetId: "setting-auto-resume",
  },
  {
    id: "general-snooze-limited",
    title: "Snooze limited threads",
    zhTitle: "自动延后限流线程",
    description: "Move rate-limited threads to the snoozed list until their reset time",
    zhDescription: "将触发速率限制的线程移入延后列表直至重置时间",
    section: "general",
    targetId: "setting-snooze-limited",
  },
  {
    id: "general-working-section",
    title: "Working section (beta)",
    zhTitle: "运行中专区 (Beta)",
    description: "Pin running and unvisited completed threads to a Working section",
    zhDescription: "将正在运行或未读完成的线程固定在顶部专区",
    section: "general",
    targetId: "setting-working-section",
  },
  {
    id: "general-compact-idle",
    title: "Compact idle threads",
    zhTitle: "折叠空闲线程",
    description: "Fold idle threads into a trailing section when your sidebar gets long",
    zhDescription: "当侧边栏较长时将空闲线程折叠至尾部",
    section: "general",
    targetId: "setting-compact-idle",
  },
  {
    id: "general-auto-settle-merged",
    title: "Auto-settle merged threads",
    zhTitle: "PR 合并后自动归档",
    description: "Move a thread to Settled when its pull request merges",
    zhDescription: "当关联的 Pull Request 合并后自动将线程归档至已结项",
    section: "general",
    targetId: "setting-auto-settle-merged",
  },
  {
    id: "general-auto-settle-inactive",
    title: "Auto-settle inactive threads",
    zhTitle: "自动归档不活跃线程",
    description: "Move idle threads to Settled after a period without activity",
    zhDescription: "空闲线程在指定天数无活动后自动移入已结项",
    section: "general",
    targetId: "setting-auto-settle-inactive",
  },
  {
    id: "general-days-inactivity",
    title: "Days of inactivity before auto-settle",
    zhTitle: "自动归档前的空闲天数",
    description: "Idle threads older than this move to Settled automatically",
    zhDescription: "超过此天数的空闲线程将自动归档至已结项",
    section: "general",
    targetId: "setting-days-inactivity",
  },
  {
    id: "appearance-language",
    title: "Language",
    zhTitle: "语言 (Language)",
    description: "Choose between 简体中文 and English",
    zhDescription: "选择简体中文或 English 界面语言",
    section: "appearance",
    targetId: "setting-appearance-language",
  },
  {
    id: "appearance-theme",
    title: "Theme",
    zhTitle: "主题外观",
    description: "Choose between system, light, or dark appearance",
    zhDescription: "选择浅色、深色或跟随系统外观",
    section: "appearance",
    targetId: "setting-theme",
  },
  {
    id: "appearance-font-size",
    title: "Font scale",
    zhTitle: "字体缩放",
    description: "Adjust interface and code block font sizing",
    zhDescription: "调整界面与代码块的字号比例",
    section: "appearance",
    targetId: "setting-font-scale",
  },
  {
    id: "keybindings-toggle-sidebar",
    title: "Toggle main sidebar",
    zhTitle: "切换主侧边栏",
    description: "Show or hide the left thread sidebar",
    zhDescription: "显示或隐藏左侧线程导航栏",
    section: "keybindings",
    targetId: "setting-kb-sidebar",
  },
  {
    id: "providers-pi",
    title: "Pi Coding Agent CLI",
    zhTitle: "Pi Coding Agent CLI",
    description: "Configure the local Pi CLI binary and runtime status",
    zhDescription: "查看本地 Pi CLI 运行状态与版本信息",
    section: "providers",
    targetId: "setting-provider-pi",
  },
  {
    id: "archived-threads",
    title: "Settled & Archived Threads",
    zhTitle: "已结项与归档线程",
    description: "Manage threads that have been settled or archived",
    zhDescription: "管理已结项或归档的历史线程",
    section: "archived",
    targetId: "setting-archived-list",
  },
];

export function SettingsSidebarNav() {
  const { isMobile, setOpenMobile } = useSidebar();
  const activeSettingsSection = useAppStore((state) => state.activeSettingsSection);
  const setActiveSettingsSection = useAppStore((state) => state.setActiveSettingsSection);
  const { locale, isZh, tr } = useI18n();

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeResultIndex, setActiveResultIndex] = useState(0);

  const isSearching = query.trim().length > 0;
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return SETTINGS_SEARCH_INDEX.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.zhTitle.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.zhDescription.toLowerCase().includes(q) ||
        getSettingsSectionLabel(item.section, locale).toLowerCase().includes(q) ||
        SETTINGS_SECTION_LABEL_BY_ID[item.section].toLowerCase().includes(q),
    );
  }, [locale, query]);

  const hasResults = results.length > 0;

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const isFindShortcut =
        event.key.toLowerCase() === "f" &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey;
      const isSlashShortcut =
        event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (!isFindShortcut && !isSlashShortcut) return;

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        isSlashShortcut &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const clearSearch = () => {
    setQuery("");
    setActiveResultIndex(0);
  };

  const handleSelectSection = (section: SettingsSectionId) => {
    setActiveSettingsSection(section);
    if (isMobile) setOpenMobile(false);
  };

  const handleSelectSearchResult = (item: SettingsSearchEntry) => {
    clearSearch();
    setActiveSettingsSection(item.section);
    if (isMobile) setOpenMobile(false);
    window.requestAnimationFrame(() => {
      const el = document.getElementById(item.targetId);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && isSearching) {
      event.preventDefault();
      event.stopPropagation();
      clearSearch();
      return;
    }
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveResultIndex((prev) => (prev + 1) % results.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveResultIndex((prev) => (prev - 1 + results.length) % results.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const target = results[activeResultIndex] ?? results[0];
      if (target) handleSelectSearchResult(target);
    }
  };

  return (
    <SidebarContent className="overflow-x-hidden">
      <SidebarGroup>
        <div className="flex flex-col gap-2">
          <div className="flex h-8 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground">
            <SearchIcon className="size-4 shrink-0 text-sidebar-muted-foreground/80" />
            <SidebarInput
              ref={searchInputRef}
              nativeInput
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setActiveResultIndex(0);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder={tr("搜索设置", "Search")}
              aria-label={tr("搜索设置", "Search settings")}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={isSearching && hasResults}
              className="min-w-0 flex-1"
            />
            {isSearching ? (
              <Button
                type="button"
                size="icon-micro"
                variant="ghost-muted"
                className="shrink-0"
                aria-label={tr("清空搜索", "Clear settings search")}
                onClick={() => {
                  clearSearch();
                  searchInputRef.current?.focus();
                }}
              >
                <XIcon className="size-3" />
              </Button>
            ) : (
              <Kbd>/</Kbd>
            )}
          </div>

          {isSearching && results.length === 0 ? (
            <p
              role="status"
              className="px-2 py-6 text-center text-xs text-sidebar-muted-foreground"
            >
              {tr("未找到匹配的设置项", "No settings found")}
            </p>
          ) : null}

          {isSearching ? (
            <SidebarMenu role="listbox" aria-label={tr("设置搜索结果", "Settings search results")}>
              {results.map((item, index) => {
                const Icon = SETTINGS_SECTION_ICON_BY_ID[item.section];
                return (
                  <SidebarMenuItem key={item.id} role="presentation">
                    <SidebarMenuButton
                      role="option"
                      aria-selected={index === activeResultIndex}
                      tabIndex={-1}
                      size="sm"
                      isActive={index === activeResultIndex}
                      className="h-auto min-h-10 items-start"
                      onMouseMove={() => setActiveResultIndex(index)}
                      onClick={() => handleSelectSearchResult(item)}
                    >
                      <Icon className="size-4 shrink-0 text-(--sidebar-icon-color)" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-sidebar-foreground">
                          {isZh ? item.zhTitle : item.title}
                        </span>
                        <span className="block truncate text-2xs text-sidebar-muted-foreground/75">
                          {getSettingsSectionLabel(item.section, locale)}
                        </span>
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          ) : (
            <SidebarMenu>
              {SETTINGS_SECTION_META.map((item) => {
                const Icon = item.icon;
                const isActive = activeSettingsSection === item.id;
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => handleSelectSection(item.id)}
                    >
                      <Icon />
                      <span className="truncate">{isZh ? item.zhLabel : item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          )}
        </div>
      </SidebarGroup>
    </SidebarContent>
  );
}

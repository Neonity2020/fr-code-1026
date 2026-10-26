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
  icon: ComponentType<{ className?: string }>;
}> = [
  { id: "general", label: "General", icon: Settings2Icon },
  { id: "appearance", label: "Appearance", icon: PaletteIcon },
  { id: "keybindings", label: "Keybindings", icon: KeyboardIcon },
  { id: "snap-shots", label: "SnapShots", icon: SnapShotIcon },
  { id: "providers", label: "Providers", icon: BotIcon },
  { id: "integrations", label: "Integrations", icon: BlocksIcon },
  { id: "scheduled-tasks", label: "Scheduled Tasks", icon: CalendarClockIcon },
  { id: "source-control", label: "Source Control", icon: GitBranchIcon },
  { id: "storage", label: "Storage", icon: HardDriveIcon },
  { id: "connections", label: "Connections", icon: Link2Icon },
  { id: "archived", label: "Archive", icon: ArchiveIcon },
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
  description: string;
  section: SettingsSectionId;
  targetId: string;
}

export const SETTINGS_SEARCH_INDEX: ReadonlyArray<SettingsSearchEntry> = [
  {
    id: "general-model",
    title: "Model",
    description: "Default model for new threads",
    section: "general",
    targetId: "setting-model",
  },
  {
    id: "general-permissions",
    title: "Permissions",
    description: "Default permissions for new threads",
    section: "general",
    targetId: "setting-permissions",
  },
  {
    id: "general-workspace",
    title: "Workspace",
    description: "Where new threads start",
    section: "general",
    targetId: "setting-workspace",
  },
  {
    id: "general-submodules",
    title: "Submodules",
    description: "How new worktrees populate git submodules",
    section: "general",
    targetId: "setting-submodules",
  },
  {
    id: "general-project-grouping",
    title: "Project grouping",
    description: "Group threads under their project in the sidebar",
    section: "general",
    targetId: "setting-project-grouping",
  },
  {
    id: "general-project-order",
    title: "Project order",
    description: "How projects are ordered in the sidebar",
    section: "general",
    targetId: "setting-project-order",
  },
  {
    id: "general-auto-resume",
    title: "Auto-resume limited threads",
    description: "Resume a rate-limited thread automatically when its reset window passes",
    section: "general",
    targetId: "setting-auto-resume",
  },
  {
    id: "general-snooze-limited",
    title: "Snooze limited threads",
    description: "Move rate-limited threads to the snoozed list until their reset time",
    section: "general",
    targetId: "setting-snooze-limited",
  },
  {
    id: "general-working-section",
    title: "Working section (beta)",
    description: "Pin running and unvisited completed threads to a Working section",
    section: "general",
    targetId: "setting-working-section",
  },
  {
    id: "general-compact-idle",
    title: "Compact idle threads",
    description: "Fold idle threads into a trailing section when your sidebar gets long",
    section: "general",
    targetId: "setting-compact-idle",
  },
  {
    id: "general-auto-settle-merged",
    title: "Auto-settle merged threads",
    description: "Move a thread to Settled when its pull request merges",
    section: "general",
    targetId: "setting-auto-settle-merged",
  },
  {
    id: "general-auto-settle-inactive",
    title: "Auto-settle inactive threads",
    description: "Move idle threads to Settled after a period without activity",
    section: "general",
    targetId: "setting-auto-settle-inactive",
  },
  {
    id: "general-days-inactivity",
    title: "Days of inactivity before auto-settle",
    description: "Idle threads older than this move to Settled automatically",
    section: "general",
    targetId: "setting-days-inactivity",
  },
  {
    id: "appearance-theme",
    title: "Theme",
    description: "Choose between system, light, or dark appearance",
    section: "appearance",
    targetId: "setting-theme",
  },
  {
    id: "appearance-font-size",
    title: "Font scale",
    description: "Adjust interface and code block font sizing",
    section: "appearance",
    targetId: "setting-font-scale",
  },
  {
    id: "keybindings-toggle-sidebar",
    title: "Toggle main sidebar",
    description: "Show or hide the left thread sidebar",
    section: "keybindings",
    targetId: "setting-kb-sidebar",
  },
  {
    id: "providers-pi",
    title: "Pi Coding Agent CLI",
    description: "Configure the local Pi CLI binary and runtime status",
    section: "providers",
    targetId: "setting-provider-pi",
  },
  {
    id: "archived-threads",
    title: "Settled & Archived Threads",
    description: "Manage threads that have been settled or archived",
    section: "archived",
    targetId: "setting-archived-list",
  },
];

export function SettingsSidebarNav() {
  const { isMobile, setOpenMobile } = useSidebar();
  const activeSettingsSection = useAppStore((state) => state.activeSettingsSection);
  const setActiveSettingsSection = useAppStore((state) => state.setActiveSettingsSection);

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
        item.description.toLowerCase().includes(q) ||
        SETTINGS_SECTION_LABEL_BY_ID[item.section].toLowerCase().includes(q),
    );
  }, [query]);

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
              placeholder="Search"
              aria-label="Search settings"
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
                aria-label="Clear settings search"
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
              No settings found
            </p>
          ) : null}

          {isSearching ? (
            <SidebarMenu role="listbox" aria-label="Settings search results">
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
                          {item.title}
                        </span>
                        <span className="block truncate text-2xs text-sidebar-muted-foreground/75">
                          {SETTINGS_SECTION_LABEL_BY_ID[item.section]}
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
                      <span className="truncate">{item.label}</span>
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

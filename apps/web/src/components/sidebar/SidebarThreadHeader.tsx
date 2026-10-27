import {
  FolderIcon,
  FolderPlusIcon,
  ListFilterIcon,
  SearchIcon,
  SquarePenIcon,
  XIcon,
} from "lucide-react";
import {
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { transport, useAppStore } from "@pi-web/client-runtime";
import { useI18n } from "~/i18n";
import { cn, isMacPlatform } from "~/lib/utils";
import { projectBasename } from "../../projectIdentity";
import { ProjectIcon } from "../ProjectMonogram";
import { Button } from "../ui/button";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxSearchInput,
  ComboboxTrigger,
} from "../ui/combobox";
import { MiddleTruncate } from "../ui/middle-truncate";
import { SidebarInput, SidebarMenuButton, useSidebar } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ProjectFolderBrowserDialog } from "./ProjectFolderBrowserDialog";

const ALL_PROJECTS_VALUE = "__all__";

interface ProjectFilterItem {
  value: string;
  label: string;
  cwd: string | null;
  threadCount: number;
}

export function SidebarHeaderIconButton({
  label,
  tooltip = label,
  className,
  children,
  ...rest
}: {
  label: string;
  tooltip?: ReactNode;
  className?: string | undefined;
  children?: ReactNode;
} & Omit<
  ComponentProps<typeof SidebarMenuButton>,
  "children" | "className" | "tooltip" | "isActive" | "aria-label"
>) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <SidebarMenuButton
            size="icon"
            type="button"
            aria-label={label}
            {...rest}
            className={cn("relative size-7 shrink-0", className)}
          />
        }
      >
        {children}
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden"
        />
      </TooltipTrigger>
      <TooltipPopup side="top">{tooltip}</TooltipPopup>
    </Tooltip>
  );
}

export function SidebarThreadHeader({
  searchInputRef,
  searchQuery,
  hasSearchQuery,
  onSearchQueryChange,
  onClearSearch,
  onSearchInputKeyDown,
}: {
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  searchQuery: string;
  hasSearchQuery: boolean;
  onSearchQueryChange: (value: string) => void;
  onClearSearch: () => void;
  onSearchInputKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const projects = useAppStore((state) => state.projects);
  const threads = useAppStore((state) => state.threads);
  const defaultCwd = useAppStore((state) => state.defaultCwd);
  const selectedProjectCwd = useAppStore((state) => state.selectedProjectCwd);
  const setSelectedProjectCwd = useAppStore((state) => state.setSelectedProjectCwd);
  const activeThreadId = useAppStore((state) => state.activeThreadId);
  const { tr } = useI18n();

  const searchFieldRef = useRef<HTMLDivElement | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [forceNewThreadOnOpen, setForceNewThreadOnOpen] = useState(false);

  const allProjectCwds = Array.from(
    new Set([
      ...(defaultCwd ? [defaultCwd] : []),
      ...projects,
      ...threads.map((t) => t.cwd).filter(Boolean),
    ]),
  );

  const filterItems: ProjectFilterItem[] = [
    {
      value: ALL_PROJECTS_VALUE,
      label: tr("全部项目", "All projects"),
      cwd: null,
      threadCount: threads.filter((t) => !t.settledAt).length,
    },
    ...allProjectCwds.map((cwd) => ({
      value: cwd,
      label: projectBasename(cwd),
      cwd,
      threadCount: threads.filter((t) => t.cwd === cwd && !t.settledAt).length,
    })),
  ];

  const filteredProjectItems = projectSearchQuery.trim()
    ? filterItems.filter(
        (item) =>
          item.label.toLowerCase().includes(projectSearchQuery.trim().toLowerCase()) ||
          (item.cwd ?? "").toLowerCase().includes(projectSearchQuery.trim().toLowerCase()),
      )
    : filterItems;

  const selectedFilterItem =
    filterItems.find((item) => item.cwd === selectedProjectCwd) ?? filterItems[0]!;

  const activeThread = threads.find((t) => t.id === activeThreadId);
  const setCommandPaletteOpen = useAppStore((state) => state.setCommandPaletteOpen);
  const paletteShortcutHint = isMacPlatform(navigator.platform) ? "⌘K" : "Ctrl K";
  const currentContextCwd =
    selectedProjectCwd ?? activeThread?.cwd ?? defaultCwd ?? allProjectCwds[0] ?? "/";

  const handleStartNewThread = (event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) {
      setForceNewThreadOnOpen(true);
      setAddProjectOpen(true);
      return;
    }
    const state = useAppStore.getState();
    state.markNewThreadRequested();
    transport.dispatch({
      type: "thread.create",
      cwd: currentContextCwd,
      ...(state.selectedModel ? { model: state.selectedModel } : {}),
      ...(state.selectedThinkingLevel ? { thinkingLevel: state.selectedThinkingLevel } : {}),
    });
    if (isMobile) setOpenMobile(false);
  };

  const handleOpenProjectFolder = (rawCwd: string) => {
    const trimmed = rawCwd.trim();
    if (!trimmed) return;
    transport.dispatch({ type: "project.add", cwd: trimmed });
    if (selectedProjectCwd !== null && selectedProjectCwd !== trimmed) {
      setSelectedProjectCwd(trimmed);
    }

    const state = useAppStore.getState();
    const existingThreadsInProject = state.threads
      .filter((t) => t.cwd === trimmed && !t.settledAt)
      .sort((a, b) => b.updatedAt - a.updatedAt);

    if (!forceNewThreadOnOpen && existingThreadsInProject.length > 0) {
      state.setActiveThread(existingThreadsInProject[0]!.id);
    } else {
      state.markNewThreadRequested();
      transport.dispatch({
        type: "thread.create",
        cwd: trimmed,
        ...(state.selectedModel ? { model: state.selectedModel } : {}),
        ...(state.selectedThinkingLevel ? { thinkingLevel: state.selectedThinkingLevel } : {}),
      });
    }
    setForceNewThreadOnOpen(false);
    if (isMobile) setOpenMobile(false);
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <div
          ref={searchFieldRef}
          className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
        >
          <SearchIcon className="size-4 shrink-0 text-(--sidebar-icon-color)" />
          <SidebarInput
            ref={searchInputRef}
            nativeInput
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
            onKeyDown={onSearchInputKeyDown}
            placeholder={tr("搜索", "Search")}
            aria-label={tr("搜索线程", "Search threads")}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={hasSearchQuery}
            className="min-w-0 flex-1"
          />
          {hasSearchQuery ? (
            <Button
              type="button"
              size="icon-micro"
              variant="ghost-muted"
              className="shrink-0"
              aria-label={tr("清空线程搜索", "Clear thread search")}
              onClick={() => {
                onClearSearch();
                searchInputRef.current?.focus();
              }}
            >
              <XIcon className="size-3" />
            </Button>
          ) : (
            // 命令面板入口：与 t3code 一样用快捷键提示引导。
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              title={tr("打开命令面板", "Open command palette")}
              className="text-sidebar-muted-foreground hover:text-sidebar-foreground shrink-0 rounded border border-sidebar-border px-1 font-mono text-[10px] leading-4"
            >
              {paletteShortcutHint}
            </button>
          )}
        </div>

        <div className="flex shrink-0 items-center">
          {/* 1. Filter threads by project icon button */}
          <Combobox
            items={filterItems}
            filteredItems={filteredProjectItems}
            autoHighlight
            itemToStringLabel={(item) => item.label}
            isItemEqualToValue={(a, b) => a.value === b.value}
            open={filterOpen}
            onOpenChange={(open) => {
              setFilterOpen(open);
              if (!open) setProjectSearchQuery("");
            }}
            value={selectedFilterItem}
            onValueChange={(item) => {
              if (!item) return;
              setSelectedProjectCwd(item.cwd);
              setFilterOpen(false);
            }}
          >
            <ComboboxTrigger
              render={
                <SidebarHeaderIconButton
                  label={
                    selectedProjectCwd
                      ? tr(
                          `按项目筛选线程：${selectedFilterItem.label}`,
                          `Filter threads by project: ${selectedFilterItem.label}`,
                        )
                      : tr("按项目筛选线程", "Filter threads by project")
                  }
                />
              }
            >
              {selectedProjectCwd ? (
                <span className="flex shrink-0">
                  <ProjectIcon projectName={selectedFilterItem.label} className="size-4" />
                </span>
              ) : (
                <ListFilterIcon className="size-4" />
              )}
            </ComboboxTrigger>
            <ComboboxPopup
              align="start"
              anchor={searchFieldRef}
              className="max-w-[min(18rem,var(--available-width))] overflow-hidden"
            >
              <ComboboxSearchInput
                aria-label={tr("搜索项目", "Search projects")}
                placeholder={tr("搜索项目…", "Search projects...")}
                value={projectSearchQuery}
                onChange={(event) => setProjectSearchQuery(event.target.value)}
              />
              <ComboboxEmpty>{tr("未找到匹配的项目。", "No matching projects.")}</ComboboxEmpty>
              <ComboboxList>
                {(item: ProjectFilterItem) => (
                  <ComboboxItem key={item.value} hideIndicator value={item}>
                    {item.cwd ? (
                      <ProjectIcon projectName={item.label} className="size-4 shrink-0" />
                    ) : (
                      <FolderIcon className="size-4 shrink-0" />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm">{item.label}</span>
                      {item.cwd ? (
                        <MiddleTruncate
                          value={item.cwd}
                          className="text-2xs text-muted-foreground"
                        />
                      ) : null}
                    </div>
                    <span className="ml-auto font-mono text-2xs text-muted-foreground tabular-nums">
                      {item.threadCount}
                    </span>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxPopup>
          </Combobox>

          {/* 2. Open / Add project folder icon button */}
          <SidebarHeaderIconButton
            label={tr("打开项目文件夹", "Open project folder")}
            onClick={() => {
              setForceNewThreadOnOpen(false);
              setAddProjectOpen(true);
            }}
          >
            <FolderPlusIcon />
          </SidebarHeaderIconButton>

          {/* 3. New thread icon button */}
          <SidebarHeaderIconButton
            label={tr("新建线程", "New thread")}
            tooltip={
              <span className="flex flex-col gap-0.5">
                <span>{tr("新建线程", "New thread")}</span>
                <span className="text-muted-foreground">
                  {tr(
                    "在其他项目中新建线程：Shift+点击",
                    "New thread in another project: Shift+click",
                  )}
                </span>
              </span>
            }
            onClick={handleStartNewThread}
          >
            <SquarePenIcon />
          </SidebarHeaderIconButton>
        </div>
      </div>

      {/* Project Folder Browser Dialog */}
      <ProjectFolderBrowserDialog
        open={addProjectOpen}
        onOpenChange={(nextOpen) => {
          setAddProjectOpen(nextOpen);
          if (!nextOpen) {
            setForceNewThreadOnOpen(false);
          }
        }}
        initialCwd={currentContextCwd}
        onOpenProject={handleOpenProjectFolder}
      />
    </>
  );
}

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
import { cn } from "~/lib/utils";
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
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { MiddleTruncate } from "../ui/middle-truncate";
import { SidebarInput, SidebarMenuButton, useSidebar } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

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

  const searchFieldRef = useRef<HTMLDivElement | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [newProjectPath, setNewProjectPath] = useState("");

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
      label: "All projects",
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

  const handleStartNewThread = (event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) {
      setNewProjectPath(selectedProjectCwd ?? defaultCwd ?? "");
      setAddProjectOpen(true);
      return;
    }
    const activeThread = threads.find((t) => t.id === activeThreadId);
    const targetCwd =
      selectedProjectCwd ?? activeThread?.cwd ?? defaultCwd ?? allProjectCwds[0] ?? "/";
    const state = useAppStore.getState();
    state.markNewThreadRequested();
    transport.dispatch({
      type: "thread.create",
      cwd: targetCwd,
      ...(state.selectedModel ? { model: state.selectedModel } : {}),
      ...(state.selectedThinkingLevel ? { thinkingLevel: state.selectedThinkingLevel } : {}),
    });
    if (isMobile) setOpenMobile(false);
  };

  const handleConfirmAddProject = (createThreadToo: boolean) => {
    const trimmed = newProjectPath.trim();
    if (!trimmed) return;
    transport.dispatch({ type: "project.add", cwd: trimmed });
    setSelectedProjectCwd(trimmed);
    if (createThreadToo) {
      const state = useAppStore.getState();
      state.markNewThreadRequested();
      transport.dispatch({
        type: "thread.create",
        cwd: trimmed,
        ...(state.selectedModel ? { model: state.selectedModel } : {}),
        ...(state.selectedThinkingLevel ? { thinkingLevel: state.selectedThinkingLevel } : {}),
      });
      if (isMobile) setOpenMobile(false);
    }
    setNewProjectPath("");
    setAddProjectOpen(false);
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
            placeholder="Search"
            aria-label="Search threads"
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
              aria-label="Clear thread search"
              onClick={() => {
                onClearSearch();
                searchInputRef.current?.focus();
              }}
            >
              <XIcon className="size-3" />
            </Button>
          ) : null}
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
                      ? `Filter threads by project: ${selectedFilterItem.label}`
                      : "Filter threads by project"
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
                aria-label="Search projects"
                placeholder="Search projects..."
                value={projectSearchQuery}
                onChange={(event) => setProjectSearchQuery(event.target.value)}
              />
              <ComboboxEmpty>No matching projects.</ComboboxEmpty>
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

          {/* 2. Add project icon button */}
          <SidebarHeaderIconButton
            label="Add project"
            onClick={() => {
              setNewProjectPath(selectedProjectCwd ?? defaultCwd ?? "");
              setAddProjectOpen(true);
            }}
          >
            <FolderPlusIcon />
          </SidebarHeaderIconButton>

          {/* 3. New thread icon button */}
          <SidebarHeaderIconButton
            label="New thread"
            tooltip={
              <span className="flex flex-col gap-0.5">
                <span>New thread</span>
                <span className="text-muted-foreground">
                  New thread in another project: Shift+click
                </span>
              </span>
            }
            onClick={handleStartNewThread}
          >
            <SquarePenIcon />
          </SidebarHeaderIconButton>
        </div>
      </div>

      {/* Add Project Dialog */}
      <Dialog open={addProjectOpen} onOpenChange={setAddProjectOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Add Project Workspace</DialogTitle>
            <DialogDescription>
              Enter the local directory path for the project you want to work on with Pi.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <form
              id="add-project-form"
              onSubmit={(event) => {
                event.preventDefault();
                handleConfirmAddProject(true);
              }}
              className="flex flex-col gap-3"
            >
              <Input
                autoFocus
                placeholder="/Users/you/workspace/my-project"
                value={newProjectPath}
                onChange={(event) => setNewProjectPath(event.currentTarget.value)}
              />
            </form>
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
            <Button
              variant="outline"
              disabled={!newProjectPath.trim()}
              onClick={() => handleConfirmAddProject(false)}
            >
              Add Project Only
            </Button>
            <Button
              type="submit"
              form="add-project-form"
              disabled={!newProjectPath.trim()}
            >
              Add & Start Thread
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}

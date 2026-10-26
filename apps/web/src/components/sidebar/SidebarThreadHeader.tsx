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
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { transport, useAppStore } from "@pi-web/client-runtime";
import { projectBasename } from "../../projectIdentity";
import { ProjectIcon } from "../ProjectMonogram";
import { Button } from "../ui/button";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
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

  const [filterOpen, setFilterOpen] = useState(false);
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [newProjectPath, setNewProjectPath] = useState("");
  const filterSearchInputRef = useRef<HTMLInputElement | null>(null);

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
    useAppStore.getState().markNewThreadRequested();
    transport.dispatch({ type: "thread.create", cwd: targetCwd });
    if (isMobile) setOpenMobile(false);
  };

  const handleConfirmAddProject = (createThreadToo: boolean) => {
    const trimmed = newProjectPath.trim();
    if (!trimmed) return;
    transport.dispatch({ type: "project.add", cwd: trimmed });
    setSelectedProjectCwd(trimmed);
    if (createThreadToo) {
      useAppStore.getState().markNewThreadRequested();
      transport.dispatch({ type: "thread.create", cwd: trimmed });
      if (isMobile) setOpenMobile(false);
    }
    setNewProjectPath("");
    setAddProjectOpen(false);
  };

  return (
    <>
      <div className="flex flex-col gap-1 px-2 pt-2 pb-1">
        <div className="flex items-center gap-1">
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2 text-sidebar-muted-foreground" />
            <SidebarInput
              ref={searchInputRef}
              size="sm"
              className="w-full rounded-lg border-transparent bg-sidebar-control-surface [&_input]:ps-6 [&_input]:pe-6 [&_input]:text-xs [&_input]:leading-none [&_input]:placeholder:text-sidebar-muted-foreground"
              placeholder="Search"
              aria-label="Search threads"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              onKeyDown={onSearchInputKeyDown}
            />
            {hasSearchQuery && (
              <button
                type="button"
                aria-label="Clear search query"
                className="absolute top-1/2 right-1.5 z-10 inline-flex size-4 -translate-y-1/2 items-center justify-center rounded-sm text-sidebar-muted-foreground transition-colors hover:text-sidebar-foreground"
                onClick={onClearSearch}
              >
                <XIcon className="size-3" />
              </button>
            )}
          </div>

          <Combobox
            items={filterItems}
            value={selectedFilterItem}
            open={filterOpen}
            onOpenChange={(open) => {
              setFilterOpen(open);
              if (open) {
                requestAnimationFrame(() => filterSearchInputRef.current?.focus());
              }
            }}
            itemToStringLabel={(item: ProjectFilterItem | null) => item?.label ?? ""}
            itemToStringValue={(item: ProjectFilterItem | null) => item?.value ?? ""}
            onValueChange={(item: ProjectFilterItem | null) => {
              if (!item) return;
              setSelectedProjectCwd(item.cwd);
              setFilterOpen(false);
            }}
          >
            <Tooltip>
              <TooltipTrigger
                render={
                  <ComboboxTrigger
                    render={
                      <SidebarMenuButton
                        size="sm"
                        aria-label={
                          selectedProjectCwd
                            ? `Filter by project (${projectBasename(selectedProjectCwd)})`
                            : "Filter by project"
                        }
                        isActive={selectedProjectCwd !== null}
                        className="relative size-7 shrink-0 justify-center rounded-lg bg-sidebar-control-surface p-0 text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                      />
                    }
                  >
                    <ListFilterIcon className="size-3.5" />
                    {selectedProjectCwd !== null && (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary ring-2 ring-sidebar"
                      />
                    )}
                  </ComboboxTrigger>
                }
              />
              <TooltipPopup side="bottom">
                {selectedProjectCwd
                  ? `Filtered: ${projectBasename(selectedProjectCwd)}`
                  : "Filter by project"}
              </TooltipPopup>
            </Tooltip>

            <ComboboxPopup
              side="bottom"
              align="end"
              sideOffset={6}
              className="w-64"
              initialFocus={filterSearchInputRef}
            >
              <div className="border-b p-1">
                <ComboboxInput
                  ref={filterSearchInputRef}
                  placeholder="Search projects..."
                  size="sm"
                  showTrigger={false}
                  aria-label="Search projects"
                  className="border-0 bg-transparent shadow-none before:hidden focus-within:ring-0"
                />
              </div>
              <ComboboxEmpty>No projects found.</ComboboxEmpty>
              <ComboboxList className="max-h-60 py-1">
                {(item: ProjectFilterItem) => (
                  <ComboboxItem
                    key={item.value}
                    value={item}
                    hideIndicator
                    className="min-h-8 gap-2 py-1.5 text-xs sm:text-xs"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      {item.cwd === null ? (
                        <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ProjectIcon projectName={item.label} className="size-3.5 shrink-0" />
                      )}
                      <MiddleTruncate
                        value={item.label}
                        className={
                          item.cwd === selectedProjectCwd
                            ? "flex-1 font-medium text-foreground"
                            : "flex-1"
                        }
                      />
                      <span className="shrink-0 font-mono text-2xs text-muted-foreground tabular-nums">
                        {item.threadCount}
                      </span>
                    </div>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxPopup>
          </Combobox>

          <Tooltip>
            <TooltipTrigger
              render={
                <SidebarMenuButton
                  size="sm"
                  aria-label="Add project"
                  onClick={() => {
                    setNewProjectPath(selectedProjectCwd ?? defaultCwd ?? "");
                    setAddProjectOpen(true);
                  }}
                  className="size-7 shrink-0 justify-center rounded-lg bg-sidebar-control-surface p-0 text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground active:bg-sidebar-row-hover"
                >
                  <FolderPlusIcon className="size-3.5" />
                </SidebarMenuButton>
              }
            />
            <TooltipPopup side="bottom">Add project</TooltipPopup>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <SidebarMenuButton
                  size="sm"
                  aria-label="New thread"
                  data-testid="new-thread-button"
                  onClick={handleStartNewThread}
                  className="size-7 shrink-0 justify-center rounded-lg bg-sidebar-control-surface p-0 text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground active:bg-sidebar-row-hover"
                >
                  <SquarePenIcon className="size-3.5" />
                </SidebarMenuButton>
              }
            />
            <TooltipPopup side="bottom">
              New thread
              {selectedProjectCwd ? ` in ${projectBasename(selectedProjectCwd)}` : ""} · Shift+click
              to choose path
            </TooltipPopup>
          </Tooltip>
        </div>

        {selectedProjectCwd !== null && (
          <div className="flex items-center justify-between gap-1.5 rounded-md bg-sidebar-control-surface/70 px-2 py-1 text-2xs text-sidebar-muted-foreground">
            <div className="flex min-w-0 items-center gap-1.5">
              <ProjectIcon
                projectName={projectBasename(selectedProjectCwd)}
                className="size-3 shrink-0"
              />
              <span className="truncate font-medium text-sidebar-foreground">
                {projectBasename(selectedProjectCwd)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedProjectCwd(null)}
              aria-label="Clear project filter"
              className="inline-flex size-4 shrink-0 items-center justify-center rounded text-sidebar-muted-foreground transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
            >
              <XIcon className="size-3" />
            </button>
          </div>
        )}
      </div>

      <Dialog open={addProjectOpen} onOpenChange={setAddProjectOpen}>
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add project directory</DialogTitle>
            <DialogDescription>
              Enter the local workspace folder path (`cwd`) to add to the project filter or start a
              new Pi thread in.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <Input
              value={newProjectPath}
              onChange={(event) => setNewProjectPath(event.target.value)}
              placeholder={defaultCwd ?? "/path/to/workspace"}
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleConfirmAddProject(true);
                }
              }}
            />
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button
              variant="secondary"
              size="sm"
              disabled={newProjectPath.trim().length === 0}
              onClick={() => handleConfirmAddProject(false)}
            >
              Add project
            </Button>
            <Button
              size="sm"
              disabled={newProjectPath.trim().length === 0}
              onClick={() => handleConfirmAddProject(true)}
            >
              Start thread
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}

import {
  ArrowLeftIcon,
  ChartNoAxesColumnIcon,
  GitPullRequestArrowIcon,
} from "lucide-react";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import type { ServerConfigResponse } from "@pi-web/protocol";
import { transport, useAppStore, type SidebarUtilityPage } from "@pi-web/client-runtime";
import { getLocalStorageItem, removeLocalStorageItem } from "./hooks/useLocalStorage";
import { cn, isMacPlatform } from "./lib/utils";
import { SidebarBrandWidthProbe } from "./components/sidebar/SidebarChrome";
import { ThreadSidebar } from "./components/ThreadSidebar";
import {
  clampThreadSidebarWidth,
  resolveInitialThreadSidebarWidth,
  resolveThreadSidebarMaximumWidth,
  resolveThreadSidebarMinimumWidth,
  THREAD_MAIN_CONTENT_MIN_WIDTH,
  THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
} from "./components/threadSidebarWidth";
import { ChatView } from "./components/chat/ChatView";
import { SettingsView } from "./components/settings/SettingsView";
import { Button } from "./components/ui/button";
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
  useSidebarVisibility,
} from "./components/ui/sidebar";
import {
  Tooltip,
  TooltipPopup,
  TooltipProvider,
  TooltipTrigger,
} from "./components/ui/tooltip";

const autoCreateStarted = { current: false };

function subscribeToViewportWidth(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function readViewportWidth(): number {
  return window.innerWidth;
}

function readInitialThreadSidebarWidth(): number {
  const stored = getLocalStorageItem<number>(THREAD_SIDEBAR_WIDTH_STORAGE_KEY);
  return resolveInitialThreadSidebarWidth(
    typeof stored === "number" && Number.isFinite(stored) ? stored : null,
    window.innerWidth,
  );
}

function SidebarControl() {
  const { toggleSidebar, isMobile, mobileSheetMounted } = useSidebar();
  const isSidebarVisible = useSidebarVisibility();
  const shortcutLabel = isMacPlatform(navigator.platform) ? "⌘B" : "Ctrl+B";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const mod = isMacPlatform(navigator.platform) ? event.metaKey : event.ctrlKey;
      if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "b") {
        event.preventDefault();
        event.stopPropagation();
        toggleSidebar();
        return;
      }
      if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "z") {
        const undoNotice = useAppStore.getState().undoNotice;
        if (undoNotice && isSidebarVisible) {
          const target = event.target;
          const inEditable =
            target instanceof HTMLElement &&
            (target.tagName === "INPUT" ||
              target.tagName === "TEXTAREA" ||
              target.isContentEditable);
          if (!inEditable) {
            event.preventDefault();
            event.stopPropagation();
            if (undoNotice.kind === "settled") {
              useAppStore.getState().patchThreadSummary(undoNotice.threadId, { settledAt: null });
              transport.dispatch({
                type: "thread.settle",
                threadId: undoNotice.threadId,
                settled: false,
              });
            } else {
              useAppStore
                .getState()
                .patchThreadSummary(undoNotice.threadId, { snoozedUntil: null, wokeAt: null });
              transport.dispatch({
                type: "thread.snooze",
                threadId: undoNotice.threadId,
                snoozedUntil: null,
              });
            }
            useAppStore.getState().setActiveThread(undoNotice.threadId);
            useAppStore.getState().setUndoNotice(null);
          }
        }
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [isSidebarVisible, toggleSidebar]);

  return (
    <div
      className={cn(
        "pointer-events-none fixed top-[var(--workspace-controls-top)] left-[var(--workspace-controls-left)] z-50 ml-px flex h-[var(--workspace-topbar-height)] items-center",
        isMobile && mobileSheetMounted && "hidden",
      )}
      data-sidebar-control=""
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarTrigger
              variant={isSidebarVisible ? "media-navigation" : "ghost"}
              className={cn(
                "pointer-events-auto",
                isSidebarVisible && "relative top-auto translate-y-0",
              )}
              aria-label="Toggle main sidebar"
            />
          }
        />
        <TooltipPopup side="bottom">Toggle main sidebar ({shortcutLabel})</TooltipPopup>
      </Tooltip>
    </div>
  );
}

export function App() {
  const activeThreadId = useAppStore((state) => state.activeThreadId);
  const setActiveThread = useAppStore((state) => state.setActiveThread);
  const activeUtilityPage = useAppStore((state) => state.activeUtilityPage);
  const threads = useAppStore((state) => state.threads);
  const connection = useAppStore((state) => state.connection);
  const defaultCwd = useAppStore((state) => state.defaultCwd);

  const [sidebarWidth, setSidebarWidth] = useState(readInitialThreadSidebarWidth);
  const viewportWidth = useSyncExternalStore(subscribeToViewportWidth, readViewportWidth);
  const [brandWidth, setBrandWidth] = useState(0);
  const sidebarMinimumWidth = resolveThreadSidebarMinimumWidth(brandWidth);
  const sidebarMaximumWidth = resolveThreadSidebarMaximumWidth(viewportWidth, sidebarMinimumWidth);

  const resetSidebarWidth = () => {
    removeLocalStorageItem(THREAD_SIDEBAR_WIDTH_STORAGE_KEY);
    setSidebarWidth(resolveInitialThreadSidebarWidth(null, viewportWidth));
  };

  useEffect(() => {
    void fetch("/api/config")
      .then((response) => response.json())
      .then((config: ServerConfigResponse) => {
        useAppStore.getState().setConfig({
          defaultCwd: config.defaultCwd,
          projects: config.projects,
          piStatus: config.pi,
        });
      })
      .catch(() => {});
  }, []);

  const hasThreads = threads.length > 0;
  useEffect(() => {
    if (defaultCwd !== null && !hasThreads && !autoCreateStarted.current) {
      autoCreateStarted.current = true;
      transport.dispatch({ type: "thread.create", cwd: defaultCwd });
    }
  }, [defaultCwd, hasThreads]);

  useEffect(() => {
    if (activeThreadId === null && threads.length > 0) {
      const firstActive = threads.find((t) => !t.settledAt && !t.snoozedUntil) ?? threads[0];
      if (firstActive) {
        setActiveThread(firstActive.id);
      }
    }
  }, [activeThreadId, threads, setActiveThread]);

  useEffect(() => {
    if (activeThreadId === null) return;
    transport.subscribe(activeThreadId);
    return () => transport.unsubscribe(activeThreadId);
  }, [activeThreadId]);

  const sidebarProviderStyle = {
    "--sidebar-width": `${clampThreadSidebarWidth(sidebarWidth, sidebarMinimumWidth, sidebarMaximumWidth)}px`,
  } as CSSProperties;

  return (
    <TooltipProvider>
      <SidebarProvider
        className="h-dvh! min-h-0!"
        defaultOpen
        style={sidebarProviderStyle}
      >
        <SidebarBrandWidthProbe onWidthChange={setBrandWidth} />
        <Sidebar
          side="left"
          collapsible="offcanvas"
          data-app-sidebar=""
          role="navigation"
          aria-label="Threads"
          resizable={{
            maxWidth: sidebarMaximumWidth,
            minWidth: sidebarMinimumWidth,
            shouldAcceptWidth: ({ currentWidth, nextWidth, wrapper }) =>
              nextWidth <= currentWidth ||
              wrapper.clientWidth - nextWidth >= THREAD_MAIN_CONTENT_MIN_WIDTH,
            storageKey: THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
            onResize: setSidebarWidth,
          }}
        >
          <ThreadSidebar />
          <SidebarRail onDoubleClick={resetSidebarWidth} />
        </Sidebar>

        <SidebarInset className="flex h-dvh min-w-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
          {activeUtilityPage !== null ? (
            <UtilityPageView page={activeUtilityPage} />
          ) : activeThreadId === null ? (
            <EmptyWelcome connection={connection} />
          ) : (
            <ChatView key={activeThreadId} threadId={activeThreadId} />
          )}
        </SidebarInset>

        <SidebarControl />
      </SidebarProvider>
    </TooltipProvider>
  );
}

function UtilityPageView({ page }: { page: SidebarUtilityPage }) {
  const isSidebarVisible = useSidebarVisibility();
  const setActiveUtilityPage = useAppStore((state) => state.setActiveUtilityPage);
  const projects = useAppStore((state) => state.projects);
  const threads = useAppStore((state) => state.threads);

  if (page === "settings") {
    return <SettingsView />;
  }

  const meta = {
    "pull-requests": {
      title: "Pull Requests",
      icon: <GitPullRequestArrowIcon className="size-4" />,
    },
    usage: {
      title: "Usage",
      icon: <ChartNoAxesColumnIcon className="size-4" />,
    },
  }[page];

  return (
    <div className="flex h-full flex-col">
      <header
        className={cn(
          "flex h-[var(--workspace-topbar-height)] shrink-0 items-center justify-between border-b border-border/50 px-4",
          !isSidebarVisible &&
            "pl-[calc(var(--workspace-controls-left)+var(--workspace-titlebar-control-size)+0.75rem)]",
        )}
      >
        <div className="flex items-center gap-2 text-xs font-medium">
          {meta.icon}
          <span>{meta.title}</span>
        </div>
        <Button size="xs" variant="ghost" onClick={() => setActiveUtilityPage(null)}>
          <ArrowLeftIcon className="size-3.5" />
          <span>Back to chat</span>
        </Button>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 overflow-y-auto p-6">
        {page === "pull-requests" && (
          <div className="rounded-xl border bg-card p-5 text-card-foreground shadow-xs">
            <h2 className="text-sm font-semibold">Pull Requests</h2>
            <p className="mt-2 text-xs text-muted-foreground">
              No pull requests linked to active Pi threads yet.
            </p>
          </div>
        )}

        {page === "usage" && (
          <div className="rounded-xl border bg-card p-5 text-card-foreground shadow-xs">
            <h2 className="text-sm font-semibold">Workspace Usage</h2>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border p-3">
                <div className="font-mono text-lg font-semibold">
                  {threads.filter((t) => !t.settledAt && !t.snoozedUntil).length}
                </div>
                <div className="text-2xs text-muted-foreground">Active threads</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="font-mono text-lg font-semibold">
                  {threads.filter((t) => t.settledAt != null).length}
                </div>
                <div className="text-2xs text-muted-foreground">Settled</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="font-mono text-lg font-semibold">{projects.length}</div>
                <div className="text-2xs text-muted-foreground">Projects</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyWelcome({ connection }: { connection: string }) {
  const piStatus = useAppStore((state) => state.piStatus);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-2xl font-semibold">Pi Web</h1>
      <p className="text-muted-foreground max-w-md text-sm">
        单 pi agent 的控制台。点击左侧顶栏新建一个线程开始对话。
      </p>
      {piStatus && !piStatus.installed && (
        <p className="text-error max-w-md text-sm">
          未检测到 pi CLI（`pi --version` 失败）。请先安装
          @earendil-works/pi-coding-agent 并完成登录。
        </p>
      )}
      {connection === "offline" && <p className="text-error text-sm">连接已断开，正在重连…</p>}
    </div>
  );
}

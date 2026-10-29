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
import { getLocalStorageItem, removeLocalStorageItem, useLocalStorage } from "./hooks/useLocalStorage";
import { useI18n } from "./i18n";
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
import { CommandPalette } from "./components/command-palette/CommandPalette";
import { DEFAULT_PI_SETTINGS, PI_SETTINGS_STORAGE_KEY, SettingsView, type PiSettingsState } from "./components/settings/SettingsView";
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
import { AnchoredToastProvider, ToastProvider } from "./components/ui/toast";

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
  const { tr } = useI18n();

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
      // Alt+ArrowUp / Alt+ArrowDown: cycle active threads
      if (event.altKey && !mod && !event.shiftKey && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        const target = event.target;
        const inEditable =
          target instanceof HTMLElement &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable);
        if (!inEditable) {
          event.preventDefault();
          event.stopPropagation();
          const state = useAppStore.getState();
          const threadList = state.threads.filter((t) => !t.settledAt && !t.snoozedUntil);
          if (threadList.length > 0) {
            const currentIdx = threadList.findIndex((t) => t.id === state.activeThreadId);
            if (currentIdx === -1) {
              state.setActiveThread(threadList[0]!.id);
            } else if (event.key === "ArrowDown") {
              const next = threadList[(currentIdx + 1) % threadList.length]!;
              state.setActiveThread(next.id);
            } else {
              const prev = threadList[(currentIdx - 1 + threadList.length) % threadList.length]!;
              state.setActiveThread(prev.id);
            }
          }
          return;
        }
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
              aria-label={tr("切换主侧边栏", "Toggle main sidebar")}
            />
          }
        />
        <TooltipPopup side="bottom">
          {tr(`切换主侧边栏 (${shortcutLabel})`, `Toggle main sidebar (${shortcutLabel})`)}
        </TooltipPopup>
      </Tooltip>
    </div>
  );
}

export function App() {
  const [settings] = useLocalStorage<PiSettingsState>(PI_SETTINGS_STORAGE_KEY, DEFAULT_PI_SETTINGS);
  useEffect(() => {
    document.documentElement.style.fontSize = settings.fontScale === "compact" ? "92%" : settings.fontScale === "comfortable" ? "108%" : "";
  }, [settings.fontScale]);
  const activeThreadId = useAppStore((state) => state.activeThreadId);
  const setActiveThread = useAppStore((state) => state.setActiveThread);
  const activeUtilityPage = useAppStore((state) => state.activeUtilityPage);
  const threads = useAppStore((state) => state.threads);
  const threadsLoaded = useAppStore((state) => state.threadsLoaded);
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
    // 必须等待 WebSocket 首帧 threads 列表返回确认真的没有任何历史线程时，才自动创建初始线程
    if (threadsLoaded && defaultCwd !== null && !hasThreads && !autoCreateStarted.current) {
      autoCreateStarted.current = true;
      useAppStore.getState().markNewThreadRequested();
      transport.dispatch({ type: "thread.create", cwd: defaultCwd });
    }
  }, [threadsLoaded, defaultCwd, hasThreads]);

  useEffect(() => {
    if (!threadsLoaded || threads.length === 0) return;
    const currentExists =
      activeThreadId !== null && threads.some((t) => t.id === activeThreadId);
    if (!currentExists) {
      const firstActive = threads.find((t) => !t.settledAt && !t.snoozedUntil) ?? threads[0];
      if (firstActive) {
        setActiveThread(firstActive.id);
      }
    }
  }, [activeThreadId, threads, threadsLoaded, setActiveThread]);

  useEffect(() => {
    if (activeThreadId === null) return;
    transport.subscribe(activeThreadId);
    return () => transport.unsubscribe(activeThreadId);
  }, [activeThreadId]);

  const sidebarProviderStyle = {
    "--sidebar-width": `${clampThreadSidebarWidth(sidebarWidth, sidebarMinimumWidth, sidebarMaximumWidth)}px`,
  } as CSSProperties;

  return (
    <ToastProvider>
      <AnchoredToastProvider>
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
            <CommandPalette />
          </SidebarProvider>
        </TooltipProvider>
      </AnchoredToastProvider>
    </ToastProvider>
  );
}

function UtilityPageView({ page }: { page: SidebarUtilityPage }) {
  const isSidebarVisible = useSidebarVisibility();
  const setActiveUtilityPage = useAppStore((state) => state.setActiveUtilityPage);
  const projects = useAppStore((state) => state.projects);
  const threads = useAppStore((state) => state.threads);
  const { tr } = useI18n();

  if (page === "settings") {
    return <SettingsView />;
  }

  const meta = {
    "pull-requests": {
      title: tr("拉取请求 (Pull Requests)", "Pull Requests"),
      icon: <GitPullRequestArrowIcon className="size-4" />,
    },
    usage: {
      title: tr("用量统计 (Usage)", "Usage"),
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
          <span>{tr("返回对话", "Back to chat")}</span>
        </Button>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 overflow-y-auto p-6">
        {page === "pull-requests" && (
          <div className="rounded-xl border bg-card p-5 text-card-foreground shadow-xs">
            <h2 className="text-sm font-semibold">{tr("拉取请求", "Pull Requests")}</h2>
            <p className="mt-2 text-xs text-muted-foreground">
              {tr(
                "当前暂无关联至活跃 Pi 线程的 Pull Request。",
                "No pull requests linked to active Pi threads yet.",
              )}
            </p>
          </div>
        )}

        {page === "usage" && (
          <div className="rounded-xl border bg-card p-5 text-card-foreground shadow-xs">
            <h2 className="text-sm font-semibold">{tr("工作区用量统计", "Workspace Usage")}</h2>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border p-3">
                <div className="font-mono text-lg font-semibold">
                  {threads.filter((t) => !t.settledAt && !t.snoozedUntil).length}
                </div>
                <div className="text-2xs text-muted-foreground">
                  {tr("活跃线程", "Active threads")}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="font-mono text-lg font-semibold">
                  {threads.filter((t) => t.settledAt != null).length}
                </div>
                <div className="text-2xs text-muted-foreground">
                  {tr("已结项", "Settled")}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="font-mono text-lg font-semibold">{projects.length}</div>
                <div className="text-2xs text-muted-foreground">
                  {tr("项目数", "Projects")}
                </div>
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
  const { tr } = useI18n();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-2xl font-semibold">FR Code</h1>
      <p className="text-muted-foreground max-w-md text-sm">
        {tr(
          "FR Code · 专为 Pi Agent 打造的工作台。点击左侧顶栏新建一个线程开始对话。",
          "FR Code · Dedicated Pi coding agent console. Click the header button in the sidebar to start a new thread.",
        )}
      </p>
      {piStatus && !piStatus.installed && (
        <p className="text-error max-w-md text-sm">
          {tr(
            "未检测到 pi CLI（`pi --version` 失败）。请先安装 @earendil-works/pi-coding-agent 并完成登录。",
            "Pi CLI not detected (`pi --version` failed). Please install @earendil-works/pi-coding-agent and sign in first.",
          )}
        </p>
      )}
      {connection === "offline" && (
        <p className="text-error text-sm">
          {tr("连接已断开，正在重连…", "Disconnected — reconnecting…")}
        </p>
      )}
    </div>
  );
}

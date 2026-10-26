import {
  ArrowLeftIcon,
  ChartNoAxesColumnIcon,
  DownloadIcon,
  GitPullRequestArrowIcon,
  SettingsIcon,
  Undo2Icon,
  XIcon,
} from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { transport, useAppStore, type SidebarUtilityPage } from "@pi-web/client-runtime";
import { observeResize } from "~/lib/observeResize";
import { cn, isMacPlatform } from "~/lib/utils";
import { SidebarStageBackdrop } from "../SidebarStageBackdrop";
import { T3Wordmark } from "../T3Wordmark";
import {
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const HEADER_CONTENT_PADDING =
  "pl-[calc(var(--workspace-controls-left)+var(--workspace-titlebar-control-size)+0.5rem)] pr-3";

function WordmarkLockup() {
  return (
    <span className="flex min-w-0 items-center gap-1.5" aria-label="T3 Code">
      <T3Wordmark />
      <span className="truncate text-sm font-medium tracking-tight text-white drop-shadow-[0_1px_1px_rgba(2,6,23,0.72)]">
        Code
      </span>
    </span>
  );
}

export function SidebarBrandWidthProbe({
  onWidthChange,
}: {
  onWidthChange?: (width: number) => void;
}) {
  const probeRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const probe = probeRef.current;
    if (!probe || !onWidthChange) return;

    const measure = () => {
      onWidthChange(Math.ceil(probe.getBoundingClientRect().width));
    };

    measure();
    return observeResize(probe, measure);
  }, [onWidthChange]);

  return (
    <div
      ref={probeRef}
      aria-hidden="true"
      className={cn(
        "pointer-events-none invisible fixed top-0 left-0 -z-10 flex w-max items-center",
        HEADER_CONTENT_PADDING,
      )}
    >
      <div className="flex items-center gap-1.5">
        <WordmarkLockup />
      </div>
    </div>
  );
}

export function SidebarChromeHeader() {
  const { isMobile, setOpenMobile } = useSidebar();
  const setActiveUtilityPage = useAppStore((state) => state.setActiveUtilityPage);

  return (
    <SidebarHeader
      className={cn(
        "relative h-[var(--workspace-topbar-height)] justify-center border-b border-border py-0 text-white",
        HEADER_CONTENT_PADDING,
      )}
    >
      <SidebarStageBackdrop variant="nightly" />
      <div className="relative z-10 flex min-w-0 items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            setActiveUtilityPage(null);
            if (isMobile) setOpenMobile(false);
          }}
          className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md text-left transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
        >
          <WordmarkLockup />
        </button>
      </div>
    </SidebarHeader>
  );
}

function SidebarThreadUndoNoticeBar() {
  const undoNotice = useAppStore((state) => state.undoNotice);
  const setUndoNotice = useAppStore((state) => state.setUndoNotice);
  const patchThreadSummary = useAppStore((state) => state.patchThreadSummary);
  const setActiveThread = useAppStore((state) => state.setActiveThread);

  if (!undoNotice) return null;

  const handleUndo = () => {
    const { kind, threadId } = undoNotice;
    if (kind === "settled") {
      patchThreadSummary(threadId, { settledAt: null });
      transport.dispatch({ type: "thread.settle", threadId, settled: false });
    } else {
      patchThreadSummary(threadId, { snoozedUntil: null, wokeAt: null });
      transport.dispatch({ type: "thread.snooze", threadId, snoozedUntil: null });
    }
    setActiveThread(threadId);
    setUndoNotice(null);
  };

  const shortcutHint = isMacPlatform(navigator.platform) ? "⌘Z" : "Ctrl+Z";

  return (
    <div className="px-2 pb-1">
      <div className="flex items-center justify-between gap-1.5 rounded-lg border border-sidebar-border bg-sidebar-control-surface px-2.5 py-1.5 text-xs text-sidebar-foreground shadow-xs">
        <span className="min-w-0 flex-1 truncate text-sidebar-muted-foreground">
          {undoNotice.kind === "settled" ? "Settled" : "Snoozed"}{" "}
          <span className="font-medium text-sidebar-foreground">{undoNotice.title}</span>
        </span>
        <button
          type="button"
          onClick={handleUndo}
          title={`Undo (${shortcutHint})`}
          className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-2xs font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-row-hover"
        >
          <Undo2Icon className="size-3" />
          <span>Undo</span>
        </button>
        <button
          type="button"
          onClick={() => setUndoNotice(null)}
          aria-label="Dismiss undo notice"
          className="inline-flex size-4 shrink-0 items-center justify-center rounded text-sidebar-muted-foreground transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
        >
          <XIcon className="size-3" />
        </button>
      </div>
    </div>
  );
}

export function SidebarChromeFooter() {
  const { isMobile, setOpenMobile } = useSidebar();
  const activeUtilityPage = useAppStore((state) => state.activeUtilityPage);
  const setActiveUtilityPage = useAppStore((state) => state.setActiveUtilityPage);
  const connection = useAppStore((state) => state.connection);
  const piStatus = useAppStore((state) => state.piStatus);

  const isOnUtilityPage = activeUtilityPage !== null;

  const openUtilityPage = (page: SidebarUtilityPage) => {
    setActiveUtilityPage(page);
    if (isMobile) setOpenMobile(false);
  };

  const handleBackClick = () => {
    setActiveUtilityPage(null);
    if (isMobile) setOpenMobile(false);
  };

  const statusText =
    connection === "offline"
      ? "Disconnected — reconnecting…"
      : piStatus?.installed
        ? `Pi CLI ${piStatus.version ?? "ready"} · Connected`
        : "Connected to pi-web server";

  return (
    <SidebarFooter>
      <SidebarThreadUndoNoticeBar />
      <SidebarMenu className="flex-row items-center">
        {isOnUtilityPage ? (
          <SidebarMenuItem className="min-w-0 flex-1">
            <SidebarMenuButton onClick={handleBackClick}>
              <ArrowLeftIcon />
              <span>Back</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : (
          <>
            <SidebarMenuItem>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <SidebarMenuButton
                      size="sm"
                      className="size-7 justify-center p-0 text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      aria-label="Settings"
                      onClick={() => openUtilityPage("settings")}
                    >
                      <SettingsIcon className="size-3.5" />
                    </SidebarMenuButton>
                  }
                />
                <TooltipPopup side="top">Settings</TooltipPopup>
              </Tooltip>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <SidebarMenuButton
                      size="sm"
                      className="size-7 justify-center p-0 text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      aria-label="Pull Requests"
                      onClick={() => openUtilityPage("pull-requests")}
                    >
                      <GitPullRequestArrowIcon className="size-3.5" />
                    </SidebarMenuButton>
                  }
                />
                <TooltipPopup side="top">Pull Requests</TooltipPopup>
              </Tooltip>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <SidebarMenuButton
                      size="sm"
                      className="size-7 justify-center p-0 text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      aria-label="Usage"
                      onClick={() => openUtilityPage("usage")}
                    >
                      <ChartNoAxesColumnIcon className="size-3.5" />
                    </SidebarMenuButton>
                  }
                />
                <TooltipPopup side="top">Usage</TooltipPopup>
              </Tooltip>
            </SidebarMenuItem>
          </>
        )}

        <SidebarMenuItem className="ml-auto">
          <Tooltip>
            <TooltipTrigger
              render={
                <SidebarMenuButton
                  size="sm"
                  aria-label={statusText}
                  onClick={() => openUtilityPage("settings")}
                  className="relative size-7 justify-center overflow-visible rounded-full bg-sidebar-control-surface p-0 text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground active:bg-sidebar-row-hover"
                >
                  <DownloadIcon className="size-3.5" />
                  <span
                    aria-hidden="true"
                    className={cn(
                      "pointer-events-none absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2 ring-sidebar",
                      connection === "online" && "bg-sky-500",
                      connection === "connecting" && "bg-amber-500",
                      connection === "offline" && "bg-destructive",
                    )}
                  />
                </SidebarMenuButton>
              }
            />
            <TooltipPopup side="top">{statusText}</TooltipPopup>
          </Tooltip>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}

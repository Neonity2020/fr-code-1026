import {
  ArrowLeftIcon,
  ChartNoAxesColumnIcon,
  CheckIcon,
  GitPullRequestArrowIcon,
  RotateCwIcon,
  SettingsIcon,
  Undo2Icon,
  XIcon,
} from "lucide-react";
import { memo, useLayoutEffect, useRef, type ReactNode } from "react";
import { transport, useAppStore, type SidebarUtilityPage } from "@pi-web/client-runtime";
import { useI18n } from "~/i18n";
import { observeResize } from "~/lib/observeResize";
import { cn, isMacPlatform } from "~/lib/utils";
import { SidebarStageBackdrop } from "../SidebarStageBackdrop";
import { FRWordmark } from "../T3Wordmark";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

function SidebarBrandMark({ onBackdrop }: { onBackdrop: boolean }) {
  return (
    <span
      className="inline-flex min-w-0 items-baseline gap-1 text-sm font-medium tracking-tight"
      aria-label="FR Code"
    >
      <FRWordmark aria-label="FR" className="h-[1cap] w-auto shrink-0" />
      <span
        className={cn(
          "truncate [text-box:trim-both_cap_alphabetic] supports-[text-box:trim-both_cap_alphabetic]:py-1",
          onBackdrop ? "text-white/70" : "text-muted-foreground",
        )}
      >
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
      className="pointer-events-none invisible fixed top-0 left-0 -z-10 flex w-max border-r border-transparent pr-3"
    >
      <div className="ml-[var(--workspace-titlebar-content-left)] flex">
        <SidebarBrandMark onBackdrop={false} />
      </div>
    </div>
  );
}

export const SidebarChromeHeader = memo(function SidebarChromeHeader() {
  const { isMobile, setOpenMobile } = useSidebar();
  const setActiveUtilityPage = useAppStore((state) => state.setActiveUtilityPage);

  return (
    <div className="relative flex h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center gap-2 pr-3">
      <SidebarStageBackdrop variant="nightly" />
      <div className="relative top-[calc(var(--workspace-controls-top)-env(safe-area-inset-top))] z-10 ml-[calc(var(--workspace-controls-left)+1px-env(safe-area-inset-left))] flex shrink-0 items-center md:hidden">
        <SidebarTrigger
          variant="media-navigation"
          className="relative top-auto translate-y-0"
          aria-label="Toggle main sidebar"
        />
      </div>
      <div className="relative z-10 flex h-8 min-w-0 flex-1 flex-wrap content-start items-center gap-x-2 overflow-hidden py-0.5">
        <button
          type="button"
          aria-label="Go to threads"
          onClick={() => {
            setActiveUtilityPage(null);
            if (isMobile) setOpenMobile(false);
          }}
          className="relative z-10 ml-[var(--workspace-titlebar-content-left)] hidden h-7 w-fit min-w-0 shrink-0 cursor-pointer items-center overflow-hidden rounded-md text-white outline-hidden ring-ring focus-visible:ring-2 focus-visible:ring-inset md:flex"
        >
          <SidebarBrandMark onBackdrop />
        </button>
      </div>
    </div>
  );
});

function SidebarThreadUndoNoticeBar() {
  const undoNotice = useAppStore((state) => state.undoNotice);
  const setUndoNotice = useAppStore((state) => state.setUndoNotice);
  const patchThreadSummary = useAppStore((state) => state.patchThreadSummary);
  const setActiveThread = useAppStore((state) => state.setActiveThread);
  const { tr } = useI18n();

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
    <div className="pb-1">
      <div className="flex items-center justify-between gap-1.5 rounded-lg border border-sidebar-border bg-sidebar-control-surface px-2.5 py-1.5 text-xs text-sidebar-foreground shadow-xs">
        <span className="min-w-0 flex-1 truncate text-sidebar-muted-foreground">
          {undoNotice.kind === "settled"
            ? tr("已结项", "Settled")
            : tr("已延后", "Snoozed")}{" "}
          <span className="font-medium text-sidebar-foreground">{undoNotice.title}</span>
        </span>
        <button
          type="button"
          onClick={handleUndo}
          title={tr(`撤销 (${shortcutHint})`, `Undo (${shortcutHint})`)}
          className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-2xs font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-row-hover"
        >
          <Undo2Icon className="size-3" />
          <span>{tr("撤销", "Undo")}</span>
        </button>
        <button
          type="button"
          onClick={() => setUndoNotice(null)}
          aria-label={tr("关闭提示", "Dismiss undo notice")}
          className="inline-flex size-4 shrink-0 items-center justify-center rounded text-sidebar-muted-foreground transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
        >
          <XIcon className="size-3" />
        </button>
      </div>
    </div>
  );
}

function SidebarUtilityItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <SidebarMenuItem className="shrink-0">
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarMenuButton aria-label={label} onClick={onClick} size="icon">
              {icon}
            </SidebarMenuButton>
          }
        />
        <TooltipPopup side="top">{label}</TooltipPopup>
      </Tooltip>
    </SidebarMenuItem>
  );
}

export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  const { isMobile, setOpenMobile } = useSidebar();
  const activeUtilityPage = useAppStore((state) => state.activeUtilityPage);
  const setActiveUtilityPage = useAppStore((state) => state.setActiveUtilityPage);
  const connection = useAppStore((state) => state.connection);
  const piStatus = useAppStore((state) => state.piStatus);
  const { tr } = useI18n();

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
      ? tr("连接已断开 — 正在重连…", "Disconnected — reconnecting…")
      : piStatus?.installed
        ? tr(
            `Pi CLI ${piStatus.version ?? "已就绪"} · 已是最新`,
            `Pi CLI ${piStatus.version ?? "ready"} · Up to date`,
          )
        : tr("已连接至 FR Code 服务", "Connected to FR Code server");

  return (
    <SidebarFooter>
      <SidebarThreadUndoNoticeBar />
      <SidebarMenu className="flex-row items-center">
        {isOnUtilityPage ? (
          <SidebarMenuItem className="min-w-0 flex-1">
            <SidebarMenuButton onClick={handleBackClick}>
              <ArrowLeftIcon />
              <span>{tr("返回", "Back")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : (
          <>
            <SidebarUtilityItem
              icon={<SettingsIcon />}
              label={tr("设置", "Settings")}
              onClick={() => openUtilityPage("settings")}
            />
            <SidebarUtilityItem
              icon={<GitPullRequestArrowIcon />}
              label={tr("拉取请求", "Pull Requests")}
              onClick={() => openUtilityPage("pull-requests")}
            />
            <SidebarUtilityItem
              icon={<ChartNoAxesColumnIcon />}
              label={tr("用量统计", "Usage")}
              onClick={() => openUtilityPage("usage")}
            />
          </>
        )}

        <SidebarMenuItem className="ml-auto shrink-0">
          <Tooltip>
            <TooltipTrigger
              render={
                <SidebarMenuButton
                  size="icon"
                  aria-label={statusText}
                  onClick={() => openUtilityPage("settings")}
                  className="relative size-8 justify-center overflow-visible rounded-full bg-sidebar-control-surface p-0 text-sidebar-foreground hover:bg-sidebar-row-hover active:bg-sidebar-row-hover"
                >
                  <span className="relative grid size-4 place-items-center">
                    <RotateCwIcon className="size-4" />
                    <span
                      className={cn(
                        "absolute -right-1 -bottom-1 grid size-2.5 place-items-center rounded-full ring-2 ring-background",
                        connection === "offline"
                          ? "bg-destructive text-white"
                          : "bg-foreground text-background",
                      )}
                    >
                      <CheckIcon className="size-2" strokeWidth={3} />
                    </span>
                  </span>
                </SidebarMenuButton>
              }
            />
            <TooltipPopup side="top">{statusText}</TooltipPopup>
          </Tooltip>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
});

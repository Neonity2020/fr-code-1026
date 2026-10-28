import {
  CheckCircle2Icon,
  ChevronDownIcon,
  GlobeIcon,
  InfoIcon,
  LayersIcon,
  LockOpenIcon,
  RotateCcwIcon,
  ServerIcon,
  Trash2Icon,
  Undo2Icon,
  XCircleIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { transport, useAppStore, type AppLocale } from "@pi-web/client-runtime";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { getSettingsSectionLabel, LOCALE_OPTIONS, useI18n } from "~/i18n";
import { ThemeSettings } from "./ThemeSettings";
import { cn, isMacPlatform } from "~/lib/utils";
import { projectBasename } from "../../projectIdentity";
import { PiModelPicker, PiThinkingPicker } from "../chat/PiModelPicker";
import { Button } from "../ui/button";
import { Kbd } from "../ui/kbd";
import { useSidebarVisibility } from "../ui/sidebar";
import { Switch } from "../ui/switch";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

interface PiSettingsState {
  defaultModel: string;
  defaultEffort: string;
  defaultPermissions: "full-access" | "supervised";
  defaultWorkspace: "current-checkout" | "new-worktree";
  defaultSubmodules: "recursive" | "shallow" | "none";
  projectGrouping: boolean;
  projectOrder: "last-user-message" | "last-activity" | "alphabetical" | "manual";
  autoResumeLimited: boolean;
  snoozeLimited: boolean;
  workingSectionBeta: boolean;
  compactIdleThreads: "when-you-return" | "immediately" | "never";
  autoSettleMerged: boolean;
  autoSettleInactive: boolean;
  daysBeforeAutoSettle: number;
  theme: "system" | "dark" | "light";
  fontScale: "default" | "compact" | "comfortable";
  snapshotFormat: "png-2x" | "png-1x" | "svg";
  includeWindowChrome: boolean;
  gitAutoFetch: boolean;
  gitBranchPrefix: string;
}

const DEFAULT_PI_SETTINGS: PiSettingsState = {
  defaultModel: "Claude Opus 4.6",
  defaultEffort: "Max",
  defaultPermissions: "full-access",
  defaultWorkspace: "current-checkout",
  defaultSubmodules: "recursive",
  projectGrouping: true,
  projectOrder: "last-user-message",
  autoResumeLimited: false,
  snoozeLimited: false,
  workingSectionBeta: false,
  compactIdleThreads: "when-you-return",
  autoSettleMerged: true,
  autoSettleInactive: true,
  daysBeforeAutoSettle: 3,
  theme: "dark",
  fontScale: "default",
  snapshotFormat: "png-2x",
  includeWindowChrome: true,
  gitAutoFetch: true,
  gitBranchPrefix: "pi/",
};

const PI_SETTINGS_STORAGE_KEY = "pi-web:settings:v1";

function PolicyTooltip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        delay={200}
        render={
          <Button size="icon-micro" variant="ghost-muted" aria-label="Policy details">
            <InfoIcon className="size-3.5" />
          </Button>
        }
      />
      <TooltipPopup side="top">{text}</TooltipPopup>
    </Tooltip>
  );
}

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex min-h-7 items-start justify-between gap-4 px-3 sm:px-4">
        <h2 className="flex min-h-7 items-center gap-2 text-base font-semibold text-foreground">
          {title}
        </h2>
      </div>
      <div className="relative overflow-visible rounded-xl border border-border/60 bg-card/40 text-foreground shadow-xs/5 [&>*+*]:border-t [&>*+*]:border-border/50">
        {children}
      </div>
    </section>
  );
}

function SettingsRow({
  id,
  title,
  tooltip,
  description,
  control,
}: {
  id?: string;
  title: string;
  tooltip?: string;
  description?: string;
  control?: ReactNode;
}) {
  return (
    <div id={id} className="group/settings-row @container/settings-row px-3 py-3 sm:px-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-h-5 items-center gap-1.5">
            <h3 className="text-sm font-medium text-foreground">{title}</h3>
            {tooltip ? <PolicyTooltip text={tooltip} /> : null}
          </div>
          {description ? (
            <p className="max-w-2xl text-balance text-xs leading-normal text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {control ? (
          <div className="flex shrink-0 items-center gap-2 sm:justify-end">{control}</div>
        ) : null}
      </div>
    </div>
  );
}

function SettingsSelect<T extends string>({
  value,
  options,
  onChange,
  prefixIcon,
  ariaLabel,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (next: T) => void;
  prefixIcon?: ReactNode;
  ariaLabel: string;
}) {
  return (
    <div className="relative inline-flex items-center">
      {prefixIcon ? (
        <span className="pointer-events-none absolute left-2.5 flex items-center text-muted-foreground">
          {prefixIcon}
        </span>
      ) : null}
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value as T)}
        className={cn(
          "h-8 appearance-none rounded-lg border border-input bg-background pr-7 text-xs font-normal text-foreground shadow-xs/5 transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden dark:bg-input/32",
          prefixIcon ? "pl-7" : "pl-2.5",
        )}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-2 size-3.5 text-muted-foreground opacity-70" />
    </div>
  );
}

function LanguageSwitchControl({
  locale,
  onChange,
}: {
  locale: AppLocale;
  onChange: (next: AppLocale) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-border/60 bg-background/60 p-0.5">
      {LOCALE_OPTIONS.map((item) => {
        const active = locale === item.value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <GlobeIcon className="size-3.5" />
            <span>{item.nativeLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

export function SettingsView() {
  const isSidebarVisible = useSidebarVisibility();
  const activeSettingsSection = useAppStore((state) => state.activeSettingsSection);
  const projects = useAppStore((state) => state.projects);
  const threads = useAppStore((state) => state.threads);
  const piStatus = useAppStore((state) => state.piStatus);
  const selectedModel = useAppStore((state) => state.selectedModel);
  const selectedThinkingLevel = useAppStore((state) => state.selectedThinkingLevel);
  const setSelectedModel = useAppStore((state) => state.setSelectedModel);
  const defaultCwd = useAppStore((state) => state.defaultCwd);
  const patchThreadSummary = useAppStore((state) => state.patchThreadSummary);
  const { locale, setLocale, tr } = useI18n();

  const models = useMemo(() => piStatus?.models ?? [], [piStatus?.models]);
  const effectiveDefaultModel =
    selectedModel ?? piStatus?.defaultModel ?? models[0]?.slug ?? null;
  const activeDefaultModelInfo = useMemo(() => {
    if (!effectiveDefaultModel) return models[0] ?? null;
    return (
      models.find(
        (m) =>
          m.slug.toLowerCase() === effectiveDefaultModel.toLowerCase() ||
          m.id === effectiveDefaultModel,
      ) ??
      models[0] ??
      null
    );
  }, [effectiveDefaultModel, models]);

  const [settings, setSettings] = useLocalStorage<PiSettingsState>(
    PI_SETTINGS_STORAGE_KEY,
    DEFAULT_PI_SETTINGS,
  );
  const [scopeProject, setScopeProject] = useState<string>("all");
  const [scopeEnvironment, setScopeEnvironment] = useState<string>("all");

  const updateSetting = <K extends keyof PiSettingsState>(key: K, value: PiSettingsState[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const hasCustomSettings = useMemo(
    () =>
      (Object.keys(DEFAULT_PI_SETTINGS) as Array<keyof PiSettingsState>).some(
        (key) => settings[key] !== DEFAULT_PI_SETTINGS[key],
      ),
    [settings],
  );

  const sectionLabel = getSettingsSectionLabel(activeSettingsSection, locale);
  const isDeviceOnlySection =
    activeSettingsSection === "appearance" ||
    activeSettingsSection === "snap-shots" ||
    activeSettingsSection === "connections";

  const settledThreads = useMemo(
    () => threads.filter((thread) => thread.settledAt != null),
    [threads],
  );

  const isMac = isMacPlatform(navigator.platform);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* Topbar Breadcrumb + Restore Device Defaults */}
      <header
        className={cn(
          "flex h-[var(--workspace-topbar-height)] shrink-0 items-center gap-3 border-b ps-5 pe-4",
          !isSidebarVisible &&
            "pl-[calc(var(--workspace-controls-left)+var(--workspace-titlebar-control-size)+0.75rem)]",
        )}
      >
        <nav
          aria-label={tr("设置面包屑导航", "Settings breadcrumb")}
          className="flex min-w-0 items-center gap-2 text-xs"
        >
          <span className="text-muted-foreground">{tr("设置", "Settings")}</span>
          <span className="text-muted-foreground/50">/</span>
          <span className="truncate font-medium text-foreground">{sectionLabel}</span>
        </nav>

        <div className="ms-auto flex shrink-0 items-center gap-1">
          {activeSettingsSection === "general" ? (
            <Button
              size="xs"
              variant="ghost"
              disabled={!hasCustomSettings}
              onClick={() => setSettings(DEFAULT_PI_SETTINGS)}
            >
              <RotateCcwIcon className="mx-1 size-3.5" />
              <span className="max-sm:sr-only">
                {tr("恢复默认设置", "Restore device defaults")}
              </span>
            </Button>
          ) : null}
        </div>
      </header>

      {/* Scrollable Page Body */}
      <div className="topbar-scroll-fade scrollbar-gutter-both flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-8">
          {/* Scope Sentence */}
          {!isDeviceOnlySection ? (
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 px-3 text-sm text-muted-foreground sm:px-4">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0">{tr("当前设置应用于", "Applying settings for")}</span>
                <SettingsSelect
                  ariaLabel={tr("项目设置范围", "Project settings scope")}
                  value={scopeProject}
                  onChange={setScopeProject}
                  prefixIcon={<LayersIcon className="size-3.5" />}
                  options={[
                    { value: "all", label: tr("全部项目", "All projects") },
                    ...projects.map((cwd) => ({
                      value: cwd,
                      label: projectBasename(cwd),
                    })),
                  ]}
                />
              </span>
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0">{tr("作用于", "across")}</span>
                <SettingsSelect
                  ariaLabel={tr("环境设置范围", "Environment settings scope")}
                  value={scopeEnvironment}
                  onChange={setScopeEnvironment}
                  prefixIcon={<LayersIcon className="size-3.5" />}
                  options={[
                    { value: "all", label: tr("全部环境", "All environments") },
                    { value: "local", label: tr("本机环境", "Local machine") },
                  ]}
                />
              </span>
            </div>
          ) : null}

          {/* GENERAL */}
          {activeSettingsSection === "general" && (
            <>
              <SettingsSection title={tr("语言与区域", "Language & Region")}>
                <SettingsRow
                  id="setting-language"
                  title={tr("界面语言 (Language)", "Language")}
                  description={tr(
                    "选择 FR Code 界面的显示语言（支持简体中文与 English）。",
                    "Choose the display language for FR Code (Simplified Chinese or English).",
                  )}
                  control={<LanguageSwitchControl locale={locale} onChange={setLocale} />}
                />
              </SettingsSection>

              <SettingsSection title={tr("新建线程", "New threads")}>
                <SettingsRow
                  id="setting-model"
                  title={tr("模型", "Model")}
                  description={tr(
                    "新建线程时的默认模型，各个项目可单独覆盖。",
                    "Default model for new threads. Projects can override it.",
                  )}
                  control={
                    <div className="flex items-center gap-2">
                      <PiModelPicker
                        models={models}
                        selectedModelSlug={effectiveDefaultModel}
                        triggerVariant="settings"
                        onSelectModel={(slug, info) => {
                          const nextThinking =
                            info && info.thinkingLevels.length > 0
                              ? selectedThinkingLevel &&
                                info.thinkingLevels.includes(selectedThinkingLevel)
                                ? selectedThinkingLevel
                                : info.thinkingLevels.includes("medium")
                                  ? "medium"
                                  : (info.thinkingLevels[0] ?? null)
                              : "off";
                          setSelectedModel(slug, nextThinking);
                          updateSetting("defaultModel", slug);
                        }}
                      />
                      {activeDefaultModelInfo && activeDefaultModelInfo.thinkingLevels.length > 0 ? (
                        <PiThinkingPicker
                          levels={activeDefaultModelInfo.thinkingLevels}
                          selectedLevel={
                            selectedThinkingLevel ?? piStatus?.defaultThinkingLevel ?? null
                          }
                          triggerVariant="settings"
                          onSelectLevel={(level) => {
                            if (effectiveDefaultModel) {
                              setSelectedModel(effectiveDefaultModel, level);
                            }
                            updateSetting("defaultEffort", level);
                          }}
                        />
                      ) : null}
                    </div>
                  }
                />

                <SettingsRow
                  id="setting-permissions"
                  title={tr("权限模式", "Permissions")}
                  description={tr(
                    "新建线程时的默认执行权限，各个项目可单独覆盖。",
                    "Default permissions for new threads. Projects can override them.",
                  )}
                  control={
                    <SettingsSelect
                      ariaLabel={tr("默认权限模式", "Default permissions")}
                      value={settings.defaultPermissions}
                      onChange={(v) => updateSetting("defaultPermissions", v)}
                      prefixIcon={<LockOpenIcon className="size-3.5 text-amber-500" />}
                      options={[
                        { value: "full-access", label: tr("完全访问", "Full access") },
                        { value: "supervised", label: tr("需审批", "Supervised") },
                      ]}
                    />
                  }
                />

                <SettingsRow
                  id="setting-workspace"
                  title={tr("工作区目录", "Workspace")}
                  description={tr(
                    "新线程启动时的工作区位置。项目及其 fr.json 配置可覆盖此项。",
                    "Where new threads start. Projects and their fr.json can override it.",
                  )}
                  control={
                    <SettingsSelect
                      ariaLabel={tr("默认工作区", "Default workspace")}
                      value={settings.defaultWorkspace}
                      onChange={(v) => updateSetting("defaultWorkspace", v)}
                      options={[
                        { value: "current-checkout", label: tr("当前工作区", "Current checkout") },
                        { value: "new-worktree", label: tr("新建 Git Worktree", "New worktree") },
                      ]}
                    />
                  }
                />

                <SettingsRow
                  id="setting-submodules"
                  title={tr("Git 子模块", "Submodules")}
                  description={tr(
                    "新建 Worktree 时拉取 Git 子模块的方式。项目及其 fr.json 配置可覆盖此项。",
                    "How new worktrees populate git submodules. Projects and their fr.json can override it.",
                  )}
                  control={
                    <SettingsSelect
                      ariaLabel={tr("默认子模块策略", "Default submodules")}
                      value={settings.defaultSubmodules}
                      onChange={(v) => updateSetting("defaultSubmodules", v)}
                      options={[
                        { value: "recursive", label: tr("递归拉取 (Recursive)", "Recursive") },
                        { value: "shallow", label: tr("浅层拉取 (Shallow)", "Shallow") },
                        { value: "none", label: tr("不拉取 (None)", "None") },
                      ]}
                    />
                  }
                />
              </SettingsSection>

              <SettingsSection title={tr("侧边栏组织", "Organization")}>
                <SettingsRow
                  id="setting-project-grouping"
                  title={tr("按项目分组", "Project grouping")}
                  description={tr(
                    "在侧边栏中将线程归类到所属项目下方。",
                    "Group threads under their project in the sidebar.",
                  )}
                  control={
                    <Switch
                      checked={settings.projectGrouping}
                      onCheckedChange={(checked) =>
                        updateSetting("projectGrouping", Boolean(checked))
                      }
                      aria-label={tr("按项目分组", "Project grouping")}
                    />
                  }
                />

                <SettingsRow
                  id="setting-project-order"
                  title={tr("项目排序方式", "Project order")}
                  description={tr(
                    "侧边栏中项目的排列方式。开启分组后，手动排序支持拖拽调整顺序。",
                    "How projects are ordered in the sidebar. Manual order lets you drag projects when grouping is on.",
                  )}
                  control={
                    <SettingsSelect
                      ariaLabel={tr("项目排序方式", "Project order")}
                      value={settings.projectOrder}
                      onChange={(v) => updateSetting("projectOrder", v)}
                      options={[
                        {
                          value: "last-user-message",
                          label: tr("最近一条用户消息", "Last user message"),
                        },
                        { value: "last-activity", label: tr("最近活动时间", "Last activity") },
                        { value: "alphabetical", label: tr("按字母排序", "Alphabetical") },
                        { value: "manual", label: tr("手动排序", "Manual") },
                      ]}
                    />
                  }
                />

                <SettingsRow
                  id="setting-auto-resume"
                  title={tr("自动恢复限流线程", "Auto-resume limited threads")}
                  tooltip={tr(
                    "当模型服务返回配额重置时间戳时，在窗口重置后自动恢复当前轮次。",
                    "When a provider reports a rate-limit reset timestamp, automatically resume the turn once the window resets.",
                  )}
                  description={tr(
                    "当触发速率限制的线程度过重置窗口后自动继续运行。",
                    "Resume a rate-limited thread automatically when its reset window passes.",
                  )}
                  control={
                    <Switch
                      checked={settings.autoResumeLimited}
                      onCheckedChange={(checked) =>
                        updateSetting("autoResumeLimited", Boolean(checked))
                      }
                      aria-label={tr("自动恢复限流线程", "Auto-resume limited threads")}
                    />
                  }
                />

                <SettingsRow
                  id="setting-snooze-limited"
                  title={tr("自动延后限流线程", "Snooze limited threads")}
                  tooltip={tr(
                    "将触发速率限制的线程自动移入延后列表，直至配额恢复。",
                    "Automatically snooze threads that hit provider rate limits until their reset timestamp.",
                  )}
                  description={tr(
                    "将限流线程移至延后列表，直到配额重置时间到达。",
                    "Move rate-limited threads to the snoozed list until their reset time.",
                  )}
                  control={
                    <Switch
                      checked={settings.snoozeLimited}
                      onCheckedChange={(checked) =>
                        updateSetting("snoozeLimited", Boolean(checked))
                      }
                      aria-label={tr("自动延后限流线程", "Snooze limited threads")}
                    />
                  }
                />

                <SettingsRow
                  id="setting-working-section"
                  title={tr("运行中专区 (Beta)", "Working section (beta)")}
                  description={tr(
                    "将正在运行及未查看的已完成线程固定在侧边栏顶部的「运行中」专区。",
                    "Pin running and unvisited completed threads to a Working section at the top of the sidebar.",
                  )}
                  control={
                    <Switch
                      checked={settings.workingSectionBeta}
                      onCheckedChange={(checked) =>
                        updateSetting("workingSectionBeta", Boolean(checked))
                      }
                      aria-label={tr("运行中专区 (Beta)", "Working section (beta)")}
                    />
                  }
                />

                <SettingsRow
                  id="setting-compact-idle"
                  title={tr("折叠空闲线程", "Compact idle threads")}
                  description={tr(
                    "当侧边栏列表较长时，将空闲线程折叠收起至尾部区域。",
                    "Fold idle threads into a trailing section when your sidebar gets long.",
                  )}
                  control={
                    <SettingsSelect
                      ariaLabel={tr("折叠空闲线程", "Compact idle threads")}
                      value={settings.compactIdleThreads}
                      onChange={(v) => updateSetting("compactIdleThreads", v)}
                      options={[
                        { value: "when-you-return", label: tr("返回应用时", "When you return") },
                        { value: "immediately", label: tr("立即折叠", "Immediately") },
                        { value: "never", label: tr("从不折叠", "Never") },
                      ]}
                    />
                  }
                />

                <SettingsRow
                  id="setting-auto-settle-merged"
                  title={tr("PR 合并后自动结项", "Auto-settle merged threads")}
                  tooltip={tr(
                    "当线程关联的 Pull Request 合并后自动将该线程归档为已结项。",
                    "Automatically settle a thread when its linked pull request is merged.",
                  )}
                  description={tr(
                    "当关联的 Pull Request 合并时，自动将线程移入「已结项」。",
                    "Move a thread to Settled when its pull request merges.",
                  )}
                  control={
                    <Switch
                      checked={settings.autoSettleMerged}
                      onCheckedChange={(checked) =>
                        updateSetting("autoSettleMerged", Boolean(checked))
                      }
                      aria-label={tr("PR 合并后自动结项", "Auto-settle merged threads")}
                    />
                  }
                />

                <SettingsRow
                  id="setting-auto-settle-inactive"
                  title={tr("自动结项不活跃线程", "Auto-settle inactive threads")}
                  tooltip={tr(
                    "空闲线程在超过指定天数无活动后自动移入已结项。",
                    "Automatically settle idle threads after the configured number of days without activity.",
                  )}
                  description={tr(
                    "在一段时间无活动后自动将空闲线程移入「已结项」。",
                    "Move idle threads to Settled after a period without activity.",
                  )}
                  control={
                    <Switch
                      checked={settings.autoSettleInactive}
                      onCheckedChange={(checked) =>
                        updateSetting("autoSettleInactive", Boolean(checked))
                      }
                      aria-label={tr("自动结项不活跃线程", "Auto-settle inactive threads")}
                    />
                  }
                />

                <SettingsRow
                  id="setting-days-inactivity"
                  title={tr("自动结项前的空闲天数", "Days of inactivity before auto-settle")}
                  description={tr(
                    "超过该天数的空闲线程将自动移入「已结项」。",
                    "Idle threads older than this move to Settled automatically.",
                  )}
                  control={
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={settings.daysBeforeAutoSettle}
                      onChange={(event) => {
                        const parsed = Number.parseInt(event.currentTarget.value, 10);
                        if (Number.isFinite(parsed) && parsed >= 1) {
                          updateSetting("daysBeforeAutoSettle", parsed);
                        }
                      }}
                      className="h-8 w-20 rounded-lg border border-input bg-background px-2.5 text-xs text-foreground shadow-xs/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden dark:bg-input/32"
                    />
                  }
                />
              </SettingsSection>
            </>
          )}

          {/* APPEARANCE */}
          {activeSettingsSection === "appearance" && (
            <>
              <SettingsSection title={tr("界面与语言", "Interface & Language")}>
                <SettingsRow
                  id="setting-appearance-language"
                  title={tr("界面语言 (Language)", "Language")}
                  description={tr(
                    "切换 FR Code 的显示语言（简体中文 / English）。",
                    "Switch the display language of FR Code (简体中文 / English).",
                  )}
                  control={<LanguageSwitchControl locale={locale} onChange={setLocale} />}
                />
                <SettingsRow
                  id="setting-font-scale"
                  title={tr("字体缩放", "Font scale")}
                  description={tr(
                    "调整界面文字与代码块的显示字号比例。",
                    "Adjust interface and code block font sizing.",
                  )}
                  control={
                    <SettingsSelect
                      ariaLabel={tr("字体缩放", "Font scale")}
                      value={settings.fontScale}
                      onChange={(v) => updateSetting("fontScale", v)}
                      options={[
                        { value: "default", label: tr("默认 (100%)", "Default (100%)") },
                        { value: "compact", label: tr("紧凑 (92%)", "Compact (92%)") },
                        { value: "comfortable", label: tr("宽松 (108%)", "Comfortable (108%)") },
                      ]}
                    />
                  }
                />
              </SettingsSection>

              <SettingsSection title={tr("外观与主题调色板", "Appearance & Theme Palettes")}>
                <div className="p-3 sm:p-5">
                  <ThemeSettings />
                </div>
              </SettingsSection>
            </>
          )}

          {/* KEYBINDINGS */}
          {activeSettingsSection === "keybindings" && (
            <SettingsSection title={tr("键盘快捷键", "Keyboard Shortcuts")}>
              <SettingsRow
                id="setting-kb-sidebar"
                title={tr("切换主侧边栏", "Toggle main sidebar")}
                description={tr(
                  "显示或隐藏左侧线程导航侧边栏。",
                  "Show or hide the left thread navigation sidebar.",
                )}
                control={<Kbd>{isMac ? "⌘B" : "Ctrl+B"}</Kbd>}
              />
              <SettingsRow
                title={tr("撤销结项 / 延后", "Undo settle / snooze")}
                description={tr(
                  "撤销最近一次对线程的结项或延后操作。",
                  "Undo the most recent thread settle or snooze action.",
                )}
                control={<Kbd>{isMac ? "⌘Z" : "Ctrl+Z"}</Kbd>}
              />
              <SettingsRow
                title={tr("搜索设置", "Search settings")}
                description={tr(
                  "在设置页面快速聚焦左侧搜索输入框。",
                  "Focus the settings search input when in Settings.",
                )}
                control={<Kbd>/</Kbd>}
              />
              <SettingsRow
                title={tr("发送消息", "Send message")}
                description={tr(
                  "在输入框中提交当前编写的提示词。",
                  "Submit the current prompt in the composer.",
                )}
                control={<Kbd>Enter</Kbd>}
              />
            </SettingsSection>
          )}

          {/* SNAPSHOTS */}
          {activeSettingsSection === "snap-shots" && (
            <SettingsSection title={tr("快照导出", "SnapShots")}>
              <SettingsRow
                title={tr("导出分辨率", "Export resolution")}
                description={tr(
                  "导出对话或代码快照图片时的默认图像格式。",
                  "Default image format when capturing thread or code snapshots.",
                )}
                control={
                  <SettingsSelect
                    ariaLabel={tr("导出分辨率", "Export resolution")}
                    value={settings.snapshotFormat}
                    onChange={(v) => updateSetting("snapshotFormat", v)}
                    options={[
                      { value: "png-2x", label: tr("PNG (2x 视网膜高清)", "PNG (2x Retina)") },
                      { value: "png-1x", label: tr("PNG (1x 标准尺寸)", "PNG (1x Standard)") },
                      { value: "svg", label: tr("SVG 矢量图", "SVG Vector") },
                    ]}
                  />
                }
              />
              <SettingsRow
                title={tr("包含窗口外框", "Include window frame")}
                description={tr(
                  "在导出的快照周围渲染 Nightly 星空顶部边框。",
                  "Render the starry Nightly header frame around exported snapshots.",
                )}
                control={
                  <Switch
                    checked={settings.includeWindowChrome}
                    onCheckedChange={(checked) =>
                      updateSetting("includeWindowChrome", Boolean(checked))
                    }
                    aria-label={tr("包含窗口外框", "Include window frame")}
                  />
                }
              />
            </SettingsSection>
          )}

          {/* PROVIDERS */}
          {activeSettingsSection === "providers" && (
            <SettingsSection title={tr("Agent 提供方", "Coding Agent Provider")}>
              <SettingsRow
                id="setting-provider-pi"
                title="Pi Coding Agent CLI"
                description={tr(
                  "FR Code 专为 Pi Coding Agent 运行时 (@earendil-works/pi-coding-agent) 构建。",
                  "FR Code runs exclusively on the Pi Coding Agent harness (@earendil-works/pi-coding-agent).",
                )}
                control={
                  <div className="flex items-center gap-2 text-xs">
                    {piStatus?.installed ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-400">
                        <CheckCircle2Icon className="size-3.5" />
                        <span>
                          {tr(
                            `已安装 (${piStatus.version ?? "就绪"})`,
                            `Installed (${piStatus.version ?? "ready"})`,
                          )}
                        </span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 font-medium text-destructive">
                        <XCircleIcon className="size-3.5" />
                        <span>{tr("未检测到", "Not detected")}</span>
                      </span>
                    )}
                  </div>
                }
              />
              <SettingsRow
                title={tr("默认工作目录", "Default working directory")}
                description={tr(
                  "未指定项目筛选时创建新线程所使用的服务端默认目录。",
                  "Server fallback directory when creating a thread without an explicit project filter.",
                )}
                control={
                  <code className="rounded-md border bg-background/60 px-2 py-1 font-mono text-2xs text-foreground">
                    {defaultCwd ?? "—"}
                  </code>
                }
              />
            </SettingsSection>
          )}

          {/* INTEGRATIONS */}
          {activeSettingsSection === "integrations" && (
            <SettingsSection title={tr("外部工具集成", "Integrations")}>
              <SettingsRow
                title="GitHub CLI (gh)"
                description={tr(
                  "将 Pull Request 与分支状态直接关联至活跃线程。",
                  "Link pull requests and branch status directly to active threads.",
                )}
                control={
                  <span className="text-xs text-muted-foreground">
                    {tr("通过本地 Shell 自动检测", "Automatic via local shell")}
                  </span>
                }
              />
              <SettingsRow
                title={tr("外部编辑器", "External Editor")}
                description={tr(
                  "从线程顶栏快速在外部编辑器中打开项目目录与文件。",
                  "Open project directories and files from thread headers.",
                )}
                control={
                  <SettingsSelect
                    ariaLabel={tr("外部编辑器", "External editor")}
                    value="cursor"
                    onChange={() => {}}
                    options={[
                      { value: "cursor", label: "Cursor" },
                      { value: "vscode", label: "VS Code" },
                      { value: "zed", label: "Zed" },
                    ]}
                  />
                }
              />
            </SettingsSection>
          )}

          {/* SCHEDULED TASKS */}
          {activeSettingsSection === "scheduled-tasks" && (
            <SettingsSection title={tr("定时任务", "Scheduled Tasks")}>
              <SettingsRow
                title={tr("暂无已配置的定时任务", "No scheduled tasks configured")}
                description={tr(
                  "定时任务可按 Cron 计划在指定项目中自动运行 Pi 对话轮次。",
                  "Scheduled tasks run Pi turns on a recurring cron schedule against your projects.",
                )}
              />
            </SettingsSection>
          )}

          {/* SOURCE CONTROL */}
          {activeSettingsSection === "source-control" && (
            <SettingsSection title={tr("版本控制", "Source Control")}>
              <SettingsRow
                title={tr("自动拉取远程分支", "Auto-fetch remote branches")}
                description={tr(
                  "在后台定期对活跃项目执行 git fetch。",
                  "Periodically fetch git remotes for active projects in the background.",
                )}
                control={
                  <Switch
                    checked={settings.gitAutoFetch}
                    onCheckedChange={(checked) => updateSetting("gitAutoFetch", Boolean(checked))}
                    aria-label={tr("自动拉取远程分支", "Auto-fetch remote branches")}
                  />
                }
              />
              <SettingsRow
                title={tr("分支名前缀", "Branch prefix")}
                description={tr(
                  "为 Worktree 线程创建新分支时使用的命名前缀。",
                  "Prefix used when creating new branches for worktree threads.",
                )}
                control={
                  <input
                    type="text"
                    value={settings.gitBranchPrefix}
                    onChange={(event) => updateSetting("gitBranchPrefix", event.currentTarget.value)}
                    className="h-8 w-28 rounded-lg border border-input bg-background px-2.5 font-mono text-xs text-foreground shadow-xs/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden dark:bg-input/32"
                  />
                }
              />
            </SettingsSection>
          )}

          {/* STORAGE */}
          {activeSettingsSection === "storage" && (
            <SettingsSection title={tr("本地存储", "Storage")}>
              <SettingsRow
                title={tr("已关联项目数", "Tracked projects")}
                description={tr(
                  "当前在本地 FR Code 服务端注册的项目工作区数量。",
                  "Projects registered in the local FR Code server store.",
                )}
                control={<span className="font-mono text-xs">{projects.length}</span>}
              />
              <SettingsRow
                title={tr("线程总数", "Total threads")}
                description={tr(
                  "本地磁盘持久化的活跃、延后与已结项线程总数。",
                  "All active, snoozed, and settled threads persisted on disk.",
                )}
                control={<span className="font-mono text-xs">{threads.length}</span>}
              />
            </SettingsSection>
          )}

          {/* CONNECTIONS */}
          {activeSettingsSection === "connections" && (
            <SettingsSection title={tr("连接状态", "Connections")}>
              <SettingsRow
                title={tr("本地 FR Code WebSocket 服务", "Local FR Code WebSocket server")}
                description={tr(
                  "通过当前源的 `/ws` 端点直连本地 WebSocket 服务。",
                  "Direct WebSocket connection to `/ws` on the current origin.",
                )}
                control={
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                    <ServerIcon className="size-3.5" />
                    <span>{tr("已连接", "Connected")}</span>
                  </span>
                }
              />
            </SettingsSection>
          )}

          {/* ARCHIVE */}
          {activeSettingsSection === "archived" && (
            <SettingsSection
              title={tr(
                `已结项线程 (${settledThreads.length})`,
                `Settled Threads (${settledThreads.length})`,
              )}
            >
              {settledThreads.length === 0 ? (
                <SettingsRow
                  id="setting-archived-list"
                  title={tr("暂无已结项线程", "No settled threads")}
                  description={tr(
                    "在侧边栏中标记为结项的线程会显示在这里。",
                    "Threads you settle from the sidebar will appear here.",
                  )}
                />
              ) : (
                settledThreads.map((thread) => (
                  <SettingsRow
                    key={thread.id}
                    id="setting-archived-list"
                    title={thread.title}
                    description={`${projectBasename(thread.cwd)} · ${thread.cwd}`}
                    control={
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => {
                            patchThreadSummary(thread.id, { settledAt: null });
                            transport.dispatch({
                              type: "thread.settle",
                              threadId: thread.id,
                              settled: false,
                            });
                          }}
                        >
                          <Undo2Icon className="size-3.5" />
                          <span>{tr("恢复", "Un-settle")}</span>
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() =>
                            transport.dispatch({ type: "thread.delete", threadId: thread.id })
                          }
                        >
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      </div>
                    }
                  />
                ))
              )}
            </SettingsSection>
          )}
        </div>
      </div>
    </div>
  );
}

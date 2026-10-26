import {
  CheckCircle2Icon,
  ChevronDownIcon,
  InfoIcon,
  LayersIcon,
  LockOpenIcon,
  MonitorIcon,
  MoonIcon,
  RotateCcwIcon,
  ServerIcon,
  SparklesIcon,
  SunIcon,
  Trash2Icon,
  Undo2Icon,
  XCircleIcon,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { transport, useAppStore } from "@pi-web/client-runtime";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { cn, isMacPlatform } from "~/lib/utils";
import { projectBasename } from "../../projectIdentity";
import { SETTINGS_SECTION_LABEL_BY_ID } from "../sidebar/SettingsSidebarNav";
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

export function SettingsView() {
  const isSidebarVisible = useSidebarVisibility();
  const activeSettingsSection = useAppStore((state) => state.activeSettingsSection);
  const projects = useAppStore((state) => state.projects);
  const threads = useAppStore((state) => state.threads);
  const piStatus = useAppStore((state) => state.piStatus);
  const defaultCwd = useAppStore((state) => state.defaultCwd);
  const patchThreadSummary = useAppStore((state) => state.patchThreadSummary);

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

  const sectionLabel = SETTINGS_SECTION_LABEL_BY_ID[activeSettingsSection] ?? "General";
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
        <nav aria-label="Settings breadcrumb" className="flex min-w-0 items-center gap-2 text-xs">
          <span className="text-muted-foreground">Settings</span>
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
              <span className="max-sm:sr-only">Restore device defaults</span>
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
                <span className="shrink-0">Applying settings for</span>
                <SettingsSelect
                  ariaLabel="Project settings scope"
                  value={scopeProject}
                  onChange={setScopeProject}
                  prefixIcon={<LayersIcon className="size-3.5" />}
                  options={[
                    { value: "all", label: "All projects" },
                    ...projects.map((cwd) => ({
                      value: cwd,
                      label: projectBasename(cwd),
                    })),
                  ]}
                />
              </span>
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0">across</span>
                <SettingsSelect
                  ariaLabel="Environment settings scope"
                  value={scopeEnvironment}
                  onChange={setScopeEnvironment}
                  prefixIcon={<LayersIcon className="size-3.5" />}
                  options={[
                    { value: "all", label: "All environments" },
                    { value: "local", label: "Local machine" },
                  ]}
                />
              </span>
            </div>
          ) : null}

          {/* GENERAL */}
          {activeSettingsSection === "general" && (
            <>
              <SettingsSection title="New threads">
                <SettingsRow
                  id="setting-model"
                  title="Model"
                  description="Default model for new threads. Projects can override it."
                  control={
                    <div className="flex items-center gap-2">
                      <SettingsSelect
                        ariaLabel="Default model"
                        value={settings.defaultModel}
                        onChange={(v) => updateSetting("defaultModel", v)}
                        prefixIcon={<SparklesIcon className="size-3.5 text-amber-500" />}
                        options={[
                          { value: "Claude Opus 4.6", label: "Claude Opus 4.6" },
                          { value: "Claude Sonnet 4.6", label: "Claude Sonnet 4.6" },
                          { value: "GPT-5.4", label: "GPT-5.4" },
                          { value: "Gemini 2.5 Pro", label: "Gemini 2.5 Pro" },
                        ]}
                      />
                      <SettingsSelect
                        ariaLabel="Default reasoning effort"
                        value={settings.defaultEffort}
                        onChange={(v) => updateSetting("defaultEffort", v)}
                        options={[
                          { value: "Max", label: "Max" },
                          { value: "High", label: "High" },
                          { value: "Medium", label: "Medium" },
                          { value: "Fast", label: "Fast" },
                        ]}
                      />
                    </div>
                  }
                />

                <SettingsRow
                  id="setting-permissions"
                  title="Permissions"
                  description="Default permissions for new threads. Projects can override them."
                  control={
                    <SettingsSelect
                      ariaLabel="Default permissions"
                      value={settings.defaultPermissions}
                      onChange={(v) => updateSetting("defaultPermissions", v)}
                      prefixIcon={<LockOpenIcon className="size-3.5 text-amber-500" />}
                      options={[
                        { value: "full-access", label: "Full access" },
                        { value: "supervised", label: "Supervised" },
                      ]}
                    />
                  }
                />

                <SettingsRow
                  id="setting-workspace"
                  title="Workspace"
                  description="Where new threads start. Projects and their t3.json can override it."
                  control={
                    <SettingsSelect
                      ariaLabel="Default workspace"
                      value={settings.defaultWorkspace}
                      onChange={(v) => updateSetting("defaultWorkspace", v)}
                      options={[
                        { value: "current-checkout", label: "Current checkout" },
                        { value: "new-worktree", label: "New worktree" },
                      ]}
                    />
                  }
                />

                <SettingsRow
                  id="setting-submodules"
                  title="Submodules"
                  description="How new worktrees populate git submodules. Projects and their t3.json can override it."
                  control={
                    <SettingsSelect
                      ariaLabel="Default submodules"
                      value={settings.defaultSubmodules}
                      onChange={(v) => updateSetting("defaultSubmodules", v)}
                      options={[
                        { value: "recursive", label: "Recursive" },
                        { value: "shallow", label: "Shallow" },
                        { value: "none", label: "None" },
                      ]}
                    />
                  }
                />
              </SettingsSection>

              <SettingsSection title="Organization">
                <SettingsRow
                  id="setting-project-grouping"
                  title="Project grouping"
                  description="Group threads under their project in the sidebar."
                  control={
                    <Switch
                      checked={settings.projectGrouping}
                      onCheckedChange={(checked) =>
                        updateSetting("projectGrouping", Boolean(checked))
                      }
                      aria-label="Project grouping"
                    />
                  }
                />

                <SettingsRow
                  id="setting-project-order"
                  title="Project order"
                  description="How projects are ordered in the sidebar. Manual order lets you drag projects when grouping is on."
                  control={
                    <SettingsSelect
                      ariaLabel="Project order"
                      value={settings.projectOrder}
                      onChange={(v) => updateSetting("projectOrder", v)}
                      options={[
                        { value: "last-user-message", label: "Last user message" },
                        { value: "last-activity", label: "Last activity" },
                        { value: "alphabetical", label: "Alphabetical" },
                        { value: "manual", label: "Manual" },
                      ]}
                    />
                  }
                />

                <SettingsRow
                  id="setting-auto-resume"
                  title="Auto-resume limited threads"
                  tooltip="When a provider reports a rate-limit reset timestamp, automatically resume the turn once the window resets."
                  description="Resume a rate-limited thread automatically when its reset window passes."
                  control={
                    <Switch
                      checked={settings.autoResumeLimited}
                      onCheckedChange={(checked) =>
                        updateSetting("autoResumeLimited", Boolean(checked))
                      }
                      aria-label="Auto-resume limited threads"
                    />
                  }
                />

                <SettingsRow
                  id="setting-snooze-limited"
                  title="Snooze limited threads"
                  tooltip="Automatically snooze threads that hit provider rate limits until their reset timestamp."
                  description="Move rate-limited threads to the snoozed list until their reset time."
                  control={
                    <Switch
                      checked={settings.snoozeLimited}
                      onCheckedChange={(checked) =>
                        updateSetting("snoozeLimited", Boolean(checked))
                      }
                      aria-label="Snooze limited threads"
                    />
                  }
                />

                <SettingsRow
                  id="setting-working-section"
                  title="Working section (beta)"
                  description="Pin running and unvisited completed threads to a Working section at the top of the sidebar."
                  control={
                    <Switch
                      checked={settings.workingSectionBeta}
                      onCheckedChange={(checked) =>
                        updateSetting("workingSectionBeta", Boolean(checked))
                      }
                      aria-label="Working section (beta)"
                    />
                  }
                />

                <SettingsRow
                  id="setting-compact-idle"
                  title="Compact idle threads"
                  description="Fold idle threads into a trailing section when your sidebar gets long."
                  control={
                    <SettingsSelect
                      ariaLabel="Compact idle threads"
                      value={settings.compactIdleThreads}
                      onChange={(v) => updateSetting("compactIdleThreads", v)}
                      options={[
                        { value: "when-you-return", label: "When you return" },
                        { value: "immediately", label: "Immediately" },
                        { value: "never", label: "Never" },
                      ]}
                    />
                  }
                />

                <SettingsRow
                  id="setting-auto-settle-merged"
                  title="Auto-settle merged threads"
                  tooltip="Automatically settle a thread when its linked pull request is merged."
                  description="Move a thread to Settled when its pull request merges."
                  control={
                    <Switch
                      checked={settings.autoSettleMerged}
                      onCheckedChange={(checked) =>
                        updateSetting("autoSettleMerged", Boolean(checked))
                      }
                      aria-label="Auto-settle merged threads"
                    />
                  }
                />

                <SettingsRow
                  id="setting-auto-settle-inactive"
                  title="Auto-settle inactive threads"
                  tooltip="Automatically settle idle threads after the configured number of days without activity."
                  description="Move idle threads to Settled after a period without activity."
                  control={
                    <Switch
                      checked={settings.autoSettleInactive}
                      onCheckedChange={(checked) =>
                        updateSetting("autoSettleInactive", Boolean(checked))
                      }
                      aria-label="Auto-settle inactive threads"
                    />
                  }
                />

                <SettingsRow
                  id="setting-days-inactivity"
                  title="Days of inactivity before auto-settle"
                  description="Idle threads older than this move to Settled automatically."
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
            <SettingsSection title="Appearance">
              <SettingsRow
                id="setting-theme"
                title="Theme"
                description="Choose how T3 Code looks on this device."
                control={
                  <div className="inline-flex items-center rounded-lg border border-border/60 bg-background/60 p-0.5">
                    {(
                      [
                        { id: "light", label: "Light", icon: SunIcon },
                        { id: "dark", label: "Dark", icon: MoonIcon },
                        { id: "system", label: "System", icon: MonitorIcon },
                      ] as const
                    ).map((item) => {
                      const Icon = item.icon;
                      const active = settings.theme === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => updateSetting("theme", item.id)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                            active
                              ? "bg-accent text-accent-foreground shadow-2xs"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <Icon className="size-3.5" />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                }
              />
              <SettingsRow
                id="setting-font-scale"
                title="Font scale"
                description="Adjust interface and code block font sizing."
                control={
                  <SettingsSelect
                    ariaLabel="Font scale"
                    value={settings.fontScale}
                    onChange={(v) => updateSetting("fontScale", v)}
                    options={[
                      { value: "default", label: "Default (100%)" },
                      { value: "compact", label: "Compact (92%)" },
                      { value: "comfortable", label: "Comfortable (108%)" },
                    ]}
                  />
                }
              />
            </SettingsSection>
          )}

          {/* KEYBINDINGS */}
          {activeSettingsSection === "keybindings" && (
            <SettingsSection title="Keyboard Shortcuts">
              <SettingsRow
                id="setting-kb-sidebar"
                title="Toggle main sidebar"
                description="Show or hide the left thread navigation sidebar."
                control={<Kbd>{isMac ? "⌘B" : "Ctrl+B"}</Kbd>}
              />
              <SettingsRow
                title="Undo settle / snooze"
                description="Undo the most recent thread settle or snooze action."
                control={<Kbd>{isMac ? "⌘Z" : "Ctrl+Z"}</Kbd>}
              />
              <SettingsRow
                title="Search settings"
                description="Focus the settings search input when in Settings."
                control={<Kbd>/</Kbd>}
              />
              <SettingsRow
                title="Send message"
                description="Submit the current prompt in the composer."
                control={<Kbd>Enter</Kbd>}
              />
            </SettingsSection>
          )}

          {/* SNAPSHOTS */}
          {activeSettingsSection === "snap-shots" && (
            <SettingsSection title="SnapShots">
              <SettingsRow
                title="Export resolution"
                description="Default image format when capturing thread or code snapshots."
                control={
                  <SettingsSelect
                    ariaLabel="Export resolution"
                    value={settings.snapshotFormat}
                    onChange={(v) => updateSetting("snapshotFormat", v)}
                    options={[
                      { value: "png-2x", label: "PNG (2x Retina)" },
                      { value: "png-1x", label: "PNG (1x Standard)" },
                      { value: "svg", label: "SVG Vector" },
                    ]}
                  />
                }
              />
              <SettingsRow
                title="Include window frame"
                description="Render the starry Nightly header frame around exported snapshots."
                control={
                  <Switch
                    checked={settings.includeWindowChrome}
                    onCheckedChange={(checked) =>
                      updateSetting("includeWindowChrome", Boolean(checked))
                    }
                    aria-label="Include window frame"
                  />
                }
              />
            </SettingsSection>
          )}

          {/* PROVIDERS */}
          {activeSettingsSection === "providers" && (
            <SettingsSection title="Coding Agent Provider">
              <SettingsRow
                id="setting-provider-pi"
                title="Pi Coding Agent CLI"
                description="pi-web runs exclusively on the Pi Coding Agent harness (@earendil-works/pi-coding-agent)."
                control={
                  <div className="flex items-center gap-2 text-xs">
                    {piStatus?.installed ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-400">
                        <CheckCircle2Icon className="size-3.5" />
                        <span>Installed ({piStatus.version ?? "ready"})</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 font-medium text-destructive">
                        <XCircleIcon className="size-3.5" />
                        <span>Not detected</span>
                      </span>
                    )}
                  </div>
                }
              />
              <SettingsRow
                title="Default working directory"
                description="Server fallback directory when creating a thread without an explicit project filter."
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
            <SettingsSection title="Integrations">
              <SettingsRow
                title="GitHub CLI (gh)"
                description="Link pull requests and branch status directly to active threads."
                control={
                  <span className="text-xs text-muted-foreground">Automatic via local shell</span>
                }
              />
              <SettingsRow
                title="External Editor"
                description="Open project directories and files from thread headers."
                control={
                  <SettingsSelect
                    ariaLabel="External editor"
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
            <SettingsSection title="Scheduled Tasks">
              <SettingsRow
                title="No scheduled tasks configured"
                description="Scheduled tasks run Pi turns on a recurring cron schedule against your projects."
              />
            </SettingsSection>
          )}

          {/* SOURCE CONTROL */}
          {activeSettingsSection === "source-control" && (
            <SettingsSection title="Source Control">
              <SettingsRow
                title="Auto-fetch remote branches"
                description="Periodically fetch git remotes for active projects in the background."
                control={
                  <Switch
                    checked={settings.gitAutoFetch}
                    onCheckedChange={(checked) => updateSetting("gitAutoFetch", Boolean(checked))}
                    aria-label="Auto-fetch remote branches"
                  />
                }
              />
              <SettingsRow
                title="Branch prefix"
                description="Prefix used when creating new branches for worktree threads."
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
            <SettingsSection title="Storage">
              <SettingsRow
                title="Tracked projects"
                description="Projects registered in the local pi-web server store."
                control={<span className="font-mono text-xs">{projects.length}</span>}
              />
              <SettingsRow
                title="Total threads"
                description="All active, snoozed, and settled threads persisted on disk."
                control={<span className="font-mono text-xs">{threads.length}</span>}
              />
            </SettingsSection>
          )}

          {/* CONNECTIONS */}
          {activeSettingsSection === "connections" && (
            <SettingsSection title="Connections">
              <SettingsRow
                title="Local pi-web WebSocket server"
                description="Direct WebSocket connection to `/ws` on the current origin."
                control={
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                    <ServerIcon className="size-3.5" />
                    <span>Connected</span>
                  </span>
                }
              />
            </SettingsSection>
          )}

          {/* ARCHIVE */}
          {activeSettingsSection === "archived" && (
            <SettingsSection title={`Settled Threads (${settledThreads.length})`}>
              {settledThreads.length === 0 ? (
                <SettingsRow
                  id="setting-archived-list"
                  title="No settled threads"
                  description="Threads you settle from the sidebar will appear here."
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
                          <span>Un-settle</span>
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

import {
  CheckIcon,
  DownloadIcon,
  MonitorIcon,
  MoonIcon,
  PaintbrushIcon,
  RotateCcwIcon,
  SunIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { useId, useRef, useState } from "react";
import { useCustomThemes } from "../../hooks/useCustomThemes";
import { useTheme } from "../../hooks/useTheme";
import { useI18n } from "../../i18n";
import { cn } from "../../lib/utils";
import {
  BUILT_IN_THEMES,
  EMBER_THEME,
  getThemeDefinition,
  GROVE_THEME,
  installCustomTheme,
  IRIS_THEME,
  OCEAN_THEME,
  parseThemeFile,
  removeCustomTheme,
  serializeThemeFile,
  T3_CHAT_THEME,
  type ThemeAppearance,
  type ThemeDefinition,
} from "../../theme/themePalette";
import { Button } from "../ui/button";
import {
  getThemeCardDefinition,
  ThemePreviewCircles,
  type ThemeCardDefinition,
  type ThemeMode,
} from "./ThemePreviewCircles";

const BUILT_IN_THEME_DEFINITIONS: ReadonlyArray<ThemeDefinition> = [
  T3_CHAT_THEME,
  GROVE_THEME,
  OCEAN_THEME,
  EMBER_THEME,
  IRIS_THEME,
];

const THEME_DESCRIPTIONS: Record<string, { zh: string; en: string }> = {
  "t3-chat": {
    zh: "官方默认主题，清晰平衡的灰阶与深邃对比色。",
    en: "Official default theme with balanced grays and deep contrast.",
  },
  grove: {
    zh: "林深苍翠，以沉稳自然的翡翠绿为主要基调。",
    en: "Lush forest greenery with calming emerald and earth tones.",
  },
  ocean: {
    zh: "深海静谧，以低饱和深蓝与海潮蓝调为基底。",
    en: "Deep ocean tranquility with subdued marine blues.",
  },
  ember: {
    zh: "余烬暮霞，暖日落橙与炭火余温相衬的暖色调。",
    en: "Warm embers and sunset copper tones for a cozy atmosphere.",
  },
  iris: {
    zh: "鸢尾紫光，高贵柔和的紫罗兰与冷青色点缀。",
    en: "Soft violet and subtle indigo accents for an elegant touch.",
  },
};

export function ThemeSettings() {
  const { tr, locale } = useI18n();
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const {
    theme,
    resolvedTheme,
    appearanceMode,
    themeHalves,
    setTheme,
    setAppearanceMode,
    setThemeHalf,
    clearThemeHalves,
  } = useTheme();

  const customThemes = useCustomThemes();

  // Determine active modes for a given theme
  const getActiveModesFor = (themeId: string): ThemeMode[] => {
    const modes: ThemeMode[] = [];
    if (themeHalves) {
      if (themeHalves.light === themeId) modes.push("light");
      if (themeHalves.dark === themeId) modes.push("dark");
      return modes;
    }
    if (theme === themeId) {
      modes.push("light", "dark");
    }
    return modes;
  };

  const handleSelectMode = (themeId: string, mode: ThemeMode) => {
    if (mode === "light" || mode === "dark") {
      setThemeHalf(mode, themeId);
    } else {
      setTheme(themeId);
    }
  };

  const handleApplyTheme = (themeId: string) => {
    setTheme(themeId);
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const parsed = JSON.parse(text);
        const themeDef = parseThemeFile(parsed);
        installCustomTheme(themeDef);
        setTheme(themeDef.id);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (err: unknown) {
        setImportError(
          err instanceof Error
            ? err.message
            : tr("主题文件格式解析失败", "Failed to parse theme file"),
        );
      }
    };
    reader.readAsText(file);
  };

  const handleExportTheme = (themeDef: ThemeDefinition) => {
    try {
      const contents = serializeThemeFile(themeDef);
      const blob = new Blob([contents], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${themeDef.id}.theme.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      console.error("Export theme error:", err);
    }
  };

  const handleRemoveCustom = (themeId: string) => {
    removeCustomTheme(themeId);
    if (theme === themeId) {
      setTheme("t3-chat");
    }
  };

  const handleResetToDefaults = () => {
    clearThemeHalves();
    setTheme("t3-chat");
    setAppearanceMode("system");
  };

  return (
    <div className="flex flex-col gap-8">
      {/* 1. 外观模式 (Appearance Mode) */}
      <div className="flex flex-col gap-3">
        <div>
          <h4 className="text-sm font-medium text-foreground">
            {tr("明暗外观", "Appearance Mode")}
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {tr(
              "选择浅色、深色或随系统自动切换。支持为浅色与深色分别指定独立主题调色板。",
              "Choose light, dark, or follow system. You can also pair different theme palettes for light and dark modes.",
            )}
          </p>
        </div>

        <div className="inline-flex max-w-sm items-center rounded-lg border border-border/70 bg-card p-1 shadow-2xs">
          {(
            [
              { id: "light", label: tr("浅色", "Light"), icon: SunIcon },
              { id: "dark", label: tr("深色", "Dark"), icon: MoonIcon },
              { id: "system", label: tr("跟随系统", "System"), icon: MonitorIcon },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = appearanceMode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setAppearanceMode(item.id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                  active
                    ? "bg-accent text-accent-foreground shadow-2xs font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. 主题调色板选择 (Theme Palettes) */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-foreground">
              {tr("主题调色板", "Theme Palettes")}
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              {tr(
                "点击主题卡片一键全局应用；点击太阳 / 月亮图标可单独设定浅色或深色半套搭配。",
                "Click a card to apply globally. Click the Sun or Moon circle to assign it specifically to light or dark mode.",
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              id={fileInputId}
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="sr-only"
              onChange={handleImportFile}
            />
            <Button
              size="xs"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer"
            >
              <UploadIcon className="size-3.5" />
              <span>{tr("导入主题", "Import theme")}</span>
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={handleResetToDefaults}
              className="cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <RotateCcwIcon className="size-3.5" />
              <span>{tr("恢复默认", "Reset")}</span>
            </Button>
          </div>
        </div>

        {importError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {importError}
          </div>
        )}

        {/* 主题卡片网格 */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BUILT_IN_THEME_DEFINITIONS.map((def) => {
            const cardDef = getThemeCardDefinition(def);
            const activeModes = getActiveModesFor(def.id);
            const isFullActive = activeModes.includes("light") && activeModes.includes("dark");
            const isPartialActive = activeModes.length > 0 && !isFullActive;
            const desc = THEME_DESCRIPTIONS[def.id]?.[locale === "zh-CN" ? "zh" : "en"];

            return (
              <ThemeCardItem
                key={def.id}
                cardDef={cardDef}
                description={desc}
                activeModes={activeModes}
                isFullActive={isFullActive}
                isPartialActive={isPartialActive}
                onSelectTheme={() => handleApplyTheme(def.id)}
                onSelectMode={(mode) => handleSelectMode(def.id, mode)}
                onExport={() => handleExportTheme(def)}
              />
            );
          })}

          {/* 自定义主题 */}
          {customThemes.map((def) => {
            const cardDef = getThemeCardDefinition(def);
            const activeModes = getActiveModesFor(def.id);
            const isFullActive = activeModes.includes("light") && activeModes.includes("dark");
            const isPartialActive = activeModes.length > 0 && !isFullActive;

            return (
              <ThemeCardItem
                key={def.id}
                cardDef={cardDef}
                description={tr("用户自定义导入的主题", "Custom imported theme")}
                activeModes={activeModes}
                isFullActive={isFullActive}
                isPartialActive={isPartialActive}
                isCustom
                onSelectTheme={() => handleApplyTheme(def.id)}
                onSelectMode={(mode) => handleSelectMode(def.id, mode)}
                onExport={() => handleExportTheme(def)}
                onDelete={() => handleRemoveCustom(def.id)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ThemeCardItem({
  cardDef,
  description,
  activeModes,
  isFullActive,
  isPartialActive,
  isCustom,
  onSelectTheme,
  onSelectMode,
  onExport,
  onDelete,
}: {
  cardDef: ThemeCardDefinition;
  description?: string;
  activeModes: ThemeMode[];
  isFullActive: boolean;
  isPartialActive: boolean;
  isCustom?: boolean;
  onSelectTheme: () => void;
  onSelectMode: (mode: ThemeMode) => void;
  onExport?: () => void;
  onDelete?: () => void;
}) {
  const { tr } = useI18n();

  return (
    <div
      onClick={onSelectTheme}
      className={cn(
        "group relative flex flex-col justify-between rounded-xl border p-4 transition-all cursor-pointer bg-card hover:bg-card/90",
        isFullActive
          ? "border-primary shadow-xs ring-1 ring-primary/40"
          : isPartialActive
            ? "border-primary/50 shadow-2xs"
            : "border-border/60 hover:border-border",
      )}
    >
      <div>
        {/* 头部标题与激活状态 */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-sm text-foreground truncate">{cardDef.label}</span>
              {isFullActive ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-3xs font-medium text-primary">
                  <CheckIcon className="size-2.5" />
                  {tr("当前", "Active")}
                </span>
              ) : isPartialActive ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-3xs font-medium text-primary">
                  {activeModes.includes("light") ? tr("浅色生效", "Light only") : tr("深色生效", "Dark only")}
                </span>
              ) : null}
            </div>
            {description && (
              <p className="text-2xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                {description}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            {onExport && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onExport();
                }}
                title={tr("导出主题 JSON", "Export theme JSON")}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
              >
                <DownloadIcon className="size-3.5" />
              </button>
            )}
            {isCustom && onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                title={tr("删除自定义主题", "Delete custom theme")}
                className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
              >
                <Trash2Icon className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 预览圆球 */}
        <ThemePreviewCircles
          label={cardDef.label}
          activeModes={activeModes}
          onSelectMode={onSelectMode}
          previews={cardDef.previews}
        />
      </div>
    </div>
  );
}

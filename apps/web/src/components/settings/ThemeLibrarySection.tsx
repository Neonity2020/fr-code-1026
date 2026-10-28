import { useEffect, useState } from "react";
import { useI18n } from "~/i18n";
import { cn } from "~/lib/utils";
import {
  applyAppearanceMode,
  applyThemeHalf,
  applyThemePreference,
  BUILTIN_THEME_DEFINITIONS,
  readAppearanceMode,
  resolveActiveThemeForAppearance,
  subscribeAppearanceMode,
  type AppearanceMode,
} from "~/theme/appearancePreference";
import { getThemeDefinition, type ThemeAppearance } from "~/theme/themePalette";
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import {
  getThemeCardDefinition,
  previewColorsOf,
  STANDARD_THEME_CARDS,
  ThemePreviewCircles,
  type ThemeCardDefinition,
  type ThemeMode,
} from "./ThemePreviewCircles";
import { ThemeWireframe } from "./ThemeWireframe";

function ThemeLibraryCard({
  theme,
  isActive,
  onUse,
  onUseMode,
  activeModes,
}: {
  theme: ThemeCardDefinition;
  isActive: boolean;
  onUse: () => void;
  onUseMode: (mode: ThemeMode) => void;
  activeModes: ReadonlyArray<ThemeMode>;
}) {
  const { tr } = useI18n();
  const cardModes = theme.previews.map((preview) => preview.mode);
  const modeHint =
    cardModes.length === 1
      ? cardModes[0] === "light"
        ? tr("使用此浅色主题", "Use this light theme")
        : tr("使用此深色主题", "Use this dark theme")
      : tr("同时应用于浅色与深色模式", "Use for both light and dark modes");

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className={cn(
              "cursor-pointer overflow-hidden rounded-xl border border-border/70 bg-card/60 transition-colors hover:bg-accent/10",
              isActive && "bg-accent/30",
            )}
            data-theme-library-card={theme.id}
            onClick={onUse}
            style={isActive ? { boxShadow: "inset 0 0 0 1px var(--ring)" } : undefined}
          >
            <div className="relative">
              <ThemePreviewCircles
                label={theme.label}
                activeModes={activeModes}
                onSelectMode={onUseMode}
                previews={theme.previews}
              />
            </div>
            <div className="flex items-center gap-2 px-3 pt-2 pb-3">
              <div className="min-w-0 flex-1">
                <button
                  aria-label={tr(`使用 ${theme.label} 主题`, `Use ${theme.label} theme`)}
                  aria-pressed={isActive}
                  className="min-w-0 cursor-pointer truncate rounded-sm text-left text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onUse();
                  }}
                >
                  {theme.label}
                </button>
              </div>
            </div>
          </div>
        }
      />
      <TooltipPopup>{modeHint}</TooltipPopup>
    </Tooltip>
  );
}

export function ThemeLibrarySection({
  onAppearanceModeChange,
}: {
  onAppearanceModeChange?: (mode: AppearanceMode) => void;
}) {
  const { tr } = useI18n();
  const [, setTick] = useState(0);

  useEffect(() => subscribeAppearanceMode(() => setTick((n) => n + 1)), []);

  const appearanceMode = readAppearanceMode();
  const lightOwner = resolveActiveThemeForAppearance("light");
  const darkOwner = resolveActiveThemeForAppearance("dark");

  const cardDefById = (id: string): ThemeCardDefinition => {
    if (id === "default") return STANDARD_THEME_CARDS[0]!;
    const definition = getThemeDefinition(id);
    return definition ? getThemeCardDefinition(definition) : STANDARD_THEME_CARDS[0]!;
  };

  const pickColors = (id: string, appearance: ThemeAppearance) => {
    const card = cardDefById(id);
    return previewColorsOf(card, appearance) ?? card.previews[0]!.colors;
  };

  const wireframeColors = (appearance: ThemeAppearance) =>
    pickColors(appearance === "light" ? lightOwner : darkOwner, appearance);

  const renderWireframe = (mode: ThemeMode) => (
    <ThemeWireframe
      className="h-[8.75rem]"
      panes={
        mode === "system"
          ? [
              { clip: "left", colors: wireframeColors("light") },
              { clip: "right", colors: wireframeColors("dark") },
            ]
          : [{ colors: wireframeColors(mode === "dark" ? "dark" : "light") }]
      }
    />
  );

  const pickedModesFor = (cardId: string): ThemeMode[] => {
    const rings: ThemeMode[] = [];
    if (lightOwner === cardId) rings.push("light");
    if (darkOwner === cardId) rings.push("dark");
    return rings;
  };

  const handleModeClick = (mode: AppearanceMode) => {
    applyAppearanceMode(mode);
    onAppearanceModeChange?.(mode);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        <h3 className="px-3 text-sm font-normal text-foreground/70 sm:px-4">
          {tr("配色模式 (Color scheme)", "Color scheme")}
        </h3>
        <div
          aria-label={tr("外观模式", "Appearance mode")}
          className="grid w-full grid-cols-3 gap-3"
          role="group"
        >
          {(["system", "light", "dark"] as const).map((mode) => {
            const isActive = appearanceMode === mode;
            const modeLabel =
              mode === "system"
                ? tr("跟随系统", "System")
                : mode === "light"
                  ? tr("浅色", "Light")
                  : tr("深色", "Dark");
            return (
              <button
                aria-label={modeLabel}
                aria-pressed={isActive}
                className={cn(
                  "flex cursor-pointer flex-col items-stretch gap-1.5 rounded-xl border p-2 outline-none transition-colors focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring",
                  isActive
                    ? "border-transparent bg-accent/30"
                    : "border-border/70 bg-card/60 hover:bg-accent/10",
                )}
                key={mode}
                style={isActive ? { boxShadow: "inset 0 0 0 1px var(--ring)" } : undefined}
                onClick={() => handleModeClick(mode)}
                type="button"
              >
                {renderWireframe(mode)}
                <span
                  className={cn(
                    "flex items-center justify-center text-xs font-medium",
                    isActive ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {modeLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2.5 pt-2">
        <h3 className="px-3 text-sm font-normal text-foreground/70 sm:px-4">
          {tr("主题调色板 (Theme)", "Theme")}
        </h3>
        <TooltipProvider>
          <div
            className="grid w-full gap-2"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 14rem), 1fr))" }}
          >
            {STANDARD_THEME_CARDS.map((standardTheme) => {
              const activeModes = pickedModesFor("default");
              return (
                <ThemeLibraryCard
                  key={standardTheme.id}
                  theme={standardTheme}
                  activeModes={activeModes}
                  isActive={activeModes.length === 2}
                  onUse={() => applyThemePreference("default")}
                  onUseMode={(mode) => {
                    if (mode !== "system") applyThemeHalf(mode, "default");
                  }}
                />
              );
            })}
            {BUILTIN_THEME_DEFINITIONS.map((themeDef) => {
              const card = getThemeCardDefinition(themeDef);
              const activeModes = pickedModesFor(themeDef.id);
              return (
                <ThemeLibraryCard
                  key={themeDef.id}
                  theme={card}
                  activeModes={activeModes}
                  isActive={activeModes.length === 2}
                  onUse={() => applyThemePreference(themeDef.id)}
                  onUseMode={(mode) => {
                    if (mode !== "system") applyThemeHalf(mode, themeDef.id);
                  }}
                />
              );
            })}
          </div>
        </TooltipProvider>
      </div>
    </div>
  );
}

/**
 * PiModelPicker — 1:1 复刻 t3code ProviderModelPicker + ModelPickerContent，
 * 左侧栏仅保留 ★ Favorites 与 Pi 单一 Provider：
 * - 左侧竖向切换栏 (w-11 shrink-0 bg-muted/30):
 *   - 右侧蓝色激活指示条 (h-5 w-0.75 rounded-l-full bg-primary)
 *   - ★ Favorites 按钮 + 分割线 + [PiGlyph] Pi 按钮
 * - 右侧面板 (flex-1 flex flex-col bg-muted/40 border-l border-border/70):
 *   - 顶部 Search models... 搜索框（支持上下键、Enter、⌘1~⌘9 / Ctrl+1~9 快捷切换、左右键切 Tab）
 *   - 模型列表行：
 *     - 第 1 行：精简后的模型显示名（剥离重复 subProvider 前缀）
 *     - 第 2 行：[PiGlyph size-3] Pi · {subProvider}
 *     - 右侧：选中勾 (CheckIcon) + 快捷键徽章 (<Kbd>⌘1..⌘9</Kbd>) + 收藏星标 (StarIcon)
 */
import {
  BrainIcon,
  CheckIcon,
  ChevronDownIcon,
  SearchIcon,
  StarIcon,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PiModelInfo, PiThinkingLevel } from "@pi-web/protocol";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { getThinkingLevelLabel, useI18n } from "~/i18n";
import { cn, isMacPlatform } from "~/lib/utils";
import { Button } from "../ui/button";
import { Kbd } from "../ui/kbd";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const FAVORITE_MODELS_STORAGE_KEY = "pi-web:favorite-models";
const QUICK_SELECT_COUNT = 9;

type ActiveTab = "favorites" | "pi";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripLeadingQualifier(name: string, qualifier: string): string {
  const trimmedName = name.trim();
  const trimmedQualifier = qualifier.trim();
  if (!trimmedName || !trimmedQualifier) {
    return trimmedName;
  }
  const pattern = new RegExp(`^${escapeRegExp(trimmedQualifier)}(?:[\\s.:/-]+)`, "i");
  const stripped = trimmedName.replace(pattern, "").trim();
  return stripped.length > 0 ? stripped : trimmedName;
}

export function getDisplayModelName(model: Pick<PiModelInfo, "name" | "subProvider">): string {
  if (!model.subProvider) {
    return model.name;
  }
  return stripLeadingQualifier(model.name, model.subProvider);
}

export function getProviderRowLabel(subProvider?: string): string {
  return subProvider ? `Pi · ${subProvider}` : "Pi";
}

export function PiGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="165.29 165.29 469.43 469.43"
      aria-hidden="true"
      className={cn("size-3.5 shrink-0 fill-[#0F0F0F] dark:fill-[#F5F5F5]", className)}
    >
      <path
        d="M165.29 165.29H517.36V400H400V517.36H282.65V634.72H165.29ZM282.65 282.65V400H400V282.65Z"
        fillRule="evenodd"
      />
      <path d="M517.36 400H634.72V634.72H517.36Z" />
    </svg>
  );
}

export const THINKING_LEVEL_LABELS: Record<PiThinkingLevel, string> = {
  off: "Off",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
};

function quickSelectLabel(index: number, isMac: boolean): string | null {
  if (index < 0 || index >= QUICK_SELECT_COUNT) return null;
  const digit = index + 1;
  return isMac ? `⌘${digit}` : `Ctrl+${digit}`;
}

function quickSelectIndexFromEvent(
  event: React.KeyboardEvent,
  isMac: boolean,
): number | null {
  const modifierPressed = isMac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  if (!modifierPressed || event.altKey || event.shiftKey) {
    return null;
  }
  if (!/^[1-9]$/.test(event.key)) {
    return null;
  }
  return Number(event.key) - 1;
}

const ModelListRow = memo(function ModelListRow(props: {
  model: PiModelInfo;
  isSelected: boolean;
  isHighlighted: boolean;
  isFavorite: boolean;
  shortcut: string | null;
  onSelect: () => void;
  onHighlight: () => void;
  onToggleFavorite: () => void;
}) {
  const {
    model,
    isSelected,
    isHighlighted,
    isFavorite,
    shortcut,
    onSelect,
    onHighlight,
    onToggleFavorite,
  } = props;
  const displayName = getDisplayModelName(model);
  const providerLabel = getProviderRowLabel(model.subProvider);

  return (
    <div
      data-selected={isSelected || undefined}
      onMouseMove={onHighlight}
      className={cn(
        "group relative flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-xs transition-colors",
        isHighlighted ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
      )}
    >
      <Button
        variant="ghost"
        size="xs"
        onClick={onSelect}
        className="flex h-auto min-w-0 flex-1 items-center justify-start gap-2 p-0 text-left font-normal hover:bg-transparent"
      >
        <span className="flex min-w-0 flex-1 flex-col items-start">
          <span className="flex max-w-full min-w-0 items-center gap-1.5">
            <span className="truncate font-medium text-foreground">{displayName}</span>
          </span>
          <span className="flex max-w-full items-center gap-1 truncate text-2xs text-muted-foreground">
            <PiGlyph className="size-3 text-muted-foreground/80" />
            <span className="truncate">{providerLabel}</span>
          </span>
        </span>
      </Button>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {isSelected ? <CheckIcon className="size-3.5 text-foreground" /> : null}
        {shortcut ? <Kbd>{shortcut}</Kbd> : null}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={isFavorite ? `Unpin ${displayName}` : `Pin ${displayName}`}
                aria-pressed={isFavorite}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleFavorite();
                }}
                className={cn(
                  "size-6 rounded-sm hover:bg-accent-foreground/10",
                  isFavorite
                    ? "text-warning hover:text-warning"
                    : "text-muted-foreground/50 hover:text-foreground",
                )}
              >
                <StarIcon className={cn("size-3.5", isFavorite && "fill-current")} />
              </Button>
            }
          />
          <TooltipPopup side="top">
            {isFavorite ? "Remove from favorites" : "Add to favorites"}
          </TooltipPopup>
        </Tooltip>
      </div>
    </div>
  );
});

export const PiModelPicker = memo(function PiModelPicker(props: {
  models: ReadonlyArray<PiModelInfo>;
  selectedModelSlug: string | null;
  onSelectModel: (slug: string, modelInfo?: PiModelInfo) => void;
  disabled?: boolean;
  triggerVariant?: "composer" | "settings";
  className?: string;
}) {
  const { models, selectedModelSlug, onSelectModel, disabled = false, triggerVariant = "composer" } =
    props;
  const { tr } = useI18n();

  const [isOpen, setIsOpen] = useState(false);
  const [favoriteSlugs, setFavoriteSlugs] = useLocalStorage<string[]>(
    FAVORITE_MODELS_STORAGE_KEY,
    [],
  );
  const favoriteSet = useMemo(() => new Set(favoriteSlugs), [favoriteSlugs]);

  const [activeTab, setActiveTab] = useState<ActiveTab>("pi");
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const tabButtonRefs = useRef<Record<ActiveTab, HTMLButtonElement | null>>({
    favorites: null,
    pi: null,
  });
  const [indicatorTop, setIndicatorTop] = useState<number | null>(null);

  const isMac = useMemo(
    () => (typeof navigator === "undefined" ? true : isMacPlatform(navigator.platform)),
    [],
  );

  const selectedModel = useMemo(() => {
    if (!selectedModelSlug) return models[0] ?? null;
    return (
      models.find(
        (m) => m.slug.toLowerCase() === selectedModelSlug.toLowerCase() || m.id === selectedModelSlug,
      ) ??
      models[0] ??
      null
    );
  }, [models, selectedModelSlug]);

  const triggerTitle = selectedModel
    ? getDisplayModelName(selectedModel)
    : selectedModelSlug || tr("选择模型", "Choose model");

  const triggerTooltip = selectedModel
    ? `${getDisplayModelName(selectedModel)} (${selectedModel.slug})`
    : triggerTitle;

  const favoriteModels = useMemo(
    () => models.filter((m) => favoriteSet.has(m.slug)),
    [models, favoriteSet],
  );

  const displayedModels = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const baseList =
      normalizedQuery.length > 0
        ? models
        : activeTab === "favorites"
          ? favoriteModels
          : models;

    if (!normalizedQuery) {
      return baseList;
    }

    return baseList.filter((m) => {
      const displayName = getDisplayModelName(m).toLowerCase();
      return (
        displayName.includes(normalizedQuery) ||
        m.name.toLowerCase().includes(normalizedQuery) ||
        m.slug.toLowerCase().includes(normalizedQuery) ||
        m.subProvider.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [activeTab, favoriteModels, models, searchQuery]);

  const clampedHighlightedIndex =
    displayedModels.length > 0
      ? Math.min(highlightedIndex, displayedModels.length - 1)
      : -1;

  // Measure active tab button position for left-rail blue indicator pill
  useLayoutEffect(() => {
    if (!isOpen) return;
    const sidebar = sidebarRef.current;
    const button = tabButtonRefs.current[activeTab];
    if (!sidebar || !button) {
      setIndicatorTop(null);
      return;
    }
    const updatePosition = () => {
      const sidebarRect = sidebar.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      setIndicatorTop(buttonRect.top - sidebarRect.top + buttonRect.height / 2);
    };
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(sidebar);
    observer.observe(button);
    return () => observer.disconnect();
  }, [activeTab, isOpen]);

  // Auto-focus search input and scroll to selected model when opening
  useEffect(() => {
    if (!isOpen) return;
    setSearchQuery("");
    const idx = selectedModel
      ? displayedModels.findIndex((m) => m.slug === selectedModel.slug)
      : 0;
    setHighlightedIndex(idx >= 0 ? idx : 0);

    const frame = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      const selectedEl = listRef.current?.querySelector<HTMLElement>("[data-selected]");
      selectedEl?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  const toggleFavorite = useCallback(
    (slug: string) => {
      setFavoriteSlugs((prev) =>
        prev.includes(slug) ? prev.filter((item) => item !== slug) : [...prev, slug],
      );
    },
    [setFavoriteSlugs],
  );

  const handleSelectModel = useCallback(
    (model: PiModelInfo) => {
      if (disabled) return;
      onSelectModel(model.slug, model);
      setIsOpen(false);
    },
    [disabled, onSelectModel],
  );

  const scrollItemIntoView = (index: number) => {
    const container = listRef.current?.firstElementChild;
    const item = container?.children[index];
    if (item instanceof HTMLElement) {
      item.scrollIntoView({ block: "nearest" });
    }
  };

  function handleKeyDown(event: React.KeyboardEvent) {
    const quickIndex = quickSelectIndexFromEvent(event, isMac);
    if (quickIndex !== null) {
      const target = displayedModels[quickIndex];
      if (target) {
        event.preventDefault();
        event.stopPropagation();
        handleSelectModel(target);
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        if (displayedModels.length === 0) return;
        const next =
          clampedHighlightedIndex < displayedModels.length - 1
            ? clampedHighlightedIndex + 1
            : 0;
        setHighlightedIndex(next);
        scrollItemIntoView(next);
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        if (displayedModels.length === 0) return;
        const prev =
          clampedHighlightedIndex > 0
            ? clampedHighlightedIndex - 1
            : displayedModels.length - 1;
        setHighlightedIndex(prev);
        scrollItemIntoView(prev);
        break;
      }
      case "ArrowLeft":
      case "ArrowRight": {
        const input = searchInputRef.current;
        if (input && input.value.length > 0) return;
        event.preventDefault();
        setActiveTab((prev) => (prev === "pi" ? "favorites" : "pi"));
        setHighlightedIndex(0);
        break;
      }
      case "Enter": {
        if (event.nativeEvent.isComposing) return;
        event.preventDefault();
        const item = displayedModels[clampedHighlightedIndex];
        if (item) {
          handleSelectModel(item);
        }
        break;
      }
      case "Escape": {
        event.preventDefault();
        setIsOpen(false);
        break;
      }
    }
  }

  return (
    <Popover
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (disabled) {
          setIsOpen(false);
          return;
        }
        setIsOpen(nextOpen);
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            disabled={disabled}
            data-chat-provider-model-picker="true"
            className={cn(
              triggerVariant === "settings"
                ? "inline-flex h-8 max-w-60 items-center justify-between gap-2 rounded-lg border border-input bg-background px-2.5 text-xs font-normal text-foreground shadow-xs/5 transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden disabled:opacity-50 dark:bg-input/32"
                : "text-muted-foreground hover:bg-sidebar-row-hover hover:text-foreground flex max-w-52 min-w-0 shrink items-center justify-between gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-50",
              props.className,
            )}
          />
        }
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <PiGlyph className="size-3.5" />
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  className="min-w-0 flex-1 overflow-hidden truncate"
                  data-chat-provider-model-picker-label="true"
                />
              }
            >
              {triggerTitle}
            </TooltipTrigger>
            <TooltipPopup side="top">{triggerTooltip}</TooltipPopup>
          </Tooltip>
        </span>
        <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
      </PopoverTrigger>

      <PopoverPopup
        align="start"
        className="before:hidden"
        padding="none"
        touchBackdrop
      >
        <div
          data-model-picker-content="true"
          className="relative flex max-h-86.5 w-screen max-w-90 flex-row overflow-hidden"
          onKeyDown={handleKeyDown}
        >
          {/* Left Rail: Only ★ Favorites and Pi */}
          <div
            ref={sidebarRef}
            className="relative flex w-11 shrink-0 flex-col items-center gap-1 overflow-y-auto bg-muted/30 px-1 py-2"
          >
            {indicatorTop !== null ? (
              <span
                aria-hidden="true"
                style={{ top: `${indicatorTop}px` }}
                className="pointer-events-none absolute right-0 z-10 h-5 w-0.75 -translate-y-1/2 rounded-l-full bg-primary transition-[top] duration-150 ease-out"
              />
            ) : null}

            {/* ★ Favorites Tab */}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    ref={(node) => {
                      tabButtonRefs.current.favorites = node;
                    }}
                    variant="ghost"
                    size="icon-sm"
                    aria-label={tr("收藏模型", "Favorites")}
                    aria-pressed={activeTab === "favorites"}
                    onClick={() => {
                      setActiveTab("favorites");
                      setSearchQuery("");
                      setHighlightedIndex(0);
                      searchInputRef.current?.focus();
                    }}
                    className={cn(
                      "rounded-md transition-colors",
                      activeTab === "favorites"
                        ? "text-foreground"
                        : "text-muted-foreground/70 hover:text-foreground",
                    )}
                  >
                    <StarIcon className="size-5 fill-current" />
                  </Button>
                }
              />
              <TooltipPopup side="right">{tr("收藏", "Favorites")}</TooltipPopup>
            </Tooltip>

            <div className="my-0.5 w-full border-b border-border/70" />

            {/* Single Provider Tab: Pi */}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    ref={(node) => {
                      tabButtonRefs.current.pi = node;
                    }}
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Pi"
                    aria-pressed={activeTab === "pi"}
                    onClick={() => {
                      setActiveTab("pi");
                      setSearchQuery("");
                      setHighlightedIndex(0);
                      searchInputRef.current?.focus();
                    }}
                    className={cn(
                      "relative rounded-md transition-colors",
                      activeTab === "pi"
                        ? "text-foreground hover:bg-accent/50"
                        : "text-muted-foreground/70 hover:bg-accent/50 hover:text-foreground",
                    )}
                  >
                    <PiGlyph className="size-5" />
                  </Button>
                }
              />
              <TooltipPopup side="right">Pi</TooltipPopup>
            </Tooltip>
          </div>

          {/* Right Panel: Search + Model List */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-l border-border/70 bg-muted/40">
            <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
              <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                role="combobox"
                aria-expanded={true}
                aria-controls="pi-model-picker-listbox"
                aria-label={tr("搜索模型", "Search models")}
                placeholder={tr("搜索模型…", "Search models...")}
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setHighlightedIndex(0);
                  if (listRef.current) {
                    listRef.current.scrollTop = 0;
                  }
                }}
                onKeyDown={(event) => {
                  if (
                    (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
                    event.currentTarget.value.length > 0
                  ) {
                    event.stopPropagation();
                  }
                }}
                className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>

            <div
              id="pi-model-picker-listbox"
              ref={listRef}
              role="listbox"
              aria-label={tr("模型列表", "Models")}
              className="min-h-0 flex-1 overflow-y-auto p-1"
            >
              {displayedModels.length > 0 ? (
                <div className="space-y-0.5">
                  {displayedModels.map((model, index) => (
                    <ModelListRow
                      key={model.slug}
                      model={model}
                      isSelected={selectedModel?.slug === model.slug}
                      isHighlighted={index === clampedHighlightedIndex}
                      isFavorite={favoriteSet.has(model.slug)}
                      shortcut={quickSelectLabel(index, isMac)}
                      onSelect={() => handleSelectModel(model)}
                      onHighlight={() => setHighlightedIndex(index)}
                      onToggleFavorite={() => toggleFavorite(model.slug)}
                    />
                  ))}
                </div>
              ) : (
                <div className="px-2 py-8 text-center text-xs text-muted-foreground">
                  {searchQuery.trim()
                    ? tr("没有匹配的模型。", "No models match your search.")
                    : activeTab === "favorites"
                      ? tr("点击星标即可在此处收藏常用模型。", "Star models to pin them here.")
                      : tr("未检测到可用的 Pi 模型。", "No Pi models discovered.")}
                </div>
              )}
            </div>
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  );
});

export const PiThinkingPicker = memo(function PiThinkingPicker(props: {
  levels: ReadonlyArray<PiThinkingLevel>;
  selectedLevel: PiThinkingLevel | null;
  onSelectLevel: (level: PiThinkingLevel) => void;
  disabled?: boolean;
  triggerVariant?: "composer" | "settings";
}) {
  const { levels, selectedLevel, onSelectLevel, disabled = false, triggerVariant = "composer" } =
    props;
  const [isOpen, setIsOpen] = useState(false);
  const { locale, tr } = useI18n();

  if (levels.length === 0) {
    return null;
  }

  const effectiveLevel: PiThinkingLevel =
    selectedLevel && levels.includes(selectedLevel)
      ? selectedLevel
      : levels.includes("medium")
        ? "medium"
        : (levels[0] ?? "medium");

  return (
    <Popover open={isOpen} onOpenChange={(next) => !disabled && setIsOpen(next)}>
      <PopoverTrigger
        render={
          <button
            type="button"
            disabled={disabled}
            aria-label={tr("思考强度", "Thinking effort")}
            className={
              triggerVariant === "settings"
                ? "inline-flex h-8 items-center justify-between gap-1.5 rounded-lg border border-input bg-background px-2.5 text-xs font-normal text-foreground shadow-xs/5 transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden disabled:opacity-50 dark:bg-input/32"
                : "text-muted-foreground hover:bg-sidebar-row-hover hover:text-foreground flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-50"
            }
          />
        }
      >
        <BrainIcon className="size-3.5 shrink-0" />
        <span>{getThinkingLevelLabel(effectiveLevel, locale)}</span>
        <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverPopup align="start" className="w-40 p-1">
        <div className="flex flex-col gap-0.5">
          <div className="px-2 py-1 text-2xs font-medium text-muted-foreground">
            {tr("思考强度", "Thinking effort")}
          </div>
          {levels.map((level) => {
            const isSelected = level === effectiveLevel;
            return (
              <button
                key={level}
                type="button"
                onClick={() => {
                  onSelectLevel(level);
                  setIsOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                  isSelected
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-foreground hover:bg-accent/60",
                )}
              >
                <span>{getThinkingLevelLabel(level, locale)}</span>
                {isSelected ? <CheckIcon className="size-3.5" /> : null}
              </button>
            );
          })}
        </div>
      </PopoverPopup>
    </Popover>
  );
});

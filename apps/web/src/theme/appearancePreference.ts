/**
 * 外观与主题调色板偏好（浅色 / 深色 / 跟随系统 + 6 套内置主题调色板与亮暗半区独立配置）。
 *
 * 存储键沿用 index.html 首帧引导脚本读取的 `t3code:theme-appearance-mode` 与 `t3code:theme-halves:v1`，
 * 对齐 t3code 的 themeBoot / useTheme 行为。
 */
import {
  applyThemePalette,
  EMBER_THEME,
  getThemeColorsForMode,
  getThemeDefinition,
  GROVE_THEME,
  IRIS_THEME,
  OCEAN_THEME,
  parseThemeHalves,
  resolveThemeAppearance,
  resolveThemeHalf,
  T3_CHAT_THEME,
  THEME_APPEARANCE_MODE_STORAGE_KEY,
  THEME_HALVES_STORAGE_KEY,
  type ThemeAppearance,
  type ThemeDefinition,
  type ThemeHalves,
} from "./themePalette";

export type AppearanceMode = "system" | "light" | "dark";

export const APPEARANCE_MODE_STORAGE_KEY = THEME_APPEARANCE_MODE_STORAGE_KEY;
export const THEME_PREFERENCE_STORAGE_KEY = "t3code:theme-preference:v1";

/** 默认使用 t3-chat 主题（保持与之前版本一致）。 */
export const DEFAULT_THEME_ID = "t3-chat";

export const BUILTIN_THEME_DEFINITIONS: ReadonlyArray<ThemeDefinition> = [
  T3_CHAT_THEME,
  GROVE_THEME,
  OCEAN_THEME,
  EMBER_THEME,
  IRIS_THEME,
];

const appearanceListeners = new Set<() => void>();

function isAppearanceMode(value: unknown): value is AppearanceMode {
  return value === "system" || value === "light" || value === "dark";
}

export function readAppearanceMode(): AppearanceMode {
  try {
    const stored = window.localStorage.getItem(APPEARANCE_MODE_STORAGE_KEY);
    if (isAppearanceMode(stored)) return stored;
  } catch {
    // 存储不可用时退回跟随系统
  }
  return "system";
}

export function readThemePreference(): string {
  try {
    const stored = window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY);
    if (stored && (stored === "default" || getThemeDefinition(stored) !== null)) {
      return stored;
    }
  } catch {
    // ignore
  }
  return DEFAULT_THEME_ID;
}

export function readThemeHalves(): ThemeHalves | null {
  try {
    const raw = window.localStorage.getItem(THEME_HALVES_STORAGE_KEY);
    return parseThemeHalves(raw);
  } catch {
    return null;
  }
}

/** 把偏好解析成实际外观：跟随系统时取系统配色。 */
export function resolveAppearance(
  mode: AppearanceMode,
  systemDark: boolean,
): "light" | "dark" {
  if (mode === "system") return systemDark ? "dark" : "light";
  return mode;
}

/** 系统配色变化时重新解析。 */
export function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function syncDomTheme(
  mode: AppearanceMode,
  themeId: string,
  halves: ThemeHalves | null,
): "light" | "dark" {
  const appearance = resolveThemeAppearance(
    themeId,
    systemPrefersDark(),
    mode === "system",
    mode,
    halves,
  );
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", appearance === "dark");
    const effectiveTheme = resolveThemeHalf(themeId, halves, appearance);
    applyThemePalette(effectiveTheme, appearance);
  }
  return appearance;
}

/**
 * 应用外观：写入存储、切换 `.dark` class、刷新调色板变量。
 * 返回实际生效的外观，供调用方展示。
 */
export function applyAppearanceMode(mode: AppearanceMode): "light" | "dark" {
  try {
    window.localStorage.setItem(APPEARANCE_MODE_STORAGE_KEY, mode);
  } catch {
    // 存储不可用时仍然应用当前会话
  }
  const appearance = syncDomTheme(mode, readThemePreference(), readThemeHalves());
  notifyAppearanceListeners();
  return appearance;
}

/**
 * 切换整套主题调色板（如 "default" | "t3-chat" | "grove" | "ocean" | "ember" | "iris"），
 * 并清空单边覆盖（对齐 t3code setTheme）。
 */
export function applyThemePreference(themeId: string): void {
  try {
    window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, themeId);
    window.localStorage.removeItem(THEME_HALVES_STORAGE_KEY);
  } catch {
    // ignore
  }
  syncDomTheme(readAppearanceMode(), themeId, null);
  notifyAppearanceListeners();
}

/**
 * 为指定亮/暗模式单独设置主题半区（或同时切换模式），对齐 t3code setThemeHalf。
 */
export function applyThemeHalf(
  appearance: ThemeAppearance,
  themeId: string,
  switchMode = true,
): void {
  const currentTheme = readThemePreference();
  const currentHalves = readThemeHalves() ?? {};
  const otherAppearance: ThemeAppearance = appearance === "light" ? "dark" : "light";
  const otherThemeId = currentHalves[otherAppearance] ?? currentTheme;

  const nextHalves: { light?: string; dark?: string } = {
    [appearance]: themeId === "default" ? undefined : themeId,
    [otherAppearance]: otherThemeId === "default" ? undefined : otherThemeId,
  };

  try {
    if (themeId === otherThemeId) {
      window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, themeId);
      window.localStorage.removeItem(THEME_HALVES_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, themeId);
      window.localStorage.setItem(THEME_HALVES_STORAGE_KEY, JSON.stringify(nextHalves));
    }
    if (switchMode) {
      window.localStorage.setItem(APPEARANCE_MODE_STORAGE_KEY, appearance);
    }
  } catch {
    // ignore
  }

  const mode = switchMode ? appearance : readAppearanceMode();
  const halves = readThemeHalves();
  syncDomTheme(mode, readThemePreference(), halves);
  notifyAppearanceListeners();
}

export function resolveActiveThemeForAppearance(appearance: ThemeAppearance): string {
  const themeId = readThemePreference();
  const halves = readThemeHalves();
  const candidate = halves?.[appearance] ?? themeId;
  if (candidate === "default") return "default";
  const def = getThemeDefinition(candidate);
  if (def && getThemeColorsForMode(def, appearance) !== null) {
    return def.id;
  }
  return "default";
}

/** 首帧与系统配色变化时调用：只重新解析，不写存储。 */
export function refreshAppearance(): void {
  syncDomTheme(readAppearanceMode(), readThemePreference(), readThemeHalves());
  notifyAppearanceListeners();
}

/** system → light → dark → system 的循环（对齐 t3code appearance.cycle）。 */
export function cycleAppearanceMode(mode: AppearanceMode): AppearanceMode {
  if (mode === "system") return "light";
  if (mode === "light") return "dark";
  return "system";
}

export function subscribeAppearanceMode(listener: () => void): () => void {
  appearanceListeners.add(listener);
  return () => appearanceListeners.delete(listener);
}

function notifyAppearanceListeners(): void {
  for (const listener of appearanceListeners) listener();
}

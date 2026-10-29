/**
 * 外观与主题调色板偏好（浅色 / 深色 / 跟随系统 + 6 套内置主题调色板与亮暗半区独立配置）。
 *
 * 存储键沿用 index.html 首帧引导脚本读取的 `t3code:theme-appearance-mode` 与 `t3code:theme-halves:v1`，
 * 对齐 t3code 的 themeBoot / useTheme 行为。
 */
import {
  EMBER_THEME,
  getThemeColorsForMode,
  getThemeDefinition,
  GROVE_THEME,
  IRIS_THEME,
  OCEAN_THEME,
  T3_CHAT_THEME,
  THEME_APPEARANCE_MODE_STORAGE_KEY,
  type ThemeAppearance,
  type ThemeDefinition,
} from "./themePalette.ts";

import {
  readThemePreference as readStoredTheme,
  readThemeHalves,
  refreshTheme,
  setAppearanceMode,
  setTheme,
  setThemeHalf,
  subscribeTheme,
} from "../hooks/useTheme";

export type AppearanceMode = "system" | "light" | "dark";

export const APPEARANCE_MODE_STORAGE_KEY = THEME_APPEARANCE_MODE_STORAGE_KEY;
export const THEME_PREFERENCE_STORAGE_KEY = "t3code:theme-preference:v1";

export const DEFAULT_THEME_ID = "default";

export const BUILTIN_THEME_DEFINITIONS: ReadonlyArray<ThemeDefinition> = [
  T3_CHAT_THEME,
  GROVE_THEME,
  OCEAN_THEME,
  EMBER_THEME,
  IRIS_THEME,
];

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
  return readStoredTheme();
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

export function applyAppearanceMode(mode: AppearanceMode): "light" | "dark" {
  setAppearanceMode(mode);
  return resolveAppearance(mode, systemPrefersDark());
}

export function applyThemePreference(themeId: string): void {
  setTheme(themeId);
}

export function applyThemeHalf(
  appearance: ThemeAppearance,
  themeId: string,
  switchMode = true,
): void {
  setThemeHalf(appearance, themeId);
  if (switchMode) setAppearanceMode(appearance);
}

export function resolveActiveThemeForAppearance(appearance: ThemeAppearance): string {
  const candidate = readThemeHalves()?.[appearance] ?? readThemePreference();
  if (candidate === "default") return "default";
  const def = getThemeDefinition(candidate);
  return def && getThemeColorsForMode(def, appearance) !== null ? def.id : "default";
}

export function refreshAppearance(): void {
  refreshTheme();
}

/** system → light → dark → system 的循环（对齐 t3code appearance.cycle）。 */
export function cycleAppearanceMode(mode: AppearanceMode): AppearanceMode {
  if (mode === "system") return "light";
  if (mode === "light") return "dark";
  return "system";
}

export const subscribeAppearanceMode = subscribeTheme;

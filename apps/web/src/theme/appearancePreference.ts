/**
 * 外观偏好（浅色 / 深色 / 跟随系统）。
 *
 * 存储键沿用 index.html 首帧引导脚本读取的 `t3code:theme-appearance-mode`，
 * 这样首帧与运行时读到的是同一份偏好，不会闪烁。
 * 对齐 t3code 的 themeBoot / appearance 行为。
 */
import { applyThemePalette } from "./themePalette";

export type AppearanceMode = "system" | "light" | "dark";

export const APPEARANCE_MODE_STORAGE_KEY = "t3code:theme-appearance-mode";

/** 当前 pi-web 使用的调色板（与 main.tsx 保持一致）。 */
const ACTIVE_THEME_ID = "t3-chat";

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
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
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
  const appearance = resolveAppearance(mode, systemPrefersDark());
  document.documentElement.classList.toggle("dark", appearance === "dark");
  applyThemePalette(ACTIVE_THEME_ID, appearance);
  notifyAppearanceListeners();
  return appearance;
}

/** 首帧与系统配色变化时调用：只重新解析，不写存储。 */
export function refreshAppearance(): void {
  const mode = readAppearanceMode();
  const appearance = resolveAppearance(mode, systemPrefersDark());
  document.documentElement.classList.toggle("dark", appearance === "dark");
  applyThemePalette(ACTIVE_THEME_ID, appearance);
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

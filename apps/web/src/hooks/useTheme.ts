import { useSyncExternalStore } from "react";
import {
  applyThemePalette,
  canonicalThemePreference,
  CUSTOM_THEMES_STORAGE_KEY,
  getThemeDefinition,
  getThemePreferenceMode,
  getThemePreviewAppearance,
  invalidateCustomThemes,
  isKnownThemePreference,
  parseThemeHalves,
  resolveThemeAppearance,
  resolveThemeHalf,
  subscribeToThemePreview,
  THEME_APPEARANCE_MODE_STORAGE_KEY,
  THEME_FOLLOW_SYSTEM_STORAGE_KEY,
  THEME_HALVES_STORAGE_KEY,
  THEME_PREVIEW_ID,
  type ThemeAppearance,
  type ThemeHalves,
  type ThemePreference,
  type ThemePreferenceMode,
} from "../theme/themePalette";

export type Theme = ThemePreference;

export type ThemeSnapshot = Readonly<{
  theme: Theme;
  resolvedTheme: ThemeAppearance;
  systemDark: boolean;
  followSystem: boolean;
  appearanceMode: ThemePreferenceMode;
  themeHalves: ThemeHalves | null;
}>;

const STORAGE_KEY = "t3code:theme";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";
export const DEFAULT_THEME_ID = "t3-chat";

const DEFAULT_THEME_SNAPSHOT: ThemeSnapshot = {
  theme: DEFAULT_THEME_ID,
  resolvedTheme: "light",
  systemDark: false,
  followSystem: true,
  appearanceMode: "system",
  themeHalves: null,
};

export function readThemeHalves(): ThemeHalves | null {
  if (typeof window === "undefined") return null;
  try {
    return parseThemeHalves(window.localStorage.getItem(THEME_HALVES_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function readThemeHalvesRaw(): { light?: string; dark?: string } {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(THEME_HALVES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const result: { light?: string; dark?: string } = {};
    if (typeof parsed.light === "string") result.light = parsed.light;
    if (typeof parsed.dark === "string") result.dark = parsed.dark;
    return result;
  } catch {
    return {};
  }
}

function themeHalvesSignature(halves: ThemeHalves | null): string {
  return `${halves?.light ?? ""}|${halves?.dark ?? ""}`;
}

let listeners: Array<() => void> = [];
let lastSnapshot: ThemeSnapshot | null = null;
let snapshotStale = true;
let lastAppliedTheme: Omit<ThemeSnapshot, "resolvedTheme"> | null = null;

function emitChange() {
  snapshotStale = true;
  for (const listener of listeners) listener();
}

export function getSystemDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(MEDIA_QUERY).matches
  );
}

function readStoredFollowSystem(theme: Theme): boolean {
  if (typeof window === "undefined") return theme === "system";
  try {
    const raw = window.localStorage.getItem(THEME_FOLLOW_SYSTEM_STORAGE_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
  } catch {}
  return theme === "system";
}

function isThemePreferenceMode(value: string | null): value is ThemePreferenceMode {
  return value === "light" || value === "dark" || value === "system";
}

export function readAppearanceModePreference(theme: Theme): ThemePreferenceMode {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(THEME_APPEARANCE_MODE_STORAGE_KEY);
      if (isThemePreferenceMode(raw)) return raw;
    } catch {}
  }
  if (readStoredFollowSystem(theme)) return "system";
  return getThemePreferenceMode(theme) ?? "system";
}

function writeAppearanceModePreference(appearanceMode: ThemePreferenceMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_APPEARANCE_MODE_STORAGE_KEY, appearanceMode);
  } catch (err) {
    console.error("Failed to write appearance mode preference:", err);
  }
}

export function readThemePreference(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME_ID;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw !== null && isKnownThemePreference(raw)) {
      return canonicalThemePreference(raw);
    }
  } catch {}
  return DEFAULT_THEME_ID;
}

function writeThemePreference(theme: Theme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch (err) {
    console.error("Failed to write theme preference:", err);
  }
}

function syncMetaThemeColor(color: string) {
  if (typeof document === "undefined") return;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
  }
  meta.content = color;
}

export function applyTheme(
  theme: Theme,
  { suppressTransitions = false, preservePreview = true } = {},
) {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  if (preservePreview && document.documentElement.dataset?.themeId === THEME_PREVIEW_ID) {
    return;
  }

  const appearanceMode = readAppearanceModePreference(theme);
  const followSystem = appearanceMode === "system";
  const systemDark = followSystem ? getSystemDark() : false;
  const themeHalves = readThemeHalves();

  if (
    lastAppliedTheme?.theme === theme &&
    lastAppliedTheme.systemDark === systemDark &&
    lastAppliedTheme.followSystem === followSystem &&
    lastAppliedTheme.appearanceMode === appearanceMode &&
    themeHalvesSignature(lastAppliedTheme.themeHalves) === themeHalvesSignature(themeHalves)
  ) {
    return;
  }

  if (suppressTransitions) {
    document.documentElement.classList.add("no-transitions");
  }

  const resolvedAppearance = resolveThemeAppearance(
    theme,
    systemDark,
    followSystem,
    appearanceMode,
    themeHalves,
  );

  const activeHalfTheme = resolveThemeHalf(theme, themeHalves, resolvedAppearance);
  applyThemePalette(activeHalfTheme, resolvedAppearance);
  document.documentElement.classList.toggle("dark", resolvedAppearance === "dark");

  const palette = getThemeDefinition(activeHalfTheme);
  if (palette) {
    const chrome = palette.colors.chrome || (resolvedAppearance === "dark" ? "#0a0a0a" : "#fcfcfc");
    syncMetaThemeColor(chrome);
  }

  lastAppliedTheme = { theme, systemDark, followSystem, appearanceMode, themeHalves };

  if (suppressTransitions) {
    void document.documentElement.offsetHeight;
    requestAnimationFrame(() => {
      document.documentElement.classList.remove("no-transitions");
    });
  }
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  applyTheme(readThemePreference());
}

export function getThemeSnapshot(): ThemeSnapshot {
  if (typeof window === "undefined") return DEFAULT_THEME_SNAPSHOT;
  if (!snapshotStale && lastSnapshot) return lastSnapshot;

  snapshotStale = false;
  const theme = readThemePreference();
  const appearanceMode = readAppearanceModePreference(theme);
  const followSystem = appearanceMode === "system";
  const systemDark = followSystem ? getSystemDark() : false;
  const themeHalves = readThemeHalves();

  const resolvedTheme = resolveThemeAppearance(
    theme,
    systemDark,
    followSystem,
    appearanceMode,
    themeHalves,
  );

  lastSnapshot = { theme, resolvedTheme, systemDark, followSystem, appearanceMode, themeHalves };
  return lastSnapshot;
}

function handleSystemAppearanceChange() {
  const currentTheme = readThemePreference();
  if (readAppearanceModePreference(currentTheme) === "system") {
    applyTheme(currentTheme, { suppressTransitions: true });
  }
  emitChange();
}

function handleStorageChange(e: StorageEvent) {
  if (
    e.key === STORAGE_KEY ||
    e.key === THEME_FOLLOW_SYSTEM_STORAGE_KEY ||
    e.key === THEME_APPEARANCE_MODE_STORAGE_KEY ||
    e.key === THEME_HALVES_STORAGE_KEY
  ) {
    applyTheme(readThemePreference(), { suppressTransitions: true });
    emitChange();
  } else if (e.key === CUSTOM_THEMES_STORAGE_KEY || e.key === null) {
    invalidateCustomThemes();
    lastAppliedTheme = null;
    applyTheme(readThemePreference(), { suppressTransitions: true });
    emitChange();
  }
}

let removeWindowListeners: (() => void) | null = null;

function subscribe(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  listeners.push(listener);

  if (!removeWindowListeners) {
    const mq = typeof window.matchMedia === "function" ? window.matchMedia(MEDIA_QUERY) : null;
    mq?.addEventListener("change", handleSystemAppearanceChange);
    window.addEventListener("storage", handleStorageChange);
    removeWindowListeners = () => {
      mq?.removeEventListener("change", handleSystemAppearanceChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }

  return () => {
    listeners = listeners.filter((l) => l !== listener);
    if (listeners.length === 0) {
      removeWindowListeners?.();
      removeWindowListeners = null;
    }
  };
}

export function setTheme(nextTheme: Theme): boolean {
  if (typeof window === "undefined") return false;
  try {
    writeAppearanceModePreference(readAppearanceModePreference(readThemePreference()));
    window.localStorage.removeItem(THEME_HALVES_STORAGE_KEY);
    writeThemePreference(nextTheme);
  } catch (err) {
    console.error("Failed to set theme:", err);
    return false;
  }
  applyTheme(nextTheme, { suppressTransitions: true });
  emitChange();
  return true;
}

export function setAppearanceMode(nextMode: ThemePreferenceMode): boolean {
  if (typeof window === "undefined") return false;
  try {
    writeAppearanceModePreference(nextMode);
  } catch (err) {
    console.error("Failed to set appearance mode:", err);
    return false;
  }
  applyTheme(readThemePreference(), { suppressTransitions: true });
  emitChange();
  return true;
}

export function setThemeHalf(appearance: ThemeAppearance, themeId: string | null): boolean {
  if (typeof window === "undefined") return false;
  try {
    const current = readThemeHalvesRaw();
    const next: { light?: string; dark?: string } = { ...current };
    if (themeId === null) delete next[appearance];
    else next[appearance] = themeId;
    if (next.light === undefined && next.dark === undefined) {
      window.localStorage.removeItem(THEME_HALVES_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_HALVES_STORAGE_KEY, JSON.stringify(next));
    }
  } catch (err) {
    console.error("Failed to set theme half:", err);
    return false;
  }
  applyTheme(readThemePreference(), { suppressTransitions: true });
  emitChange();
  return true;
}

export function clearThemeHalves(): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.removeItem(THEME_HALVES_STORAGE_KEY);
  } catch (err) {
    console.error("Failed to clear theme halves:", err);
    return false;
  }
  applyTheme(readThemePreference(), { suppressTransitions: true });
  emitChange();
  return true;
}

export function refreshTheme({ preservePreview = false } = {}): void {
  if (typeof window === "undefined") return;
  lastAppliedTheme = null;
  applyTheme(readThemePreference(), { suppressTransitions: true, preservePreview });
  emitChange();
}

export function useRenderedAppearance(): ThemeAppearance {
  const { resolvedTheme } = useSyncExternalStore(subscribe, getThemeSnapshot, () => DEFAULT_THEME_SNAPSHOT);
  const previewAppearance = useSyncExternalStore(
    subscribeToThemePreview,
    getThemePreviewAppearance,
    () => null,
  );
  return previewAppearance ?? resolvedTheme;
}

export function useTheme() {
  const snapshot = useSyncExternalStore(subscribe, getThemeSnapshot, () => DEFAULT_THEME_SNAPSHOT);
  const { theme, resolvedTheme } = snapshot;

  const setFollowSystem = (nextFollowSystem: boolean): boolean => {
    const currentMode = readAppearanceModePreference(theme);
    const nextMode = nextFollowSystem
      ? "system"
      : currentMode === "system"
        ? (getThemePreferenceMode(theme) ?? "light")
        : currentMode;
    return setAppearanceMode(nextMode);
  };

  return {
    theme,
    setTheme,
    setAppearanceMode,
    setFollowSystem,
    setThemeHalf,
    clearThemeHalves,
    refreshTheme,
    followSystem: snapshot.followSystem,
    appearanceMode: snapshot.appearanceMode,
    resolvedTheme,
    themeHalves: snapshot.themeHalves,
  } as const;
}

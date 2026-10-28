import { useSyncExternalStore } from "react";
import { getCustomThemes, subscribeToCustomThemes, type ThemeDefinition } from "../theme/themePalette";

const EMPTY_THEMES: ReadonlyArray<ThemeDefinition> = [];

export function useCustomThemes(): ReadonlyArray<ThemeDefinition> {
  return useSyncExternalStore(subscribeToCustomThemes, getCustomThemes, () => EMPTY_THEMES);
}

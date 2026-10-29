import { useCallback, useMemo, useSyncExternalStore } from "react";

const listeners = new Map<string, Set<() => void>>();
const memory = new Map<string, string | null>();

function readRaw(key: string): string | null {
  if (memory.has(key)) return memory.get(key) ?? null;
  try {
    return localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function notify(key: string): void {
  for (const listener of listeners.get(key) ?? []) listener();
}

export function getLocalStorageItem<T>(key: string): T | null {
  try {
    const raw = readRaw(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function setLocalStorageItem<T>(key: string, value: T): void {
  const raw = JSON.stringify(value);
  try {
    localStorage.setItem(key, raw);
    memory.delete(key);
  } catch {
    memory.set(key, raw);
  }
  notify(key);
}

export function removeLocalStorageItem(key: string): void {
  try {
    localStorage.removeItem(key);
    memory.delete(key);
  } catch {
    memory.set(key, null);
  }
  notify(key);
}

export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((previous: T) => T)) => void] {
  const subscribe = useCallback((listener: () => void) => {
    let group = listeners.get(key);
    if (!group) listeners.set(key, (group = new Set()));
    group.add(listener);
    const onStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      group.delete(listener);
      if (group.size === 0) listeners.delete(key);
      window.removeEventListener("storage", onStorage);
    };
  }, [key]);
  const getSnapshot = useCallback(() => readRaw(key), [key]);
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const value = useMemo(() => {
    if (raw === null) return initialValue;
    try { return JSON.parse(raw) as T; } catch { return initialValue; }
  }, [raw, initialValue]);
  const update = useCallback((next: T | ((previous: T) => T)) => {
    const previous = getLocalStorageItem<T>(key) ?? initialValue;
    setLocalStorageItem(key, typeof next === "function" ? (next as (value: T) => T)(previous) : next);
  }, [key, initialValue]);
  return [value, update];
}

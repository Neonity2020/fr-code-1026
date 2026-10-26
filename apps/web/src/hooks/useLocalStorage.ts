import { useCallback, useEffect, useState } from "react";

/**
 * 轻量版 localStorage 钩子（t3code 原版基于 effect Schema 校验，这里用 JSON 序列化
 * 保持同款 API 形状：getLocalStorageItem / setLocalStorageItem / removeLocalStorageItem / useLocalStorage）。
 */
export function getLocalStorageItem<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function setLocalStorageItem<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or private mode */
  }
}

export function removeLocalStorageItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((previous: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => getLocalStorageItem<T>(key) ?? initialValue);

  useEffect(() => {
    setLocalStorageItem(key, value);
  }, [key, value]);

  const update = useCallback(
    (next: T | ((previous: T) => T)) => {
      setValue((previous) =>
        typeof next === "function" ? (next as (previous: T) => T)(previous) : next,
      );
    },
    [],
  );

  return [value, update];
}

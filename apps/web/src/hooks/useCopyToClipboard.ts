import { useCallback, useEffect, useRef, useState } from "react";

/** 剪贴板复制 + 短暂的 isCopied 反馈（对齐 t3code useCopyToClipboard 的用法形状）。 */
export function useCopyToClipboard(_options?: { target?: string }): {
  copyToClipboard: (text: string) => Promise<void>;
  isCopied: boolean;
} {
  const [isCopied, setIsCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => setIsCopied(false), 1_500);
    } catch {
      /* clipboard unavailable */
    }
  }, []);

  return { copyToClipboard, isCopied };
}

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseCopyToClipboardOptions {
  target?: string;
  timeout?: number;
  onCopy?: () => void;
  onError?: (error: Error) => void;
}

/** 剪贴板复制 + 短暂的 isCopied 反馈（对齐 t3code useCopyToClipboard 的用法形状）。 */
export function useCopyToClipboard(options?: UseCopyToClipboardOptions): {
  copyToClipboard: (text: string) => Promise<void>;
  isCopied: boolean;
} {
  const [isCopied, setIsCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

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
      optionsRef.current?.onCopy?.();
      if (timer.current !== null) clearTimeout(timer.current);
      const timeoutMs = optionsRef.current?.timeout ?? 1_500;
      timer.current = setTimeout(() => setIsCopied(false), timeoutMs);
    } catch (error) {
      optionsRef.current?.onError?.(
        error instanceof Error ? error : new Error("Clipboard copy failed"),
      );
    }
  }, []);

  return { copyToClipboard, isCopied };
}

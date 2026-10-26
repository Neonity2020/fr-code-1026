import { useEffect, useState } from "react";

/**
 * t3code 里读取 Electron 原生标题栏高度；纯 web 环境下不存在，返回 undefined，
 * UI 落回 CSS 变量默认值。
 */
export function useNativeTitlebarHeight(): number | undefined {
  const [height] = useState<number | undefined>(undefined);
  return height;
}

export function windowControlsOverlayVisible(): boolean {
  return false;
}

export function useWindowControlsOverlayEnabled(): boolean {
  const [enabled] = useState(false);
  useEffect(() => {
    /* web: nothing to observe */
  }, []);
  return enabled;
}

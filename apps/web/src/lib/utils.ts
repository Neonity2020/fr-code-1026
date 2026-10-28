import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isMacPlatform(platform: string = typeof navigator !== "undefined" ? navigator.platform : ""): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** 对齐 t3code:NFKD 归一 + 去变音符号 + 小写 + 压缩空白,供命令面板搜索使用。 */
export function normalizeSearchText(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

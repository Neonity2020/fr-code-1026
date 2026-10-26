import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isMacPlatform(platform: string = typeof navigator !== "undefined" ? navigator.platform : ""): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform);
}

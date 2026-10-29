import { mkdirSync, mkdtempSync } from "node:fs";
import { join, resolve } from "node:path";

export function workspaceRoot(homeDir: string, override?: string): string {
  return override?.trim() ? resolve(override) : join(homeDir, "fr-code");
}

export function createWorkspace(root: string, now = new Date()): string {
  mkdirSync(root, { recursive: true });
  const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  return mkdtempSync(join(root, `${date}-`));
}

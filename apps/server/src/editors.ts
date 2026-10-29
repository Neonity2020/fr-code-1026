import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { stat } from "node:fs/promises";

const execFileAsync = promisify(execFile);

export const editors = {
  vscode: { label: "VS Code", app: "Visual Studio Code", command: "code" },
  "vscode-insiders": { label: "VS Code Insiders", app: "Visual Studio Code - Insiders", command: "code-insiders" },
  cursor: { label: "Cursor", app: "Cursor", command: "cursor" },
  zed: { label: "Zed", app: "Zed", command: "zed" },
  vscodium: { label: "VSCodium", app: "VSCodium", command: "codium" },
  trae: { label: "Trae", app: "Trae", command: "trae" },
  kiro: { label: "Kiro", app: "Kiro", command: "kiro" },
  antigravity: { label: "Antigravity", app: "Antigravity IDE", command: "antigravity" },
} as const;

/** `path` 可以是目录也可以是具体文件;编辑器命令对两者行为一致。 */
export function editorLaunch(target: string, path: string, platform: NodeJS.Platform) {
  if (target === "folder") {
    if (platform === "darwin") return { command: "open", args: [path] };
    if (platform === "linux") return { command: "xdg-open", args: [path] };
    return null;
  }
  if (!Object.hasOwn(editors, target)) return null;
  const editor = editors[target as keyof typeof editors];
  if (platform === "darwin") return { command: "open", args: ["-a", editor.app, path] };
  if (platform === "linux") return { command: editor.command, args: [path] };
  return null;
}

export async function availableEditors(platform: NodeJS.Platform = process.platform) {
  if (platform !== "darwin" && platform !== "linux") return [];
  const found = await Promise.all(Object.entries(editors).map(async ([id, editor]) => {
    try {
      await execFileAsync(platform === "darwin" ? "open" : "which", platform === "darwin" ? ["-Ra", editor.app] : [editor.command]);
      return { id, label: editor.label };
    } catch { return null; }
  }));
  return found.filter((editor): editor is { id: string; label: typeof editors[keyof typeof editors]["label"] } => editor !== null);
}

export async function validateWorkspaceDirectory(path: string): Promise<void> {
  const info = await stat(path).catch(() => null);
  if (!info?.isDirectory()) throw new Error("Workspace folder does not exist or is not a directory.");
}

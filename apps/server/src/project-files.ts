import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** 与 t3code file picker 一致的结果上限;索引侧再多也不返回。 */
export const PROJECT_FILES_HARD_LIMIT = 20_000;

/** 递归枚举时跳过的目录名(git 仓库走 git ls-files,不会用到)。 */
const IGNORED_DIRECTORY_NAMES = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  ".cache",
  "dist",
  "build",
  "out",
  "coverage",
  ".venv",
  "venv",
  "__pycache__",
  ".DS_Store",
]);

interface ProjectFilesCacheEntry {
  files: string[];
  fetchedAtMs: number;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, ProjectFilesCacheEntry>();
const inflight = new Map<string, Promise<string[]>>();

async function listGitFiles(cwd: string): Promise<string[] | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { cwd, maxBuffer: 32 * 1024 * 1024 },
    );
    if (stdout.length === 0) return null;
    return stdout.split("\0").filter((entry) => entry.length > 0);
  } catch {
    return null;
  }
}

async function walkFiles(cwd: string, dir: string, files: string[]): Promise<void> {
  if (files.length >= PROJECT_FILES_HARD_LIMIT) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (files.length >= PROJECT_FILES_HARD_LIMIT) return;
    if (entry.name.startsWith(".") && entry.name !== ".github" && entry.name !== ".vscode") {
      continue;
    }
    if (IGNORED_DIRECTORY_NAMES.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(cwd, fullPath, files);
    } else if (entry.isFile()) {
      files.push(fullPath.slice(cwd.length + 1));
    }
  }
}

/** 项目文件索引:git 仓库用 git ls-files(含 untracked、尊重 .gitignore),否则递归枚举。 */
export async function listProjectFiles(cwd: string): Promise<string[]> {
  const info = await stat(cwd).catch(() => null);
  if (!info?.isDirectory()) {
    throw new Error(`Not a directory: ${cwd}`);
  }

  const cached = cache.get(cwd);
  if (cached && Date.now() - cached.fetchedAtMs < CACHE_TTL_MS) {
    return cached.files;
  }

  const existing = inflight.get(cwd);
  if (existing) {
    const files = await existing;
    return files;
  }

  const load = (async () => {
    const gitFiles = await listGitFiles(cwd);
    if (gitFiles !== null) {
      gitFiles.sort();
      return gitFiles.slice(0, PROJECT_FILES_HARD_LIMIT);
    }
    const files: string[] = [];
    await walkFiles(cwd, cwd, files);
    files.sort();
    return files;
  })();

  inflight.set(cwd, load);
  try {
    const files = await load;
    cache.set(cwd, { files, fetchedAtMs: Date.now() });
    return files;
  } finally {
    inflight.delete(cwd);
  }
}

/** 测试辅助:清空索引缓存。 */
export function clearProjectFilesCache(): void {
  cache.clear();
  inflight.clear();
}

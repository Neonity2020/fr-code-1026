import { execFile } from "node:child_process";
import { open, lstat } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function parseStatusEntries(status: string) {
  const parts = status.split("\0");
  const entries: { path: string; code: string; previousPath?: string }[] = [];
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (!entry) continue;
    const renamed = entry[0] === "R" || entry[0] === "C" || entry[1] === "R" || entry[1] === "C";
    entries.push({ path: entry.slice(3), code: entry.slice(0, 2), ...(renamed ? { previousPath: parts[++i] } : {}) });
  }
  return entries;
}

export function parseGitStatus(status: string, diff: string) {
  const files = parseStatusEntries(status).map((entry) => entry.path);
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split("\n")) {
    const [added, deleted] = line.split("\t");
    additions += Number(added) || 0;
    deletions += Number(deleted) || 0;
  }
  return { files, additions, deletions };
}

export async function countUntrackedLines(root: string, status: string) {
  const files = parseStatusEntries(status).filter((entry) => entry.code === "??");
  let additions = 0;
  let incomplete = files.length > 1000;
  let index = 0;
  // shortcut: skip files over 2 MiB and files beyond 1,000, use a streaming Git index for larger projects.
  async function worker() {
    while (index < Math.min(files.length, 1000)) {
      const file = files[index++];
      if (!file) continue;
      let handle;
      try {
        const path = join(root, file.path);
        const info = await lstat(path);
        if (info.isSymbolicLink()) { additions++; continue; }
        if (!info.isFile()) { incomplete = true; continue; }
        handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
        const stat = await handle.stat();
        if (!stat.isFile()) { incomplete = true; continue; }
        if (stat.size > 2 * 1024 * 1024) { incomplete = true; continue; }
        const bytes = Buffer.alloc(2 * 1024 * 1024 + 1);
        let bytesRead = 0;
        while (bytesRead < bytes.length) {
          const result = await handle.read(bytes, bytesRead, bytes.length - bytesRead, bytesRead);
          if (!result.bytesRead) break;
          bytesRead += result.bytesRead;
        }
        if (bytesRead > 2 * 1024 * 1024) { incomplete = true; continue; }
        const buffer = bytes.subarray(0, bytesRead);
        if (buffer.subarray(0, 8000).includes(0)) continue;
        for (const byte of buffer) if (byte === 10) additions++;
        if (buffer.length && buffer[buffer.length - 1] !== 10) additions++;
      } catch {
        incomplete = true;
      } finally { await handle?.close(); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(files.length, 8) }, worker));
  return { additions, incomplete };
}

export async function getFilePatch(cwd: string, file: string, mode: "all" | "staged" | "unstaged" = "all") {
  const git = async (...args: string[]) => (await execFileAsync("git", args, { cwd, maxBuffer: 4 * 1024 * 1024 })).stdout;
  const root = (await git("rev-parse", "--show-toplevel")).trim();
  const rootGit = async (...args: string[]) => (await execFileAsync("git", args, { cwd: root, maxBuffer: 4 * 1024 * 1024 })).stdout;
  const entries = parseStatusEntries(await rootGit("status", "--porcelain=v1", "-z", "--untracked-files=all"));
  const entry = entries.find((item) => item.path === file);
  if (!entry) throw new Error("File is no longer in the changes list");
  if (entry.code === "??") {
    if (mode === "staged") return { patch: "", message: "" };
    if (!(await lstat(join(root, file))).isFile()) return { patch: "", message: "This untracked item is not a regular file." };
    try {
      const result = await execFileAsync("git", ["diff", "--no-index", "--no-ext-diff", "--", "/dev/null", `./${file}`], { cwd: root, maxBuffer: 4 * 1024 * 1024 });
      return { patch: result.stdout, message: "" };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === 1 && "stdout" in error && typeof error.stdout === "string") return { patch: error.stdout, message: "" };
      throw error;
    }
  }
  const hasHead = await rootGit("rev-parse", "--verify", "HEAD").then(() => true, () => false);
  const args = ["--literal-pathspecs", "diff", "--no-ext-diff", "--no-textconv"];
  const paths = entry.previousPath ? [entry.previousPath, file] : [file];
  if (mode === "staged") return { patch: await rootGit(...args, "--cached", "--", ...paths), message: "" };
  if (mode === "unstaged") return { patch: await rootGit(...args, "--", ...paths), message: "" };
  if (hasHead) {
    const patch = await rootGit(...args, "HEAD", "--", ...paths);
    return { patch, message: !patch && entry.code[0] !== " " && entry.code[1] !== " " ? "Staged and unstaged changes cancel out in the combined view. Select either view to inspect them." : "" };
  }
  const [staged, unstaged] = await Promise.all([rootGit(...args, "--cached", "--", ...paths), rootGit(...args, "--", ...paths)]);
  return { patch: staged + unstaged, message: "" };
}

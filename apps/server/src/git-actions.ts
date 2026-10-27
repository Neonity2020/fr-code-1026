import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function runGit(cwd: string, ...args: string[]) {
  return (await execFileAsync("git", args, { cwd, maxBuffer: 4 * 1024 * 1024 })).stdout;
}

export async function localBranches(cwd: string) {
  const result = await runGit(cwd, "for-each-ref", "--format=%(refname:short)", "refs/heads/");
  return result.split("\n").filter(Boolean);
}

export async function remoteBranches(cwd: string) {
  const [refs, remoteOutput] = await Promise.all([
    runGit(cwd, "for-each-ref", "--format=%(refname)%00%(symref)", "refs/remotes/"),
    runGit(cwd, "remote"),
  ]);
  const remotes = remoteOutput.split("\n").filter(Boolean).sort((a, b) => b.length - a.length);
  return refs.split("\n").flatMap((line) => {
    const [ref, symbolic] = line.split("\0");
    if (!ref?.startsWith("refs/remotes/") || symbolic) return [];
    const name = ref.slice("refs/remotes/".length);
    const remote = remotes.find((candidate) => name.startsWith(`${candidate}/`));
    if (!remote) return [];
    const localName = name.slice(remote.length + 1);
    return localName ? [{ ref, name, localName }] : [];
  });
}

export async function checkoutRemoteBranch(cwd: string, ref: string) {
  const branch = (await remoteBranches(cwd)).find((item) => item.ref === ref);
  if (!branch) throw new Error("Remote branch not found; refresh and try again");
  if ((await localBranches(cwd)).includes(branch.localName)) throw new Error("A local branch with this name already exists; select it from the local list");
  await runGit(cwd, "switch", "--track", "-c", branch.localName, "--", branch.ref);
}

export async function switchBranch(cwd: string, branch: string) {
  if (!(await localBranches(cwd)).includes(branch)) throw new Error("Unknown local branch");
  await runGit(cwd, "switch", "--", branch);
}

export async function createBranch(cwd: string, branch: string, expectedBase: string) {
  if (!branch || branch !== branch.trim() || branch.startsWith("-") || branch.startsWith("@")) throw new Error("Invalid branch name");
  const checked = (await runGit(cwd, "check-ref-format", "--branch", branch)).trim();
  if (checked !== branch) throw new Error("Invalid branch name");
  const current = (await runGit(cwd, "branch", "--show-current")).trim() || "HEAD";
  if (current !== expectedBase) throw new Error("Current branch changed; refresh and try again");
  await runGit(cwd, "switch", "-c", branch, "--");
}

export async function commitChanges(cwd: string, message: string) {
  if (!message.trim()) throw new Error("Commit message is required");
  const root = (await runGit(cwd, "rev-parse", "--show-toplevel")).trim();
  await runGit(root, "add", "-A", "--", ".");
  await runGit(root, "commit", "-m", message.trim());
}

export interface PushTarget { branch: string; remote: string; ref: string; hasUpstream: boolean; ahead: number | null; behind: number | null }

export async function getPushTarget(cwd: string): Promise<PushTarget | null> {
  const branch = (await runGit(cwd, "branch", "--show-current")).trim();
  if (!branch) return null;
  const ref = `refs/heads/${branch}`;
  const upstream = (await runGit(cwd, "for-each-ref", "--format=%(upstream:remotename)%00%(upstream:remoteref)", ref)).trim().split("\0");
  const remotes = (await runGit(cwd, "remote")).split("\n").filter(Boolean);
  const hasUpstream = Boolean(upstream[0] && upstream[1]);
  const remote = hasUpstream ? upstream[0] : remotes.includes("origin") ? "origin" : remotes.length === 1 ? remotes[0] : "";
  if (!remote || remote === ".") return null;
  let ahead: number | null = null;
  let behind: number | null = null;
  if (hasUpstream) {
    const counts = await runGit(cwd, "rev-list", "--left-right", "--count", "@{upstream}...HEAD").catch(() => "");
    const match = counts.trim().match(/^(\d+)\s+(\d+)$/);
    if (match) { behind = Number(match[1]); ahead = Number(match[2]); }
  }
  return { branch, remote, ref: hasUpstream ? upstream[1]! : ref, hasUpstream, ahead, behind };
}

export async function pushBranch(cwd: string, expected: Pick<PushTarget, "branch" | "remote" | "ref">) {
  const target = await getPushTarget(cwd);
  if (!target || target.branch !== expected.branch || target.remote !== expected.remote || target.ref !== expected.ref) throw new Error("Push target changed; refresh and try again");
  const args = ["push", ...(target.hasUpstream ? [] : ["--set-upstream"]), "--", target.remote, `HEAD:${target.ref}`];
  await execFileAsync("git", args, { cwd, maxBuffer: 4 * 1024 * 1024, timeout: 120_000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
}

export async function syncRemote(cwd: string, action: "fetch" | "pull", expected: Pick<PushTarget, "branch" | "remote" | "ref">) {
  const target = await getPushTarget(cwd);
  if (!target || target.branch !== expected.branch || target.remote !== expected.remote || target.ref !== expected.ref || (action === "pull" && !target.hasUpstream)) {
    throw new Error("Remote target changed; refresh and try again");
  }
  const args = action === "fetch" ? ["fetch", "--no-tags", "--", target.remote] : ["pull", "--ff-only", "--", target.remote, target.ref];
  await execFileAsync("git", args, { cwd, maxBuffer: 4 * 1024 * 1024, timeout: 120_000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
}

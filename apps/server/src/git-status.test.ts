import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { countUntrackedLines, getFilePatch, parseGitStatus } from "./git-status.ts";
import { runGit } from "./git-actions.ts";

test("parses changed, renamed, untracked and binary files", () => {
  assert.deepEqual(parseGitStatus(" M file with spaces\0R  new name\0old name\0?? new file\0", "3\t2\tfile\n-\t-\tbinary\n"), {
    files: ["file with spaces", "new name", "new file"], additions: 3, deletions: 2,
  });
});

test("loads tracked and untracked changes from the repository root", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-web-diff-"));
  try {
    await runGit(dir, "init", "-b", "main");
    await runGit(dir, "config", "user.name", "Test");
    await runGit(dir, "config", "user.email", "test@example.com");
    await writeFile(join(dir, "tracked"), "before\n");
    await runGit(dir, "add", "tracked");
    const unborn = await getFilePatch(dir, "tracked");
    assert.match(unborn.patch, /\+before/);
    await runGit(dir, "commit", "-m", "initial");
    await writeFile(join(dir, "tracked"), "staged\n");
    await runGit(dir, "add", "tracked");
    await writeFile(join(dir, "tracked"), "before\n");
    assert.match((await getFilePatch(dir, "tracked")).message, /cancel out/);
    assert.match((await getFilePatch(dir, "tracked", "staged")).patch, /\+staged/);
    assert.match((await getFilePatch(dir, "tracked", "unstaged")).patch, /\+before/);
    await runGit(dir, "reset", "HEAD", "--", "tracked");
    await mkdir(join(dir, "nested"));
    await writeFile(join(dir, "tracked"), "after\n");
    await writeFile(join(dir, "new file"), "new content\n");
    await symlink("tracked", join(dir, "link"));
    assert.match((await getFilePatch(join(dir, "nested"), "tracked")).patch, /\+after/);
    assert.match((await getFilePatch(dir, "new file")).patch, /\+new content/);
    assert.equal((await getFilePatch(dir, "new file", "staged")).patch, "");
    assert.match((await getFilePatch(dir, "new file", "unstaged")).patch, /\+new content/);
    assert.match((await getFilePatch(dir, "link")).message, /not a regular file/);
    await assert.rejects(getFilePatch(dir, "../outside"), /no longer/);
    await runGit(dir, "restore", "tracked");
    await runGit(dir, "mv", "tracked", "renamed");
    assert.match((await getFilePatch(dir, "renamed")).patch, /rename from tracked/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("counts untracked text lines without following links or reading binary and oversized files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-web-lines-"));
  try {
    await writeFile(join(dir, "text"), "first\nsecond");
    await writeFile(join(dir, "empty"), "");
    await writeFile(join(dir, "binary"), Buffer.from([65, 0, 66, 10]));
    await writeFile(join(dir, "large"), Buffer.alloc(2 * 1024 * 1024 + 1));
    await symlink("text", join(dir, "link"));
    const status = ["text", "empty", "binary", "large", "link"].map((file) => `?? ${file}\0`).join("");
    assert.deepEqual(await countUntrackedLines(dir, status), { additions: 3, incomplete: true });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const rootDir = process.cwd();
const patchFile = path.resolve(rootDir, "patches/@pierre__diffs@1.6.1.patch");

if (!fs.existsSync(patchFile)) {
  console.log("[patch] No patch file found at:", patchFile);
  process.exit(0);
}

// Find all candidate @pierre/diffs directories
function findPierreDiffsDirs() {
  const candidates = new Set();

  function checkDir(dirPath) {
    if (fs.existsSync(dirPath)) {
      try {
        const real = fs.realpathSync(dirPath);
        if (fs.existsSync(path.join(real, "package.json"))) {
          candidates.add(real);
        }
      } catch {}
    }
  }

  checkDir(path.resolve(rootDir, "node_modules/@pierre/diffs"));
  checkDir(path.resolve(rootDir, "apps/web/node_modules/@pierre/diffs"));

  // Check bun store
  const bunStore = path.resolve(rootDir, "node_modules/.bun");
  if (fs.existsSync(bunStore)) {
    for (const entry of fs.readdirSync(bunStore)) {
      if (entry.startsWith("@pierre+diffs@")) {
        checkDir(path.resolve(bunStore, entry, "node_modules/@pierre/diffs"));
      }
    }
  }

  // Check pnpm store
  const pnpmStore = path.resolve(rootDir, "node_modules/.pnpm");
  if (fs.existsSync(pnpmStore)) {
    for (const entry of fs.readdirSync(pnpmStore)) {
      if (entry.startsWith("@pierre+diffs@")) {
        checkDir(path.resolve(pnpmStore, entry, "node_modules/@pierre/diffs"));
      }
    }
  }

  return Array.from(candidates);
}

const targets = findPierreDiffsDirs();
if (targets.length === 0) {
  console.log("[patch] No @pierre/diffs installations found to patch.");
  process.exit(0);
}

for (const target of targets) {
  const marker = path.join(target, "dist/components/CodeViewSearch.js");
  if (fs.existsSync(marker)) {
    console.log(`[patch] @pierre/diffs already patched at ${target}`);
    continue;
  }
  console.log(`[patch] Applying patch to ${target}...`);
  try {
    execSync(`patch -p1 -d "${target}" < "${patchFile}"`, { stdio: "inherit" });
    console.log(`[patch] Successfully patched ${target}`);
  } catch (err) {
    console.error(`[patch] Failed to apply patch to ${target}:`, err.message);
  }
}

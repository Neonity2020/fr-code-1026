import type { ThreadSummary } from "@pi-web/protocol";
import { projectBasename } from "../../projectIdentity.ts";
import type { PiSettingsState } from "../settings/SettingsView.tsx";

export interface SidebarProjectGroup {
  cwd: string;
  name: string;
  threads: ThreadSummary[];
  latestActivityAt: number;
}

export function partitionWorkingThreads(
  activeThreads: readonly ThreadSummary[],
  workingSectionEnabled: boolean,
): {
  workingThreads: ThreadSummary[];
  remainingActiveThreads: ThreadSummary[];
} {
  if (!workingSectionEnabled) {
    return {
      workingThreads: [],
      remainingActiveThreads: [...activeThreads],
    };
  }

  const workingThreads: ThreadSummary[] = [];
  const remainingActiveThreads: ThreadSummary[] = [];

  for (const thread of activeThreads) {
    if (thread.status === "running" || thread.unread || thread.wokeAt != null) {
      workingThreads.push(thread);
    } else {
      remainingActiveThreads.push(thread);
    }
  }

  return { workingThreads, remainingActiveThreads };
}

export function groupThreadsByProject(
  threads: readonly ThreadSummary[],
  order: PiSettingsState["projectOrder"],
  configuredProjectCwds: readonly string[] = [],
): SidebarProjectGroup[] {
  const byCwd = new Map<string, ThreadSummary[]>();

  for (const thread of threads) {
    const existing = byCwd.get(thread.cwd);
    if (existing) {
      existing.push(thread);
    } else {
      byCwd.set(thread.cwd, [thread]);
    }
  }

  const groups: SidebarProjectGroup[] = [];
  for (const [cwd, groupThreads] of byCwd) {
    const sorted = [...groupThreads].sort((a, b) => b.updatedAt - a.updatedAt);
    const latestActivityAt = sorted.reduce(
      (max, thread) => Math.max(max, thread.updatedAt, thread.createdAt),
      0,
    );
    groups.push({
      cwd,
      name: projectBasename(cwd),
      threads: sorted,
      latestActivityAt,
    });
  }

  const manualIndexByCwd = new Map<string, number>();
  configuredProjectCwds.forEach((cwd, idx) => {
    manualIndexByCwd.set(cwd, idx);
  });

  groups.sort((a, b) => {
    if (order === "alphabetical") {
      return a.name.localeCompare(b.name) || a.cwd.localeCompare(b.cwd);
    }
    if (order === "manual") {
      const aIdx = manualIndexByCwd.get(a.cwd) ?? Number.MAX_SAFE_INTEGER;
      const bIdx = manualIndexByCwd.get(b.cwd) ?? Number.MAX_SAFE_INTEGER;
      if (aIdx !== bIdx) return aIdx - bIdx;
      return b.latestActivityAt - a.latestActivityAt;
    }
    // "last-user-message" and "last-activity" both sort by most recent thread activity descending
    if (b.latestActivityAt !== a.latestActivityAt) {
      return b.latestActivityAt - a.latestActivityAt;
    }
    return a.name.localeCompare(b.name);
  });

  return groups;
}

import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { ThreadSummary } from "@pi-web/protocol";
import {
  buildThreadActionItems,
  filterCommandPaletteGroups,
  reduceCommandPaletteUiState,
  type CommandPaletteActionItem,
  type CommandPaletteGroup,
} from "./CommandPalette.logic.ts";

function actionItem(value: string, searchTerms: string[]): CommandPaletteActionItem {
  return {
    kind: "action",
    value,
    searchTerms,
    title: value,
    icon: null,
    run: () => {},
  };
}

function threadFixture(overrides: Partial<ThreadSummary>): ThreadSummary {
  return {
    id: overrides.id ?? "t1",
    title: overrides.title ?? "Thread",
    cwd: overrides.cwd ?? "/repo/api",
    status: "idle",
    createdAt: 1_000,
    updatedAt: overrides.updatedAt ?? 2_000,
    ...overrides,
  } as ThreadSummary;
}

test("reducer opens with intents and clears them on close", () => {
  let state = reduceCommandPaletteUiState(
    { open: false, mode: "command", openIntent: null },
    { _tag: "OpenNewThreadIn" },
  );
  assert.deepEqual(state, { open: true, mode: "command", openIntent: { kind: "new-thread-in" } });

  state = reduceCommandPaletteUiState(state, { _tag: "SetOpen", open: false });
  assert.deepEqual(state, { open: false, mode: "command", openIntent: null });
});

test("reducer toggles overlay modes without stacking surfaces", () => {
  let state: ReturnType<typeof reduceCommandPaletteUiState> = {
    open: false,
    mode: "command",
    openIntent: null,
  };
  state = reduceCommandPaletteUiState(state, { _tag: "ToggleMode", mode: "files" });
  assert.deepEqual(state, { open: true, mode: "files", openIntent: null });
  // 同模式再按一次 → 关闭
  state = reduceCommandPaletteUiState(state, { _tag: "ToggleMode", mode: "files" });
  assert.equal(state.open, false);
  // ⌘K 在 files 模式下 → 切回 command 并保持打开
  state = reduceCommandPaletteUiState(state, { _tag: "ToggleMode", mode: "files" });
  state = reduceCommandPaletteUiState(state, { _tag: "ToggleMode", mode: "command" });
  assert.deepEqual(
    { open: state.open, mode: state.mode },
    { open: true, mode: "command" },
  );
});

test("buildThreadActionItems sorts pinned first then recency and keeps limit", () => {
  const items = buildThreadActionItems({
    threads: [
      threadFixture({ id: "old", title: "Old", updatedAt: 1 }),
      threadFixture({ id: "pinned", title: "Pinned", updatedAt: 5, pinnedAt: 9 }),
      threadFixture({ id: "new", title: "New", updatedAt: 10 }),
    ],
    icon: null,
    limit: 2,
    runThread: () => {},
  });
  assert.deepEqual(
    items.map((item) => item.value),
    ["thread:pinned", "thread:new"],
  );
});

test("buildThreadActionItems marks the active thread in description", () => {
  const [item] = buildThreadActionItems({
    threads: [threadFixture({ id: "t1", title: "Fix login", branch: "fix/login" })],
    activeThreadId: "t1",
    icon: null,
    runThread: () => {},
  });
  assert.equal(item!.description, "api · #fix/login · Current thread");
});

test("empty query keeps every active group including recent threads", () => {
  const groups: CommandPaletteGroup[] = [
    { value: "actions", label: "Actions", items: [actionItem("a", ["new"])] },
    { value: "recent-threads", label: "Recent", items: [actionItem("t", ["thread"])] },
  ];
  const result = filterCommandPaletteGroups({
    activeGroups: groups,
    query: "",
    isInSubmenu: false,
    projectSearchItems: [],
    threadSearchItems: [],
  });
  assert.deepEqual(result.map((group) => group.value), ["actions", "recent-threads"]);
});

test("non-empty query drops recent threads and appends search groups", () => {
  const result = filterCommandPaletteGroups({
    activeGroups: [
      { value: "actions", label: "Actions", items: [actionItem("a", ["new thread"])] },
      { value: "recent-threads", label: "Recent", items: [actionItem("t", ["thread"])] },
    ],
    query: "login",
    isInSubmenu: false,
    projectSearchItems: [actionItem("p", ["login portal"])],
    threadSearchItems: [actionItem("s", ["fix login flow"])],
  });
  assert.deepEqual(
    result.map((group) => group.value),
    ["projects-search", "threads-search"],
  );
});

test("query tokens all must match somewhere in the haystack", () => {
  const result = filterCommandPaletteGroups({
    activeGroups: [
      { value: "actions", label: "Actions", items: [actionItem("a", ["new thread"])] },
    ],
    query: "new missing",
    isInSubmenu: false,
    projectSearchItems: [],
    threadSearchItems: [],
  });
  assert.equal(result.length, 0);
});

test("`>` prefix searches action groups only, dropping recent threads", () => {
  const result = filterCommandPaletteGroups({
    activeGroups: [
      { value: "actions", label: "Actions", items: [actionItem("toggle", ["toggle sidebar"])] },
      {
        value: "global-actions",
        label: "Global",
        items: [actionItem("settings", ["settings"])],
      },
      { value: "recent-threads", label: "Recent", items: [actionItem("t", ["toggle"])] },
    ],
    query: "> set",
    isInSubmenu: false,
    projectSearchItems: [actionItem("p", ["toggle"])],
    threadSearchItems: [actionItem("s", ["toggle"])],
  });
  assert.deepEqual(
    result.map((group) => group.value),
    ["global-actions"],
  );
  assert.equal(result[0]!.items.length, 1);
});

test("ranking prefers prefix matches and stable ordering otherwise", () => {
  const result = filterCommandPaletteGroups({
    activeGroups: [
      {
        value: "threads-search",
        label: "Threads",
        items: [actionItem("contains", ["fix login bug"]), actionItem("prefix", ["login page"])],
      },
    ],
    query: "login",
    isInSubmenu: true,
    projectSearchItems: [],
    threadSearchItems: [],
  });
  // Though listed second, "login page" wins on the prefix rank.
  assert.deepEqual(
    result[0]!.items.map((item) => item.value),
    ["prefix", "contains"],
  );
});

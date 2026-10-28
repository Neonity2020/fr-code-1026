import { strict as assert } from "node:assert";
import { test } from "node:test";

// 暂存 store 在模块加载时读取 localStorage，先装一个内存实现。
const memory = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
    removeItem: (key: string) => void memory.delete(key),
    clear: () => memory.clear(),
  },
};

const { MAX_STASH_ENTRIES, partitionStashAttachments, usePromptStashStore } = await import(
  "./promptStashStore.ts"
);

function makeEntry(id: string, prompt = id) {
  return {
    id,
    createdAt: Date.now(),
    prompt,
    attachments: [],
    droppedAttachmentNames: [],
  };
}

test("压入暂存后按时间倒序排列", () => {
  usePromptStashStore.getState().stashEntry(makeEntry("first"));
  usePromptStashStore.getState().stashEntry(makeEntry("second"));
  const ids = usePromptStashStore.getState().entries.map((entry) => entry.id);
  assert.deepEqual(ids, ["second", "first"]);
});

test("取回条目会同时从队列移除", () => {
  usePromptStashStore.getState().stashEntry(makeEntry("take-me"));
  const { entry } = usePromptStashStore.getState().takeEntry("take-me");
  assert.equal(entry?.id, "take-me");
  assert.equal(
    usePromptStashStore.getState().entries.some((candidate) => candidate.id === "take-me"),
    false,
  );
});

test("删除条目只移除不返回内容", () => {
  usePromptStashStore.getState().stashEntry(makeEntry("remove-me"));
  const { removed } = usePromptStashStore.getState().removeEntry("remove-me");
  assert.equal(removed?.id, "remove-me");
  assert.equal(
    usePromptStashStore.getState().entries.some((candidate) => candidate.id === "remove-me"),
    false,
  );
});

test("超出上限时挤掉最旧的条目", () => {
  for (let index = 0; index < MAX_STASH_ENTRIES + 2; index += 1) {
    usePromptStashStore.getState().stashEntry(makeEntry(`entry-${index}`));
  }
  const entries = usePromptStashStore.getState().entries;
  assert.equal(entries.length, MAX_STASH_ENTRIES);
  assert.equal(entries.some((entry) => entry.id === "entry-0"), false);
});

test("暂存写入 localStorage", () => {
  usePromptStashStore.getState().stashEntry(makeEntry("persisted", "hello"));
  const raw = memory.get("fr-code:prompt-stash:v1");
  assert.ok(raw);
  const parsed = JSON.parse(raw as string) as { state: { entries: { id: string }[] } };
  assert.equal(parsed.state.entries.some((entry) => entry.id === "persisted"), true);
});

test("附件超预算时只保留名字", () => {
  const big = "x".repeat(3_000_000);
  const { kept, droppedNames } = partitionStashAttachments([
    { id: "a", name: "big.png", mimeType: "image/png", size: 10, url: `data:image/png;base64,${big}` },
    { id: "b", name: "small.png", mimeType: "image/png", size: 10, url: "data:image/png;base64,AAA" },
  ]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0]?.id, "b");
  assert.deepEqual(droppedNames, ["big.png"]);
});

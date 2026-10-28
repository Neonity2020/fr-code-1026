import { strict as assert } from "node:assert";
import { test } from "node:test";

// 草稿 store 在模块加载时读取 localStorage，先装一个内存实现。
const memory = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
    removeItem: (key: string) => void memory.delete(key),
    clear: () => memory.clear(),
  },
};

const { draftContent, useComposerDraftStore } = await import("./composerDraftStore.ts");

test("恢复草稿保留尖括号和换行", () => {
  const nodes = draftContent("<div>\n\nhello & goodbye").content[0]!.content;
  assert.equal(nodes.map((node) => node.type === "hardBreak" ? "\n" : node.text).join(""), "<div>\n\nhello & goodbye");
});

test("草稿按线程隔离保存", () => {
  const store = useComposerDraftStore.getState();
  store.setDraft("thread-a", "hello");
  store.setDraft("thread-b", "world");
  assert.equal(useComposerDraftStore.getState().getDraft("thread-a"), "hello");
  assert.equal(useComposerDraftStore.getState().getDraft("thread-b"), "world");
});

test("空白草稿不会落库", () => {
  const store = useComposerDraftStore.getState();
  store.setDraft("thread-c", "   ");
  assert.equal(useComposerDraftStore.getState().getDraft("thread-c"), "");
});

test("清空草稿后取回空串", () => {
  const store = useComposerDraftStore.getState();
  store.setDraft("thread-d", "draft");
  store.clearDraft("thread-d");
  assert.equal(useComposerDraftStore.getState().getDraft("thread-d"), "");
});

test("草稿写入 localStorage", () => {
  useComposerDraftStore.getState().setDraft("thread-e", "persisted");
  const raw = memory.get("fr-code:composer-drafts:v1");
  assert.ok(raw);
  assert.equal((JSON.parse(raw as string) as Record<string, string>)["thread-e"], "persisted");
});

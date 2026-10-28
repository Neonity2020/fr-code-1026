import { strict as assert } from "node:assert";
import { test } from "node:test";
import { calculateContextTokens, foldAssistantUsage, markCompacted, statsFromSessionRpc } from "./stats.ts";

const usage = (overrides: Record<string, unknown> = {}) => ({
  input: 100,
  output: 20,
  cacheRead: 50,
  cacheWrite: 10,
  totalTokens: 180,
  cost: { input: 0.01, output: 0.02, cacheRead: 0, cacheWrite: 0, total: 0.03 },
  ...overrides,
});

test("calculateContextTokens 优先 native totalTokens，缺省时按分量求和", () => {
  assert.equal(calculateContextTokens(usage()), 180);
  assert.equal(
    calculateContextTokens({ input: 7, output: 3, cacheRead: 0, cacheWrite: 0 }),
    10,
  );
  assert.equal(calculateContextTokens({}), null);
});

test("foldAssistantUsage 折叠单条 usage 并累计总量与费用", () => {
  const first = foldAssistantUsage(null, usage(), 1000);
  assert.equal(first.usedTokens, 180);
  assert.equal(first.totalTokens, 180);
  assert.equal(first.cost, 0.03);
  assert.equal(first.contextWindow, 1000);
  assert.equal(first.percent, 18);

  const second = foldAssistantUsage(first, usage({ totalTokens: 220, cost: { total: 0.01 } }), null);
  assert.equal(second.usedTokens, 220);
  assert.equal(second.totalTokens, 400);
  assert.equal(second.cost, 0.04);
  // 未知窗口沿用旧值
  assert.equal(second.contextWindow, 1000);
});

test("foldAssistantUsage 在 usage.error 之外的消息上给出百分比封顶 100", () => {
  const stats = foldAssistantUsage(null, usage({ totalTokens: 2500 }), 1000);
  assert.equal(stats.percent, 100);
});

test("markCompacted 清空上下文占用但保留累计值与窗口", () => {
  const previous = foldAssistantUsage(null, usage(), 1000);
  const compacted = markCompacted(previous);
  assert.equal(compacted.usedTokens, null);
  assert.equal(compacted.percent, null);
  assert.equal(compacted.contextWindow, 1000);
  assert.equal(compacted.totalTokens, 180);
  assert.equal(compacted.cost, 0.03);
});

test("statsFromSessionRpc 映射 pi get_session_stats 响应", () => {
  const stats = statsFromSessionRpc({
    tokens: { input: 10, output: 5, cacheRead: 2, cacheWrite: 1, total: 18 },
    cost: 0.42,
    contextUsage: { tokens: 900, contextWindow: 1000, percent: 90 },
  });
  assert.deepEqual(stats, {
    usedTokens: 900,
    contextWindow: 1000,
    percent: 90,
    totalTokens: 18,
    cost: 0.42,
  });

  // 压缩后 tokens=0/null：占用与百分比置空，保留窗口与累计
  const unknown = statsFromSessionRpc({
    tokens: { total: 18 },
    cost: 0.42,
    contextUsage: { tokens: 0, contextWindow: 1000, percent: 0 },
  });
  assert.equal(unknown?.usedTokens, null);
  assert.equal(unknown?.percent, null);
  assert.equal(unknown?.contextWindow, 1000);

  assert.equal(statsFromSessionRpc(undefined), null);
  assert.equal(statsFromSessionRpc({}), null);
});

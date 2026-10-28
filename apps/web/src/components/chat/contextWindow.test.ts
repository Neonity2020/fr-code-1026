import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  deriveContextWindowView,
  formatContextWindowPercentage,
  formatContextWindowTokens,
} from "./contextWindow.ts";

test("formatContextWindowTokens 按 t3code 规则缩写", () => {
  assert.equal(formatContextWindowTokens(null), "0");
  assert.equal(formatContextWindowTokens(Number.NaN), "0");
  assert.equal(formatContextWindowTokens(0), "0");
  assert.equal(formatContextWindowTokens(999), "999");
  assert.equal(formatContextWindowTokens(1_000), "1k");
  assert.equal(formatContextWindowTokens(1_234), "1.2k");
  assert.equal(formatContextWindowTokens(9_999), "10k");
  assert.equal(formatContextWindowTokens(12_000), "12k");
  assert.equal(formatContextWindowTokens(999_999), "1000k");
  assert.equal(formatContextWindowTokens(1_500_000), "1.5m");
});

test("formatContextWindowPercentage 小数位与取整", () => {
  assert.equal(formatContextWindowPercentage(null), null);
  assert.equal(formatContextWindowPercentage(Number.NaN), null);
  assert.equal(formatContextWindowPercentage(4), "4%");
  assert.equal(formatContextWindowPercentage(4.56), "4.6%");
  assert.equal(formatContextWindowPercentage(18), "18%");
  assert.equal(formatContextWindowPercentage(18.4), "18%");
});

test("deriveContextWindowView 输出圆环视图模型", () => {
  const view = deriveContextWindowView({
    usedTokens: 18_000,
    contextWindow: 100_000,
    percent: 18,
    totalTokens: 25_000,
    cost: 0.3,
  });
  assert.equal(view.normalizedPercentage, 18);
  assert.equal(view.hasWindow, true);
  assert.equal(view.percentageLabel, "18%");
  assert.equal(view.usageLabel, "18k/100k");
  assert.equal(view.totalProcessedTokens, 25_000);
  assert.ok(view.usageColor.includes("muted-foreground"));
});

test("deriveContextWindowView 超过 90% 转错误色并夹取百分比", () => {
  const view = deriveContextWindowView({
    usedTokens: 95_000,
    contextWindow: 100_000,
    percent: 95,
    totalTokens: null,
    cost: null,
  });
  assert.equal(view.usageColor, "var(--color-error)");
  assert.equal(view.totalProcessedTokens, null);
  const clamped = deriveContextWindowView({
    usedTokens: 200,
    contextWindow: 100,
    percent: 200,
    totalTokens: null,
    cost: null,
  });
  assert.equal(clamped.normalizedPercentage, 100);
});

test("deriveContextWindowView 无窗口时只显示已用量", () => {
  const view = deriveContextWindowView({
    usedTokens: 1_234,
    contextWindow: null,
    percent: null,
    totalTokens: null,
    cost: null,
  });
  assert.equal(view.hasWindow, false);
  assert.equal(view.percentageLabel, null);
  assert.equal(view.usageLabel, "1.2k");
});

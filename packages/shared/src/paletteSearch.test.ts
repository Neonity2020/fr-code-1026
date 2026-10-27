import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  foldSearchQuery,
  rankSearchGroups,
  scoreSearchTerms,
  splitSearchText,
} from "./paletteSearch.ts";

test("折叠查询会去掉多余空白与引号", () => {
  assert.equal(foldSearchQuery('  "Fix   Sidebar"  '), "fix sidebar");
  assert.equal(foldSearchQuery(""), "");
});

test("名称命中优于关键词命中", () => {
  const match = scoreSearchTerms("sidebar", ["Open sidebar", "sidebar panel"]);
  assert.ok(match);
  assert.ok(match.quality >= 0.7);
  // 命中在主字段（前缀），所以会给出高亮区间。
  assert.equal(match.ranges.length, 1);
  assert.equal(match.ranges[0]?.start, 5);
  assert.equal(match.ranges[0]?.end, 12);
});

test("关键词命中会被压到较低档位", () => {
  const match = scoreSearchTerms("sidebar", ["Unrelated title", "sidebar"]);
  assert.ok(match);
  assert.ok(match.groupQuality !== undefined);
  assert.ok(match.groupQuality! <= 0.65);
});

test("词中短词不命中", () => {
  assert.equal(scoreSearchTerms("del", ["Model picker"]), null);
  // 四个以上字符允许命中词内。
  assert.ok(scoreSearchTerms("pick", ["Model picker"]));
});

test("拼写容错只在没有词首命中时启用", () => {
  const typo = scoreSearchTerms("sidebr", ["Open sidebar"], { typos: true });
  assert.ok(typo);
  assert.equal(typo.strong, false);
  const exact = scoreSearchTerms("sidebr", ["Open sidebar"]);
  assert.equal(exact, null);
});

test("连写词可以命中被拆开书写的名称", () => {
  const match = scoreSearchTerms("vscode", ["VS Code editor"]);
  assert.ok(match);
  assert.ok(match.quality > 0);
});

test("中文查询可以命中标题", () => {
  const match = scoreSearchTerms("侧边栏", ["打开侧边栏"]);
  assert.ok(match);
  assert.ok(match.quality > 0);
});

test("分组排序：完全命中的组排在部分命中的组前面", () => {
  const groups = [
    {
      group: "partial",
      items: [
        { title: "sidebar settings" },
        { title: "unrelated" },
      ],
    },
    {
      group: "exact",
      items: [{ title: "sidebar" }],
    },
  ];
  const ranked = rankSearchGroups(groups, (item) =>
    scoreSearchTerms("sidebar", [item.title]),
  );
  assert.equal(ranked[0]?.group, "exact");
  assert.equal(ranked[1]?.group, "partial");
  // 组内只保留命中的条目。
  assert.equal(ranked[1]?.ranked.length, 1);
});

test("高亮区间可以把文本切成普通段与高亮段", () => {
  const parts = splitSearchText("Open sidebar", [{ start: 5, end: 12 }]);
  assert.deepEqual(parts, [
    { text: "Open ", highlighted: false, start: 0 },
    { text: "sidebar", highlighted: true, start: 5 },
  ]);
});

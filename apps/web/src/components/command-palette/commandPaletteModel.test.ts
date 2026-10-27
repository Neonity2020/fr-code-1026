import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  COMMAND_PALETTE_ACTION_GROUP,
  COMMAND_PALETTE_THREAD_GROUP,
  filterCommandPaletteGroups,
  type CommandPaletteGroup,
} from "./commandPaletteModel.ts";

function createGroups(): CommandPaletteGroup[] {
  return [
    {
      value: COMMAND_PALETTE_ACTION_GROUP,
      label: "Actions",
      items: [
        {
          value: "action:new-thread",
          group: COMMAND_PALETTE_ACTION_GROUP,
          title: "New thread",
          keywords: ["create", "新建"],
          run: () => {},
        },
        {
          value: "action:open-settings",
          group: COMMAND_PALETTE_ACTION_GROUP,
          title: "Open settings",
          keywords: ["preferences", "设置"],
          run: () => {},
        },
      ],
    },
    {
      value: COMMAND_PALETTE_THREAD_GROUP,
      label: "Threads",
      items: [
        {
          value: "thread:1",
          group: COMMAND_PALETTE_THREAD_GROUP,
          title: "Fix sidebar layout",
          run: () => {},
        },
        {
          value: "thread:2",
          group: COMMAND_PALETTE_THREAD_GROUP,
          title: "Add command palette",
          run: () => {},
        },
      ],
    },
  ];
}

test("空查询返回全部分组与条目", () => {
  const groups = filterCommandPaletteGroups(createGroups(), "");
  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.items.length, 2);
  assert.equal(groups[1]?.items.length, 2);
});

test("查询只保留命中的条目", () => {
  const groups = filterCommandPaletteGroups(createGroups(), "settings");
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.value, COMMAND_PALETTE_ACTION_GROUP);
  assert.equal(groups[0]?.items.length, 1);
  assert.equal(groups[0]?.items[0]?.value, "action:open-settings");
});

test("隐藏关键词也能命中", () => {
  const groups = filterCommandPaletteGroups(createGroups(), "新建");
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.items[0]?.value, "action:new-thread");
});

test("命中区间指向标题里的匹配位置", () => {
  const groups = filterCommandPaletteGroups(createGroups(), "sidebar");
  const threadGroup = groups.find((group) => group.value === COMMAND_PALETTE_THREAD_GROUP);
  assert.ok(threadGroup);
  const item = threadGroup.items[0];
  assert.equal(item?.title, "Fix sidebar layout");
  assert.equal(item?.ranges.length, 1);
  assert.equal(item?.ranges[0]?.start, 4);
  assert.equal(item?.ranges[0]?.end, 11);
});

test("没有命中时返回空分组列表", () => {
  const groups = filterCommandPaletteGroups(createGroups(), "zzzzz");
  assert.equal(groups.length, 0);
});

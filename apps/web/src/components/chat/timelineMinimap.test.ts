import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TurnItem } from "@pi-web/protocol";
import {
  deriveTimelineMinimapItems,
  resolveTimelineMinimapIndexFromPointer,
  resolveTimelineMinimapPreview,
  resolveTimelineMinimapTopPercent,
  shouldCollapseUserMessage,
} from "./timelineMinimap.ts";

function makeBase(id: string, ordinal: number) {
  return {
    id,
    threadId: "t1",
    ordinal,
    startedAt: 1000,
    completedAt: 1005,
  };
}

describe("timelineMinimap", () => {
  it("strips common markdown formatting cleanly in preview", () => {
    const preview = resolveTimelineMinimapPreview({
      id: "u1",
      userText: "  Hello   world  ",
      assistantText: "## Title\nCheck `code` and [link](https://example.com) **bold**",
    });
    assert.equal(preview?.userText, "Hello world");
    assert.equal(preview?.assistantText, "Title Check code and link bold");
  });

  it("pairs user turns with their subsequent assistant reply", () => {
    const items: TurnItem[] = [
      { ...makeBase("u1", 1), type: "user_message", status: "completed", text: "Hello" },
      {
        ...makeBase("c1", 2),
        type: "command_execution",
        status: "completed",
        title: "ls",
        input: "ls",
      },
      {
        ...makeBase("a1", 3),
        type: "assistant_message",
        status: "completed",
        text: "Hi **there**!",
      },
      { ...makeBase("u2", 4), type: "user_message", status: "completed", text: "Second question" },
    ];
    const turns = deriveTimelineMinimapItems(items);
    assert.equal(turns.length, 2);
    assert.equal(turns[0]?.id, "u1");
    assert.equal(turns[0]?.userText, "Hello");
    assert.equal(turns[0]?.assistantText, "Hi **there**!");
    assert.equal(turns[1]?.id, "u2");
    assert.equal(turns[1]?.assistantText, null);
  });

  it("computes rail positions and pointer mapping", () => {
    assert.equal(resolveTimelineMinimapTopPercent(0, 3), 0);
    assert.equal(resolveTimelineMinimapTopPercent(1, 3), 50);
    assert.equal(resolveTimelineMinimapTopPercent(2, 3), 100);
    assert.equal(
      resolveTimelineMinimapIndexFromPointer({
        itemCount: 3,
        railTop: 100,
        railHeight: 200,
        pointerY: 200,
      }),
      1,
    );
  });

  it("collapses long or multi-line user messages", () => {
    assert.equal(shouldCollapseUserMessage("Short message"), false);
    assert.equal(shouldCollapseUserMessage("a\nb\nc\nd\ne\nf\ng\nh\ni"), true);
  });
});

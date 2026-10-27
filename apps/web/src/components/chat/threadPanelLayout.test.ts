import { strict as assert } from "node:assert";
import { test } from "node:test";
import { canShowInlineThreadPanel } from "./threadPanelLayout.ts";

test("uses a popup when the chat area cannot fit the panel", () => {
  assert.equal(canShowInlineThreadPanel(1012, 236), true);
  assert.equal(canShowInlineThreadPanel(1011, 500), false);
  assert.equal(canShowInlineThreadPanel(1600, 235), false);
});

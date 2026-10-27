import { strict as assert } from "node:assert";
import { test } from "node:test";
import { shouldPollGitStatus } from "./gitStatusPolling.ts";

test("polls only while the panel and page are visible and no operation dialog is open", () => {
  assert.equal(shouldPollGitStatus(true, false, true), true);
  assert.equal(shouldPollGitStatus(false, false, true), false);
  assert.equal(shouldPollGitStatus(true, true, true), false);
  assert.equal(shouldPollGitStatus(true, false, false), false);
});

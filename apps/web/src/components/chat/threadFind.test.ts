import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampThreadFindIndex,
  findThreadSearchOccurrences,
  formatThreadFindCount,
  stepThreadFindIndex,
} from "./threadFind.ts";

describe("threadFind", () => {
  it("finds case-insensitive occurrences without overlapping", () => {
    assert.deepEqual(findThreadSearchOccurrences("Hello hello HELLO", "hello"), [0, 6, 12]);
    assert.deepEqual(findThreadSearchOccurrences("aaaa", "aa"), [0, 2]);
    assert.deepEqual(findThreadSearchOccurrences("short", ""), []);
  });

  it("steps and wraps find index across boundaries", () => {
    assert.equal(stepThreadFindIndex(0, 3, 1), 1);
    assert.equal(stepThreadFindIndex(2, 3, 1), 0);
    assert.equal(stepThreadFindIndex(0, 3, -1), 2);
    assert.equal(stepThreadFindIndex(0, 0, 1), 0);
  });

  it("formats 1-based match count label", () => {
    assert.equal(formatThreadFindCount(0, 0), "0/0");
    assert.equal(formatThreadFindCount(0, 5), "1/5");
    assert.equal(formatThreadFindCount(4, 5), "5/5");
    assert.equal(clampThreadFindIndex(99, 5), 4);
  });
});

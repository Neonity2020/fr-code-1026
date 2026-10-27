import { strict as assert } from "node:assert";
import { test } from "node:test";
import { filterSlashCommands, SLASH_COMMANDS } from "./composerSlash.ts";

test("filterSlashCommands returns all commands when query is empty", () => {
  const result = filterSlashCommands(SLASH_COMMANDS, "");
  assert.equal(result.length, SLASH_COMMANDS.length);
});

test("filterSlashCommands matches command name or prefix", () => {
  const result = filterSlashCommands(SLASH_COMMANDS, "/for");
  assert.equal(result.length, 1);
  assert.equal(result[0]?.id, "fork");
});

test("filterSlashCommands matches chinese title or keyword", () => {
  const result = filterSlashCommands(SLASH_COMMANDS, "终端");
  assert.equal(result.length, 1);
  assert.equal(result[0]?.id, "terminal");
});

test("filterSlashCommands matches english title", () => {
  const result = filterSlashCommands(SLASH_COMMANDS, "changes");
  assert.equal(result.length, 1);
  assert.equal(result[0]?.id, "changes");
});

test("filterSlashCommands returns empty when no commands match", () => {
  const result = filterSlashCommands(SLASH_COMMANDS, "xyznonexistent");
  assert.equal(result.length, 0);
});

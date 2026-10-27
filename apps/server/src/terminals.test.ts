import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Terminals } from "./terminals.ts";

test("terminal accepts input, survives disconnect, and replays output", async () => {
  const oldShell = process.env.SHELL;
  if (process.platform !== "win32") process.env.SHELL = "/bin/sh";
  const terminals = new Terminals();
  let output = "";
  let exited = false;
  const connection = terminals.connect("test", process.cwd(), (message) => {
    if (message.type === "output") output += message.data;
    if (message.type === "exit") exited = true;
  });
  try {
    connection.resize(100, 30);
    connection.write("printf 'pi-terminal-ready\\n'\r");
    for (let i = 0; i < 200 && !output.includes("\r\npi-terminal-ready\r\n"); i++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.match(output, /\r\npi-terminal-ready\r\n/);
    connection.disconnect();
    let replay = "";
    const second = terminals.connect("test", process.cwd(), (message) => {
      if (message.type === "output") replay += message.data;
      if (message.type === "exit") exited = true;
    });
    assert.match(replay, /pi-terminal-ready/);
    second.terminate();
    for (let i = 0; i < 200 && !exited; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(exited, true);
    second.disconnect();
  } finally { terminals.dispose(); if (oldShell === undefined) delete process.env.SHELL; else process.env.SHELL = oldShell; }
});

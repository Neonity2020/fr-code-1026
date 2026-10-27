import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Terminals } from "./terminals.ts";

test("terminal accepts input, survives disconnect, and replays output", async () => {
  const terminals = new Terminals();
  const threadId = `test-${Date.now()}-${Math.random()}`;
  let output = "";
  let exited = false;
  const connection = terminals.connect(threadId, process.cwd(), (message) => {
    if (message.type === "output") output += message.data;
    if (message.type === "exit") exited = true;
  });
  try {
    connection.resize(100, 30);
    connection.write("printf 'pi-terminal-ready\\n'\r\n");
    for (let i = 0; i < 200 && !output.includes("pi-terminal-ready"); i++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.match(output, /pi-terminal-ready/);
    connection.disconnect();
    let replay = "";
    const second = terminals.connect(threadId, process.cwd(), (message) => {
      if (message.type === "output") replay += message.data;
      if (message.type === "exit") exited = true;
    });
    for (let i = 0; i < 200 && !replay.includes("pi-terminal-ready"); i++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.match(replay, /pi-terminal-ready/);
    second.terminate();
    for (let i = 0; i < 200 && !exited; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(exited, true);
    second.disconnect();
  } finally { terminals.dispose(); }
});

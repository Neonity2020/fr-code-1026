import * as pty from "node-pty";

interface Session {
  terminal: pty.IPty;
  output: string;
  listeners: Set<(message: { type: "output"; data: string } | { type: "exit"; code: number }) => void>;
}

export class Terminals {
  private readonly sessions = new Map<string, Session>();

  connect(threadId: string, cwd: string, listener: (message: { type: "output"; data: string } | { type: "exit"; code: number }) => void) {
    let session = this.sessions.get(threadId);
    if (!session) {
      const shell = process.platform === "win32" ? (process.env.COMSPEC || "cmd.exe") : (process.env.SHELL || "/bin/sh");
      const terminal = pty.spawn(shell, [], { name: "xterm-256color", cols: 80, rows: 24, cwd, env: { ...process.env, TERM: "xterm-256color" } as Record<string, string> });
      session = { terminal, output: "", listeners: new Set() };
      this.sessions.set(threadId, session);
      const active = session;
      terminal.onData((data) => {
        // shortcut: replay only the last 200,000 characters, use a persistent scrollback buffer for longer sessions.
        active.output = (active.output + data).slice(-200_000);
        for (const subscriber of active.listeners) subscriber({ type: "output", data });
      });
      terminal.onExit(({ exitCode }) => {
        if (this.sessions.get(threadId) === active) this.sessions.delete(threadId);
        for (const subscriber of active.listeners) subscriber({ type: "exit", code: exitCode });
        active.listeners.clear();
      });
    }
    session.listeners.add(listener);
    if (session.output) listener({ type: "output", data: session.output });
    const active = session;
    return {
      write: (data: string) => active.terminal.write(data),
      resize: (cols: number, rows: number) => active.terminal.resize(cols, rows),
      disconnect: () => active.listeners.delete(listener),
      terminate: () => { if (this.sessions.get(threadId) === active) this.close(threadId); },
    };
  }

  close(threadId: string) {
    const session = this.sessions.get(threadId);
    if (!session) return;
    this.sessions.delete(threadId);
    session.terminal.kill();
  }

  dispose() { for (const threadId of this.sessions.keys()) this.close(threadId); }
}

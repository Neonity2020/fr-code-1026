import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { SquareIcon, TerminalIcon, XIcon } from "lucide-react";
import { useI18n } from "~/i18n";
import { Button } from "../ui/button";

export function TerminalDrawer({ threadId, onClose, onShowChanges, placement = "right" }: { threadId: string; onClose: () => void; onShowChanges: () => void; placement?: "bottom" | "right" }) {
  const { tr } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [restart, setRestart] = useState(0);
  const [exited, setExited] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const dark = document.documentElement.classList.contains("dark");
    const terminal = new Terminal({ cursorBlink: true, fontSize: 12, scrollback: 5000, theme: { background: dark ? "#171717" : "#ffffff", foreground: dark ? "#eeeeee" : "#222222", cursor: dark ? "#eeeeee" : "#222222", cursorAccent: dark ? "#171717" : "#ffffff" } });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/terminal?threadId=${encodeURIComponent(threadId)}`);
    socketRef.current = socket;
    setConnected(false);
    setExited(false);
    const send = (message: object) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); };
    const resize = () => {
      if (!container.clientWidth || !container.clientHeight) return;
      fit.fit();
      send({ type: "resize", cols: terminal.cols, rows: terminal.rows });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    const input = terminal.onData((data) => send({ type: "input", data }));
    socket.onopen = () => { setConnected(true); resize(); terminal.focus(); };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as { type: string; data?: string; code?: number; message?: string };
        if (message.type === "output" && typeof message.data === "string") terminal.write(message.data);
        if (message.type === "exit") { setExited(true); terminal.writeln(`\r\n[${tr("终端已退出", "Terminal exited")}: ${message.code ?? "?"}]`); }
        if (message.type === "error") terminal.writeln(`\r\n${message.message ?? tr("终端启动失败", "Terminal could not start")}`);
      } catch { /* ignore malformed messages */ }
    };
    socket.onclose = () => { setConnected(false); terminal.writeln(`\r\n[${tr("连接已断开", "Disconnected")}]`); };
    socket.onerror = () => terminal.writeln(`\r\n[${tr("终端连接失败", "Terminal connection failed")}]`);
    return () => { observer.disconnect(); input.dispose(); socket.close(); socketRef.current = null; terminal.dispose(); };
  }, [threadId, restart]);

  return <section aria-label={tr("终端", "Terminal")} className={placement === "bottom" ? "flex h-[min(18rem,40%)] min-h-28 shrink-0 flex-col border-t bg-(--terminal-background) text-(--terminal-foreground)" : "absolute bottom-0 right-0 top-[var(--workspace-topbar-height)] z-30 flex w-[min(42rem,100%)] min-h-0 flex-col border-l bg-(--terminal-background) text-(--terminal-foreground) shadow-lg"}>
    <div className="flex h-10 shrink-0 items-center gap-1 border-b px-3 text-xs">{placement === "right" && <button type="button" onClick={onShowChanges} className="rounded-md px-2 py-1 text-muted-foreground hover:bg-accent">{tr("变更", "Changes")}</button>}<span className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 font-medium" aria-current="page"><TerminalIcon className="size-3.5" />{tr("终端", "Terminal")}</span><span className="flex-1" />{exited || !connected ? <Button variant="ghost" size="xs" onClick={() => setRestart((value) => value + 1)}>{exited ? tr("重新打开", "Restart") : tr("重新连接", "Reconnect")}</Button> : <Button variant="ghost-muted" size="icon-xs" disabled={!connected} aria-label={tr("结束终端", "End terminal")} onClick={() => socketRef.current?.send(JSON.stringify({ type: "terminate" }))}><SquareIcon /></Button>}<Button variant="ghost-muted" size="icon-xs" onClick={onClose} aria-label={tr("关闭终端面板", "Close terminal panel")}><XIcon /></Button></div>
    <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden px-2 py-1" />
  </section>;
}

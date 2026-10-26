/**
 * WS 传输层：自动重连（指数退避 250ms→30s 封顶，对齐 t3code client-runtime
 * rpc/client.ts 的重试策略）+ 重连后按 afterSequence 增量续传。
 */
import {
  domainEventThreadId,
  upsertTurnItem,
  type ClientMessage,
  type Command,
  type CommandId,
  type DomainEvent,
  type ServerMessage,
  type ThreadId,
  type TurnItem,
} from "@pi-web/protocol";
import { useAppStore } from "./store.ts";

export type TransportListener = (message: ServerMessage) => void;

export class Transport {
  #socket: WebSocket | null = null;
  #retryMs = 250;
  #retryTimer: ReturnType<typeof setTimeout> | null = null;
  #listeners = new Set<TransportListener>();
  #started = false;

  start(): void {
    if (this.#started) return;
    this.#started = true;
    this.#connect();
  }

  stop(): void {
    this.#started = false;
    if (this.#retryTimer !== null) {
      clearTimeout(this.#retryTimer);
      this.#retryTimer = null;
    }
    this.#socket?.close();
    this.#socket = null;
  }

  onMessage(listener: TransportListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  send(message: ClientMessage): void {
    if (this.#socket?.readyState === WebSocket.OPEN) {
      this.#socket.send(JSON.stringify(message));
    }
  }

  dispatch(command: Command): void {
    const commandId: CommandId = `cmd-${crypto.randomUUID()}`;
    this.send({ kind: "dispatch", commandId, command });
  }

  /** 订阅线程；本地已有投影则携带游标增量续传（t3code afterSequence 模式） */
  subscribe(threadId: ThreadId): void {
    const applied = useAppStore.getState().byThread[threadId];
    const afterSequence =
      applied !== undefined && applied.sequence > 0 && applied.status === "live"
        ? applied.sequence
        : undefined;
    this.send({
      kind: "subscribe",
      threadId,
      ...(afterSequence !== undefined ? { afterSequence } : {}),
    });
  }

  unsubscribe(threadId: ThreadId): void {
    this.send({ kind: "unsubscribe", threadId });
  }

  #connect(): void {
    if (!this.#started) return;
    const store = useAppStore.getState();
    store.setConnection("connecting");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    this.#socket = socket;

    socket.onopen = () => {
      this.#retryMs = 250;
      const s = useAppStore.getState();
      s.setConnection("online");
      this.send({ kind: "subscribe-threads" });
      const active = s.activeThreadId;
      if (active) this.subscribe(active);
    };

    socket.onmessage = (raw) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(String(raw.data)) as ServerMessage;
      } catch {
        return;
      }
      this.#handle(message);
      for (const listener of this.#listeners) listener(message);
    };

    socket.onclose = () => {
      this.#socket = null;
      const s = useAppStore.getState();
      s.setConnection("offline");
      if (!this.#started) return;
      this.#retryMs = Math.min(this.#retryMs * 2, 30_000);
      this.#retryTimer = setTimeout(() => this.#connect(), this.#retryMs);
    };

    socket.onerror = () => socket.close();
  }

  #handle(message: ServerMessage): void {
    const store = useAppStore.getState();
    switch (message.kind) {
      case "threads":
        store.setThreads(message.threads);
        if (message.projects && message.projects.length > 0) {
          store.setProjects(message.projects);
        }
        return;
      case "projects":
        store.setProjects(message.projects);
        return;
      case "snapshot":
        store.applySnapshot(message.threadId, message.snapshotSequence, message.items);
        store.setThreadStatus(message.threadId, "live");
        return;
      case "event": {
        store.applyEvent(
          domainEventThreadId(message.event),
          message.sequence,
          message.event.type,
          () => reduceEvent(message.event),
        );
        return;
      }
      case "unknown-event":
        // 前向兼容：未知事件只推进游标（t3code 同款行为）
        return;
      default:
        return;
    }
  }
}

function reduceEvent(event: DomainEvent): TurnItem[] | null {
  const store = useAppStore.getState();
  switch (event.type) {
    case "thread.created": {
      store.setThreads([event.thread, ...store.threads.filter((t) => t.id !== event.thread.id)]);
      if (event.thread.cwd && !store.projects.includes(event.thread.cwd)) {
        store.setProjects([...store.projects, event.thread.cwd]);
      }
      if (store.newThreadRequested) {
        useAppStore.setState({
          newThreadRequested: false,
          activeThreadId: event.thread.id,
          activeUtilityPage: null,
        });
      }
      return null;
    }
    case "thread.updated":
      store.setThreads(
        store.threads.map((t) => (t.id === event.thread.id ? event.thread : t)),
      );
      return null;
    case "thread.deleted":
      store.setThreads(store.threads.filter((t) => t.id !== event.threadId));
      return null;
    case "turn_item.updated": {
      const state = store.byThread[event.threadId];
      return upsertTurnItem(state?.items ?? [], event.turnItem);
    }
    default:
      return null;
  }
}

export const transport = new Transport();

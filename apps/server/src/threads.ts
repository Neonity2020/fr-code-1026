/**
 * 线程存储：事件溯源模型（对齐 t3code orchestration-v2 的核心不变量）——
 * 领域事件按全局递增 sequence 追加；UI 状态 = 事件折叠出的投影；
 * 订阅者可携带 afterSequence 增量续传。
 * v1 持久化为每线程一个 JSONL 文件，重启时重放折叠。
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  applyTurnItemPreview,
  firstLineTitle,
  type DomainEvent,
  type StoredEvent,
  type ThreadId,
  type ThreadSummary,
  type TurnItem,
} from "@pi-web/protocol";
import type { PiThreadStorePort } from "@pi-web/provider-pi";

export interface ThreadProjection {
  summary: ThreadSummary;
  /** itemId → item（按 ordinal 排序渲染） */
  items: Map<string, TurnItem>;
  /** 已持久化事件（含 thread.created），支持 afterSequence 回放 */
  events: StoredEvent[];
  nextSequence: number;
}

export interface ThreadSubscriber {
  sendEvent(stored: StoredEvent): void;
  sendSnapshot(projection: ThreadProjection): void;
  sendSynchronized(threadId: ThreadId): void;
  sendThreads(threads: ThreadSummary[], projects: string[]): void;
  sendProjects?(projects: string[]): void;
}

export class ThreadStore implements PiThreadStorePort {
  readonly #threads = new Map<ThreadId, ThreadProjection>();
  readonly #threadSubscribers = new Map<ThreadId, Set<ThreadSubscriber>>();
  readonly #listSubscribers = new Set<ThreadSubscriber>();
  readonly #projects = new Set<string>();
  readonly #dataDir: string;
  readonly #defaultCwd: string;

  constructor(dataDir: string, defaultCwd: string = process.cwd()) {
    this.#dataDir = dataDir;
    this.#defaultCwd = defaultCwd;
    fs.mkdirSync(dataDir, { recursive: true });
    this.#projects.add(defaultCwd);
    this.#loadProjectsFromDisk();
    this.#loadFromDisk();
  }

  #loadProjectsFromDisk(): void {
    const file = path.join(this.#dataDir, "projects.json");
    if (!fs.existsSync(file)) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === "string" && item.trim().length > 0) {
            this.#projects.add(item.trim());
          }
        }
      }
    } catch {
      /* ignore corrupt projects.json */
    }
  }

  #persistProjects(): void {
    const file = path.join(this.#dataDir, "projects.json");
    fs.writeFile(file, JSON.stringify([...this.#projects], null, 2), () => {});
  }

  #loadFromDisk(): void {
    for (const entry of fs.readdirSync(this.#dataDir)) {
      if (!entry.endsWith(".events.jsonl")) continue;
      const threadId = entry.replace(/\.events\.jsonl$/, "");
      const raw = fs.readFileSync(path.join(this.#dataDir, entry), "utf8");
      const projection = this.#blankProjection(threadId);
      for (const line of raw.split("\n")) {
        if (line.trim().length === 0) continue;
        try {
          const stored = JSON.parse(line) as StoredEvent;
          projection.events.push(stored);
          this.#fold(projection, stored.event);
        } catch {
          // 跳过损坏行（如进程中断导致的半行写入）
        }
      }
      projection.nextSequence =
        projection.events.reduce((max, item) => Math.max(max, item.sequence), 0) + 1;
      if (projection.summary.status === "running" || projection.summary.status === "waiting") {
        // 重启后 pi 进程已不在：标记为 idle，由 reconcile 逻辑兜底
        projection.summary = { ...projection.summary, status: "idle" };
      }
      if (projection.summary.cwd) {
        this.#projects.add(projection.summary.cwd);
      }
      this.#threads.set(threadId, projection);
    }
  }

  #persist(threadId: ThreadId, stored: StoredEvent): void {
    fs.appendFile(
      path.join(this.#dataDir, `${threadId}.events.jsonl`),
      `${JSON.stringify(stored)}\n`,
      () => {},
    );
  }

  #blankProjection(threadId: ThreadId): ThreadProjection {
    return {
      summary: {
        id: threadId,
        title: "New thread",
        cwd: this.#defaultCwd,
        status: "idle",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      items: new Map(),
      events: [],
      nextSequence: 1,
    };
  }

  /** 提交事件：分配 sequence → 持久化 → 折叠进投影 → 推送订阅者 */
  emit(threadId: ThreadId, event: DomainEvent): StoredEvent {
    let projection = this.#threads.get(threadId);
    if (!projection) {
      if (event.type !== "thread.created") {
        throw new Error(`Unknown thread ${threadId}`);
      }
      projection = this.#blankProjection(threadId);
      this.#threads.set(threadId, projection);
    }
    const stored: StoredEvent = { sequence: projection.nextSequence, event };
    projection.nextSequence += 1;
    projection.events.push(stored);
    this.#fold(projection, event);
    this.#persist(threadId, stored);

    for (const subscriber of this.#threadSubscribers.get(threadId) ?? []) {
      subscriber.sendEvent(stored);
    }
    if (event.type !== "turn_item.updated") {
      this.#broadcastList();
    }
    return stored;
  }

  #broadcastList(): void {
    const threads = this.listThreads();
    const projects = this.listProjects();
    for (const subscriber of this.#listSubscribers) {
      subscriber.sendThreads(threads, projects);
    }
  }

  #fold(projection: ThreadProjection, event: DomainEvent): void {
    switch (event.type) {
      case "thread.created":
      case "thread.updated":
        projection.summary = event.thread;
        if (event.thread.cwd) {
          this.#projects.add(event.thread.cwd);
        }
        break;
      case "thread.deleted":
        this.#threads.delete(projection.summary.id);
        break;
      case "turn_item.updated":
        projection.items.set(event.turnItem.id, event.turnItem);
        projection.summary = applyTurnItemPreview(projection.summary, event.turnItem);
        break;
    }
  }

  listThreads(): ThreadSummary[] {
    const now = Date.now();
    for (const projection of this.#threads.values()) {
      const snoozedUntil = projection.summary.snoozedUntil;
      if (typeof snoozedUntil === "number" && snoozedUntil <= now) {
        projection.summary = {
          ...projection.summary,
          snoozedUntil: null,
          wokeAt: snoozedUntil,
        };
      }
    }
    return [...this.#threads.values()]
      .map((projection) => projection.summary)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  listProjects(): string[] {
    const set = new Set<string>(this.#projects);
    for (const projection of this.#threads.values()) {
      if (projection.summary.cwd) set.add(projection.summary.cwd);
    }
    return [...set];
  }

  addProject(cwd: string): string[] {
    const normalized = cwd.trim();
    if (normalized.length > 0) {
      this.#projects.add(normalized);
      this.#persistProjects();
      const projects = this.listProjects();
      for (const subscriber of this.#listSubscribers) {
        subscriber.sendProjects?.(projects);
        subscriber.sendThreads(this.listThreads(), projects);
      }
    }
    return this.listProjects();
  }

  removeProject(cwd: string): string[] {
    const normalized = cwd.trim();
    if (normalized.length > 0 && normalized !== this.#defaultCwd) {
      this.#projects.delete(normalized);
      this.#persistProjects();
      const projects = this.listProjects();
      for (const subscriber of this.#listSubscribers) {
        subscriber.sendProjects?.(projects);
        subscriber.sendThreads(this.listThreads(), projects);
      }
    }
    return this.listProjects();
  }

  get(threadId: ThreadId): ThreadProjection | undefined {
    return this.#threads.get(threadId);
  }

  createThread(cwd: string, title?: string): ThreadSummary {
    const resolvedCwd = cwd.trim() || this.#defaultCwd;
    this.#projects.add(resolvedCwd);
    this.#persistProjects();
    const threadId = `th-${cryptoRandomId()}`;
    const summary: ThreadSummary = {
      id: threadId,
      title: title?.trim() || firstLineTitle(resolvedCwd),
      cwd: resolvedCwd,
      status: "idle",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.emit(threadId, { type: "thread.created", thread: summary });
    return summary;
  }

  deleteThread(threadId: ThreadId): boolean {
    if (!this.#threads.has(threadId)) return false;
    this.emit(threadId, { type: "thread.deleted", threadId });
    this.#threads.delete(threadId);
    this.#threadSubscribers.delete(threadId);
    try {
      fs.rmSync(path.join(this.#dataDir, `${threadId}.events.jsonl`));
    } catch {
      /* file may not exist yet */
    }
    return true;
  }

  subscribe(threadId: ThreadId, subscriber: ThreadSubscriber, afterSequence?: number): boolean {
    const projection = this.#threads.get(threadId);
    if (!projection) return false;
    const canResume =
      afterSequence !== undefined &&
      afterSequence >= 0 &&
      afterSequence < projection.nextSequence;
    if (canResume) {
      for (const stored of projection.events) {
        if (stored.sequence > afterSequence) subscriber.sendEvent(stored);
      }
    } else {
      subscriber.sendSnapshot(projection);
    }
    let set = this.#threadSubscribers.get(threadId);
    if (!set) {
      set = new Set();
      this.#threadSubscribers.set(threadId, set);
    }
    set.add(subscriber);
    subscriber.sendSynchronized(threadId);
    return true;
  }

  unsubscribe(threadId: ThreadId, subscriber: ThreadSubscriber): void {
    this.#threadSubscribers.get(threadId)?.delete(subscriber);
  }

  subscribeThreads(subscriber: ThreadSubscriber): void {
    this.#listSubscribers.add(subscriber);
    subscriber.sendThreads(this.listThreads(), this.listProjects());
  }

  unsubscribeThreads(subscriber: ThreadSubscriber): void {
    this.#listSubscribers.delete(subscriber);
  }

  updateSummary(
    threadId: ThreadId,
    patch: Partial<ThreadSummary>,
    options?: { preserveUpdatedAt?: boolean },
  ): void {
    const projection = this.#threads.get(threadId);
    if (!projection) return;
    this.emit(threadId, {
      type: "thread.updated",
      thread: {
        ...projection.summary,
        ...patch,
        updatedAt: options?.preserveUpdatedAt ? projection.summary.updatedAt : Date.now(),
      },
    });
  }
}

function cryptoRandomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

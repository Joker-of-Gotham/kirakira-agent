import { homedir } from "node:os";
import { join } from "node:path";
import type { EventFilter } from "@kirakira/event-store";
import type { RunEvent } from "@kirakira/event-store";
import { ulid } from "ulid";
import WebSocket from "ws";
import { parseServerMessage } from "../server/protocol.js";
import type { ServerMessage } from "../server/protocol.js";
import type { RunStateSnapshot } from "../snapshot.js";

const defaultSocketPath = () => join(homedir(), ".kirakira-agent", "daemon.sock");

export class EventSubscriber {
  private ws: WebSocket | null = null;
  private queue: RunEvent[] = [];
  private waiters: Array<(ev: RunEvent | undefined) => void> = [];
  private closed = false;
  private lastSeq = 0;
  private subId: string | null = null;

  private push(ev: RunEvent): void {
    const w = this.waiters.shift();
    if (w) w(ev);
    else this.queue.push(ev);
  }

  private async nextEvent(): Promise<RunEvent | undefined> {
    const q = this.queue.shift();
    if (q) return q;
    if (this.closed) return undefined;
    return await new Promise<RunEvent | undefined>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  async connect(socketPath?: string): Promise<void> {
    const path = socketPath ?? defaultSocketPath();
    const url = `ws+unix:${path}:/`;
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.once("open", () => resolve());
      ws.once("error", (e) => reject(e instanceof Error ? e : new Error(String(e))));
      ws.on("message", (buf) => {
        const msg = parseServerMessage(String(buf));
        if (!msg) return;
        this.handleServerMessage(msg);
      });
      ws.on("close", () => {
        this.closed = true;
        for (const w of this.waiters) w(undefined);
        this.waiters = [];
      });
    });
  }

  private handleServerMessage(msg: ServerMessage): void {
    if (msg.type === "event") {
      this.push(msg.event);
      return;
    }
    if (msg.type === "subscribed") {
      this.subId = msg.subscriptionId;
      if (msg.replayedThroughSeq !== undefined) {
        this.lastSeq = msg.replayedThroughSeq;
      }
    }
  }

  async *subscribe(runId?: string, filter?: EventFilter): AsyncGenerator<RunEvent> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Subscriber not connected");
    }
    const messageId = ulid();
    this.ws.send(
      JSON.stringify({
        type: "subscribe",
        runId,
        filter,
        afterSeq: this.lastSeq > 0 ? this.lastSeq : undefined,
        messageId,
      }),
    );
    while (!this.closed) {
      const ev = await this.nextEvent();
      if (ev === undefined) break;
      yield ev;
    }
  }

  async *subscribeSnapshot(runId: string): AsyncGenerator<RunStateSnapshot> {
    for await (const ev of this.subscribe(runId, {
      kinds: ["graph.normalized", "checkpoint.saved", "run.started"],
    })) {
      if (ev.kind === "graph.normalized") {
        yield {
          runId: ev.runId,
          status: "running",
          graph: {
            totalNodes: Number(ev.payload.totalNodes ?? 0),
            completedNodes: Number(ev.payload.completedNodes ?? 0),
            runningNodes: Number(ev.payload.runningNodes ?? 0),
            failedNodes: Number(ev.payload.failedNodes ?? 0),
          },
          activeWorkers: [],
          pendingApprovals: [],
          costSummary: { totalCostUsd: 0, totalTokens: 0 },
        };
      }
      if (ev.kind === "checkpoint.saved") {
        const cid =
          typeof ev.payload.checkpointId === "string" ? ev.payload.checkpointId : "";
        yield {
          runId: ev.runId,
          status: "running",
          checkpointId: cid,
          activeWorkers: [],
          pendingApprovals: [],
          costSummary: { totalCostUsd: 0, totalTokens: 0 },
        };
      }
    }
  }

  disconnect(): void {
    if (this.subId && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "unsubscribe",
          subscriptionId: this.subId,
          messageId: ulid(),
        }),
      );
    }
    this.closed = true;
    this.ws?.close();
    this.ws = null;
  }
}

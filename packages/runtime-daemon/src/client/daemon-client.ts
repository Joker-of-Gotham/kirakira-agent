import { homedir } from "node:os";
import { join } from "node:path";
import type {
  ControlMessage,
  EventFilter,
  RunStateSnapshot,
  RuntimeRequestTracker,
  RuntimeRunMode,
  RuntimeRunOptions,
} from "@kirakira/runtime-contracts";
import { RuntimeRequestTracker as RuntimeRequestTrackerImpl } from "@kirakira/runtime-contracts";
import { ulid } from "ulid";
import WebSocket from "ws";
import { parseServerMessage } from "../server/protocol.js";
import type { ServerMessage } from "../server/protocol.js";

type RunMode = RuntimeRunMode;

const defaultSocketPath = () => join(homedir(), ".kirakira-agent", "daemon.sock");

export interface SubscribeToRunOptions {
  afterSeq?: number;
  filter?: EventFilter;
  messageId?: string;
}

export interface UnsubscribeOptions {
  messageId?: string;
}

/** Construct a typed ControlMessage from inline object literal for concise message building. */
function ctl(m: Record<string, unknown>): ControlMessage {
  return m as ControlMessage;
}

export class DaemonClient {
  private ws: WebSocket | null = null;
  private readonly pending: RuntimeRequestTracker = new RuntimeRequestTrackerImpl({
    timeoutMs: 60_000,
    timeoutMessage: () => "Request timeout",
  });
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manualClose = false;
  private lastSocketPath = defaultSocketPath();
  private lastRunId: string | null = null;
  private readonly messageHandlers = new Set<(m: ServerMessage) => void>();

  onMessage(handler: (m: ServerMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  async connect(socketPath?: string): Promise<void> {
    this.manualClose = false;
    this.lastSocketPath = socketPath ?? defaultSocketPath();
    await this.openOnce(this.lastSocketPath);
  }

  /**
   * Subscribe to run events on the connected socket. Incoming `event` frames are delivered
   * to handlers registered with {@link onMessage} (and `subscribed` / server errors likewise).
   */
  subscribeToRun(
    runId: string,
    options?: SubscribeToRunOptions,
  ): string {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }
    const messageId = options?.messageId ?? ulid();
    ws.send(
      JSON.stringify({
        type: "subscribe",
        runId,
        filter: options?.filter,
        afterSeq: options?.afterSeq,
        messageId,
      }),
    );
    return messageId;
  }

  unsubscribe(subscriptionId: string, options?: UnsubscribeOptions): string {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }
    const messageId = options?.messageId ?? ulid();
    ws.send(
      JSON.stringify({
        type: "unsubscribe",
        subscriptionId,
        messageId,
      }),
    );
    return messageId;
  }

  private async openOnce(socketPath: string): Promise<void> {
    const url = `ws+unix:${socketPath}:/`;
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.once("open", () => {
        this.reconnectAttempts = 0;
        resolve();
      });
      ws.once("error", (err) => {
        reject(err instanceof Error ? err : new Error(String(err)));
      });
      ws.on("message", (data) => {
        this.dispatchIncoming(String(data));
      });
      ws.on("close", () => {
        if (!this.manualClose) {
          this.scheduleReconnect();
        }
      });
    });
  }

  private scheduleReconnect(): void {
    if (this.manualClose) return;
    this.reconnectAttempts += 1;
    const delay = Math.min(30_000, 500 * 2 ** Math.min(this.reconnectAttempts, 8));
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      void this.openOnce(this.lastSocketPath).catch(() => {
        this.scheduleReconnect();
      });
    }, delay);
    this.reconnectTimer.unref?.();
  }

  private dispatchIncoming(raw: string): void {
    const msg = parseServerMessage(raw);
    if (!msg) return;
    for (const h of this.messageHandlers) {
      try {
        h(msg);
      } catch {
        /* ignore handler errors */
      }
    }
    this.pending.handleServerMessage(msg);
  }

  disconnect(): void {
    this.manualClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.pending.rejectAll(new Error("disconnected"));
  }

  private rpcResult(body: Record<string, unknown>, timeoutMs = 60_000): Promise<unknown> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("WebSocket not connected"));
    }
    const messageId = ulid();
    const msgWithId = { ...body, messageId };
    const request = this.pending.track(messageId, String(body.type ?? "request"), timeoutMs);
    try {
      ws.send(JSON.stringify(msgWithId));
    } catch (err) {
      this.pending.reject(
        messageId,
        err instanceof Error ? err : new Error(String(err)),
      );
    }
    return request;
  }

  async submitPrompt(
    prompt: string,
    mode: RunMode,
    options?: RuntimeRunOptions,
  ): Promise<string> {
    const result = await this.rpcResult({
      type: "control",
      message:
        options !== undefined
          ? { type: "submit", prompt, mode, options }
          : { type: "submit", prompt, mode },
    });
    const runId = (result as { runId?: string } | null)?.runId;
    if (typeof runId !== "string") {
      throw new Error("Invalid submit response");
    }
    this.lastRunId = runId;
    return runId;
  }

  async steer(instruction: string, priority?: "high" | "normal"): Promise<void> {
    if (!this.lastRunId) throw new Error("No active run");
    await this.rpcResult({
      type: "control",
      message: ctl(
        priority !== undefined
          ? {
              type: "steer",
              runId: this.lastRunId,
              instruction,
              priority,
            }
          : {
              type: "steer",
              runId: this.lastRunId,
              instruction,
            },
      ),
    });
  }

  async approve(
    ticketId: string,
    decision: "approve" | "reject",
    reason?: string,
    runId = this.lastRunId,
  ): Promise<void> {
    if (!runId) throw new Error("No active run");
    await this.rpcResult({
      type: "control",
      message: ctl(
        reason !== undefined
          ? {
              type: "approve",
              runId,
              ticketId,
              decision,
              reason,
            }
          : {
              type: "approve",
              runId,
              ticketId,
              decision,
            },
      ),
    });
  }

  async drain(): Promise<void> {
    await this.rpcResult({
      type: "control",
      message: { type: "drain" },
    });
  }

  async cancel(runId: string, reason?: string): Promise<void> {
    await this.rpcResult({
      type: "control",
      message: ctl(
        reason !== undefined
          ? { type: "cancel", runId, reason }
          : { type: "cancel", runId },
      ),
    });
  }

  async resume(runId: string, fromCheckpoint?: string): Promise<void> {
    await this.rpcResult({
      type: "control",
      message: ctl(
        fromCheckpoint !== undefined
          ? { type: "resume", runId, fromCheckpoint }
          : { type: "resume", runId },
      ),
    });
  }

  async getState(runId: string): Promise<RunStateSnapshot> {
    return (await this.rpcResult({
      type: "get_state",
      runId,
      messageId: ulid(),
    })) as RunStateSnapshot;
  }

  async enqueuePrompt(prompt: string, priority?: number): Promise<void> {
    await this.rpcResult({
      type: "control",
      message: ctl(
        priority !== undefined ? { type: "enqueue", prompt, priority } : { type: "enqueue", prompt },
      ),
    });
  }

  async provideInput(runId: string, interruptId: string, data: unknown): Promise<void> {
    await this.rpcResult({
      type: "control",
      message: ctl({ type: "provide_input", runId, interruptId, data }),
    });
  }

  async inspectThread(runId: string, includeEvents?: boolean): Promise<RunStateSnapshot> {
    const result = await this.rpcResult({
      type: "control",
      message: ctl(
        includeEvents !== undefined
          ? { type: "inspect", runId, includeEvents }
          : { type: "inspect", runId },
      ),
    });
    const snap = result as RunStateSnapshot | null;
    if (!snap || typeof snap.runId !== "string") {
      throw new Error("Invalid inspect response");
    }
    return snap;
  }
}

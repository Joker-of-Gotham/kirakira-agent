import { ulid } from "ulid";
import WebSocket, { type RawData, type WebSocketServer } from "ws";
import type { ClientMessage, ServerMessage } from "./protocol.js";
import { parseClientMessage, safeJsonStringify } from "./protocol.js";

interface RuntimeClientSocket extends WebSocket {
  clientId: string;
  isAlive: boolean;
}

export interface RuntimeSocketServerOptions {
  onMessage(clientId: string, message: ClientMessage): Promise<void>;
  onConnect?(clientId: string): void;
  onDisconnect?(clientId: string): void;
  heartbeatMs?: number;
}

export class RuntimeSocketHub {
  private readonly clients = new Map<string, RuntimeClientSocket>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly heartbeatMs: number;

  constructor(private readonly opts: RuntimeSocketServerOptions) {
    this.heartbeatMs = opts.heartbeatMs ?? 25_000;
  }

  attach(wss: WebSocketServer): void {
    wss.on("connection", (ws) => {
      this.register(ws as RuntimeClientSocket);
    });
    if (this.heartbeatMs > 0 && !this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(() => {
        for (const sock of this.clients.values()) {
          if (!sock.isAlive) {
            sock.terminate();
            continue;
          }
          sock.isAlive = false;
          sock.ping();
        }
      }, this.heartbeatMs);
    }
  }

  private register(conn: RuntimeClientSocket): void {
    const clientId = ulid();
    conn.clientId = clientId;
    conn.isAlive = true;
    this.clients.set(clientId, conn);
    this.opts.onConnect?.(clientId);
    conn.on("pong", () => {
      conn.isAlive = true;
    });
    conn.on("message", (data) => {
      void this.handleSocketData(conn, data);
    });
    conn.on("close", () => {
      this.unregister(clientId);
    });
    conn.on("error", () => {
      this.unregister(clientId);
    });
  }

  private unregister(clientId: string): void {
    if (!this.clients.delete(clientId)) return;
    this.opts.onDisconnect?.(clientId);
  }

  private async handleSocketData(
    conn: RuntimeClientSocket,
    data: RawData,
  ): Promise<void> {
    let raw: unknown;
    try {
      raw = JSON.parse(String(data));
    } catch {
      this.sendTo(conn.clientId, {
        type: "error",
        code: "invalid_json",
        message: "Message body is not valid JSON",
      });
      return;
    }
    const msg = parseClientMessage(raw);
    if (!msg) {
      this.sendTo(conn.clientId, {
        type: "error",
        code: "invalid_message",
        message: "Unknown or malformed client message",
        details: raw,
      });
      return;
    }
    try {
      await this.opts.onMessage(conn.clientId, msg);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.sendTo(conn.clientId, {
        type: "error",
        code: "handler_error",
        message,
      });
    }
  }

  broadcast(message: ServerMessage): void {
    const line = safeJsonStringify(message);
    for (const ws of this.clients.values()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(line);
    }
  }

  sendTo(clientId: string, message: ServerMessage): void {
    const ws = this.clients.get(clientId);
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(safeJsonStringify(message));
  }

  closeAllClients(): void {
    for (const ws of this.clients.values()) {
      ws.close(1001, "server shutdown");
    }
    this.clients.clear();
  }

  stopHeartbeat(): void {
    if (!this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
}

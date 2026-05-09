import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { createServer } from "node:http";
import { dirname } from "node:path";
import { ulid } from "ulid";
import WebSocket, { WebSocketServer } from "ws";
import type { ClientMessage } from "./protocol.js";
import { parseClientMessage, safeJsonStringify } from "./protocol.js";
import type { ServerMessage } from "./protocol.js";

interface ClientSocket extends WebSocket {
  clientId: string;
  isAlive: boolean;
}

export interface UdsServerOptions {
  onMessage(clientId: string, message: ClientMessage): Promise<void>;
  onConnect?(clientId: string): void;
  onDisconnect?(clientId: string): void;
  heartbeatMs?: number;
}

export class UdsServer {
  private server: ReturnType<typeof createServer> | null = null;
  private wss: WebSocketServer | null = null;
  private readonly clients = new Map<string, ClientSocket>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly opts: UdsServerOptions;
  private readonly heartbeatMs: number;

  constructor(options: UdsServerOptions) {
    this.opts = options;
    this.heartbeatMs = options.heartbeatMs ?? 25_000;
  }

  async start(socketPath: string): Promise<void> {
    if (this.server) {
      throw new Error("UdsServer already listening");
    }
    const dir = dirname(socketPath);
    mkdirSync(dir, { recursive: true });
    if (existsSync(socketPath)) {
      try {
        unlinkSync(socketPath);
      } catch {
        throw new Error(`Unable to remove stale socket at ${socketPath}`);
      }
    }
    const server = createServer();
    const wss = new WebSocketServer({ server });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, () => {
        server.off("error", reject);
        resolve();
      });
    });
    this.server = server;
    this.wss = wss;
    wss.on("connection", (ws) => {
      const conn = ws as ClientSocket;
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
        this.clients.delete(clientId);
        this.opts.onDisconnect?.(clientId);
      });
      conn.on("error", () => {
        this.clients.delete(clientId);
        this.opts.onDisconnect?.(clientId);
      });
    });
    if (this.heartbeatMs > 0) {
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

  private async handleSocketData(conn: ClientSocket, data: WebSocket.RawData): Promise<void> {
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

  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    await new Promise<void>((resolve) => {
      if (this.wss) {
        this.wss.close(() => resolve());
      } else {
        resolve();
      }
    });
    this.wss = null;
    await new Promise<void>((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    this.server = null;
  }
}

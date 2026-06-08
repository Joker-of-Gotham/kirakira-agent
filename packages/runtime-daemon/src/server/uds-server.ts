import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { createServer } from "node:http";
import { dirname } from "node:path";
import { WebSocketServer } from "ws";
import type { ServerMessage } from "./protocol.js";
import { RuntimeSocketHub, type RuntimeSocketServerOptions } from "./runtime-socket.js";

export type UdsServerOptions = RuntimeSocketServerOptions;

export class UdsServer {
  private server: ReturnType<typeof createServer> | null = null;
  private wss: WebSocketServer | null = null;
  private readonly hub: RuntimeSocketHub;

  constructor(options: UdsServerOptions) {
    this.hub = new RuntimeSocketHub(options);
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
    const wss = new WebSocketServer({ server, perMessageDeflate: false });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, () => {
        server.off("error", reject);
        resolve();
      });
    });
    this.server = server;
    this.wss = wss;
    this.hub.attach(wss);
  }

  broadcast(message: ServerMessage): void {
    this.hub.broadcast(message);
  }

  sendTo(clientId: string, message: ServerMessage): void {
    this.hub.sendTo(clientId, message);
  }

  closeAllClients(): void {
    this.hub.closeAllClients();
  }

  async stop(): Promise<void> {
    this.hub.stopHeartbeat();
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

import { createServer, type IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";
import type { ServerMessage } from "./protocol.js";
import { RuntimeSocketHub, type RuntimeSocketServerOptions } from "./runtime-socket.js";

export const DEFAULT_BROWSER_GATEWAY_HOST = "127.0.0.1";
export const DEFAULT_BROWSER_GATEWAY_PORT = 17373;
export const DEFAULT_BROWSER_GATEWAY_PATH = "/runtime";

export interface BrowserGatewayConfig {
  enabled?: boolean;
  host?: string;
  port?: number;
  path?: string;
  token?: string;
  allowedOrigins?: string[];
}

export interface BrowserGatewayListenInfo {
  host: string;
  port: number;
  path: string;
  url: string;
  tokenRequired: boolean;
}

export type BrowserGatewayServerOptions = RuntimeSocketServerOptions;

const normalizePath = (path: string): string => (path.startsWith("/") ? path : `/${path}`);

const isLoopbackHost = (host: string): boolean =>
  host === "127.0.0.1" ||
  host === "localhost" ||
  host === "::1" ||
  host === "[::1]";

const originHost = (origin: string): string | null => {
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
};

const isAllowedOrigin = (
  origin: string | undefined,
  allowedOrigins: readonly string[] | undefined,
): boolean => {
  if (!origin) return false;
  if (allowedOrigins && allowedOrigins.length > 0) return allowedOrigins.includes(origin);
  const host = originHost(origin);
  return host !== null && isLoopbackHost(host);
};

const hasToken = (request: IncomingMessage, token: string | undefined): boolean => {
  if (!token) return true;
  const rawUrl = request.url ?? "/";
  const parsed = new URL(rawUrl, "http://127.0.0.1");
  return parsed.searchParams.get("token") === token;
};

const rejectUpgrade = (socket: Duplex, status: number, reason: string): void => {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
};

export class BrowserGatewayServer {
  private server: ReturnType<typeof createServer> | null = null;
  private wss: WebSocketServer | null = null;
  private readonly hub: RuntimeSocketHub;
  private listenInfo: BrowserGatewayListenInfo | null = null;

  constructor(options: BrowserGatewayServerOptions) {
    this.hub = new RuntimeSocketHub(options);
  }

  async start(config: BrowserGatewayConfig = {}): Promise<BrowserGatewayListenInfo> {
    if (this.server) {
      throw new Error("BrowserGatewayServer already listening");
    }
    const host = config.host ?? DEFAULT_BROWSER_GATEWAY_HOST;
    const port = config.port ?? DEFAULT_BROWSER_GATEWAY_PORT;
    const path = normalizePath(config.path ?? DEFAULT_BROWSER_GATEWAY_PATH);
    if (!isLoopbackHost(host) && !config.token) {
      throw new Error("Browser gateway requires a token when binding outside loopback");
    }

    const server = createServer((request, response) => {
      if (request.method === "GET" && request.url === "/healthz") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true, transport: "browser-gateway" }));
        return;
      }
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
    });

    const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
    server.on("upgrade", (request, socket, head) => {
      const rawUrl = request.url ?? "/";
      const parsed = new URL(rawUrl, "http://127.0.0.1");
      if (parsed.pathname !== path) {
        rejectUpgrade(socket, 404, "Not Found");
        return;
      }
      if (!isAllowedOrigin(request.headers.origin, config.allowedOrigins)) {
        rejectUpgrade(socket, 403, "Forbidden");
        return;
      }
      if (!hasToken(request, config.token)) {
        rejectUpgrade(socket, 401, "Unauthorized");
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        server.off("error", reject);
        resolve();
      });
    });

    this.server = server;
    this.wss = wss;
    this.hub.attach(wss);
    const address = server.address();
    const actualPort =
      address && typeof address === "object" ? address.port : port;
    this.listenInfo = {
      host,
      port: actualPort,
      path,
      url: `ws://${host}:${actualPort}${path}`,
      tokenRequired: Boolean(config.token),
    };
    return this.listenInfo;
  }

  getListenInfo(): BrowserGatewayListenInfo | null {
    return this.listenInfo;
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
    this.closeAllClients();
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
    this.listenInfo = null;
  }
}

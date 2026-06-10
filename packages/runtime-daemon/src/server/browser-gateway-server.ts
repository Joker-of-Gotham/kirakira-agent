import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import {
  DEFAULT_BROWSER_GATEWAY_ENDPOINT,
  isLoopbackRuntimeHost,
  normalizeRuntimePath,
  renderRuntimeEndpoint,
  runtimeBrowserGatewayHealth,
  runtimeManifest,
  type RuntimeEndpointParts,
  type RuntimeManifest,
} from "@kirakira/runtime-contracts";
import { WebSocketServer } from "ws";
import type { ServerMessage } from "./protocol.js";
import { RuntimeSocketHub, type RuntimeSocketServerOptions } from "./runtime-socket.js";

export const DEFAULT_BROWSER_GATEWAY_HOST = DEFAULT_BROWSER_GATEWAY_ENDPOINT.host;
export const DEFAULT_BROWSER_GATEWAY_PORT = DEFAULT_BROWSER_GATEWAY_ENDPOINT.port;
export const DEFAULT_BROWSER_GATEWAY_PATH = DEFAULT_BROWSER_GATEWAY_ENDPOINT.path;

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
  endpoint: RuntimeEndpointParts;
  tokenRequired: boolean;
}

export interface BrowserGatewayServerOptions extends RuntimeSocketServerOptions {
  manifest?: () => RuntimeManifest;
}

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
  return host !== null && isLoopbackRuntimeHost(host);
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

const applyCorsHeaders = (
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: readonly string[] | undefined,
): void => {
  const origin = request.headers.origin;
  if (typeof origin !== "string" || !isAllowedOrigin(origin, allowedOrigins)) {
    return;
  }
  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("vary", "Origin");
};

const browserGatewayManifest = (
  endpoint: RuntimeEndpointParts,
  tokenRequired: boolean,
): RuntimeManifest =>
  runtimeManifest({
    browserGateway: {
      endpoint,
      tokenRequired,
    },
  });

export class BrowserGatewayServer {
  private server: ReturnType<typeof createServer> | null = null;
  private wss: WebSocketServer | null = null;
  private readonly hub: RuntimeSocketHub;
  private listenInfo: BrowserGatewayListenInfo | null = null;

  constructor(private readonly options: BrowserGatewayServerOptions) {
    this.hub = new RuntimeSocketHub(options);
  }

  private manifest(endpoint: RuntimeEndpointParts, tokenRequired: boolean): RuntimeManifest {
    return this.options.manifest?.() ?? browserGatewayManifest(endpoint, tokenRequired);
  }

  async start(config: BrowserGatewayConfig = {}): Promise<BrowserGatewayListenInfo> {
    if (this.server) {
      throw new Error("BrowserGatewayServer already listening");
    }
    const host = config.host ?? DEFAULT_BROWSER_GATEWAY_HOST;
    const port = config.port ?? DEFAULT_BROWSER_GATEWAY_PORT;
    const path = normalizeRuntimePath(config.path, DEFAULT_BROWSER_GATEWAY_PATH);
    if (!isLoopbackRuntimeHost(host) && !config.token) {
      throw new Error("Browser gateway requires a token when binding outside loopback");
    }

    const server = createServer((request, response) => {
      applyCorsHeaders(request, response, config.allowedOrigins);
      if (request.method === "OPTIONS" && (request.url === "/healthz" || request.url === "/manifest")) {
        response.writeHead(204, {
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "content-type",
        });
        response.end();
        return;
      }
      if (request.method === "GET" && request.url === "/healthz") {
        response.writeHead(200, { "content-type": "application/json" });
        const endpoint =
          this.listenInfo?.endpoint ??
          renderRuntimeEndpoint({
            protocol: DEFAULT_BROWSER_GATEWAY_ENDPOINT.protocol,
            host,
            port,
            path,
          });
        const manifest = this.manifest(endpoint, Boolean(config.token));
        response.end(
          JSON.stringify(
            runtimeBrowserGatewayHealth({
              endpoint,
              tokenRequired: Boolean(config.token),
              manifest,
            }),
          ),
        );
        return;
      }
      if (request.method === "GET" && request.url === "/manifest") {
        response.writeHead(200, { "content-type": "application/json" });
        const endpoint =
          this.listenInfo?.endpoint ??
          renderRuntimeEndpoint({
            protocol: DEFAULT_BROWSER_GATEWAY_ENDPOINT.protocol,
            host,
            port,
            path,
          });
        response.end(JSON.stringify(this.manifest(endpoint, Boolean(config.token))));
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
    const endpoint = renderRuntimeEndpoint({
      protocol: DEFAULT_BROWSER_GATEWAY_ENDPOINT.protocol,
      host,
      port: actualPort,
      path,
    });
    this.listenInfo = {
      host,
      port: actualPort,
      path,
      url: endpoint.url,
      endpoint,
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

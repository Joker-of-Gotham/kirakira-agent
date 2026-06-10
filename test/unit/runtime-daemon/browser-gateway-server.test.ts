import { describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import {
  BrowserGatewayServer,
  type BrowserGatewayListenInfo,
} from "../../../packages/runtime-daemon/src/index.js";
import {
  DEFAULT_BROWSER_GATEWAY_ENDPOINT,
  isRuntimeBrowserGatewayHealth,
  isRuntimeManifest,
  runtimeManifest,
} from "../../../packages/runtime-contracts/src/index.js";

const waitOpen = (ws: WebSocket) =>
  new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });

const waitMessage = (ws: WebSocket) =>
  new Promise<unknown>((resolve, reject) => {
    ws.once("message", (data) => {
      try {
        resolve(JSON.parse(String(data)));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
    ws.once("error", reject);
  });

describe("BrowserGatewayServer", () => {
  it("serves health and forwards validated messages on loopback origins", async () => {
    let server: BrowserGatewayServer | null = null;
    server = new BrowserGatewayServer({
      async onMessage(clientId, message) {
        if (message.type === "ping") {
          server?.sendTo(clientId, { type: "pong", messageId: message.messageId });
        }
      },
    });
    const info: BrowserGatewayListenInfo = await server.start({
      port: 0,
      path: "runtime",
      allowedOrigins: ["http://127.0.0.1:5179"],
    });

    try {
      expect(info.host).toBe(DEFAULT_BROWSER_GATEWAY_ENDPOINT.host);
      expect(info.path).toBe(DEFAULT_BROWSER_GATEWAY_ENDPOINT.path);
      expect(info.url).toBe(`ws://127.0.0.1:${info.port}/runtime`);
      const health = await fetch(`http://${info.host}:${info.port}/healthz`);
      expect(health.ok).toBe(true);
      expect(health.headers.get("access-control-allow-origin")).toBeNull();
      const payload: unknown = await health.json();
      expect(isRuntimeBrowserGatewayHealth(payload)).toBe(true);
      if (!isRuntimeBrowserGatewayHealth(payload)) throw new Error("invalid health");
      expect(payload).toMatchObject({
        schemaVersion: 1,
        ok: true,
        transport: "browser-gateway",
        endpoint: info.endpoint,
        tokenRequired: false,
      });
      expect(isRuntimeManifest(payload.manifest)).toBe(true);
      expect(payload.manifest.endpoints.browserGateway.endpoint.url).toBe(info.url);

      const ws = new WebSocket(info.url, {
        headers: { Origin: "http://127.0.0.1:5179" },
      });
      await waitOpen(ws);
      ws.send(JSON.stringify({ type: "ping", messageId: "msg-1" }));
      await expect(waitMessage(ws)).resolves.toEqual({
        type: "pong",
        messageId: "msg-1",
      });
      ws.close();
    } finally {
      await server.stop();
    }
  });

  it("adds loopback CORS headers for browser health and manifest requests", async () => {
    const server = new BrowserGatewayServer({
      async onMessage() {},
    });
    const info = await server.start({
      port: 0,
      allowedOrigins: ["http://127.0.0.1:5183"],
    });

    try {
      const health = await fetch(`http://${info.host}:${info.port}/healthz`, {
        headers: { Origin: "http://127.0.0.1:5183" },
      });
      const manifest = await fetch(`http://${info.host}:${info.port}/manifest`, {
        headers: { Origin: "http://127.0.0.1:5183" },
      });
      const disallowed = await fetch(`http://${info.host}:${info.port}/healthz`, {
        headers: { Origin: "http://example.test" },
      });

      expect(health.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5183");
      expect(manifest.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5183");
      expect(disallowed.headers.get("access-control-allow-origin")).toBeNull();
    } finally {
      await server.stop();
    }
  });

  it("reports token-required gateway health without leaking the token", async () => {
    const server = new BrowserGatewayServer({
      async onMessage() {},
    });
    const info = await server.start({
      port: 0,
      token: "secret-token",
    });

    try {
      const health = await fetch(`http://${info.host}:${info.port}/healthz`);
      const text = await health.text();
      const payload: unknown = JSON.parse(text);

      expect(isRuntimeBrowserGatewayHealth(payload)).toBe(true);
      if (!isRuntimeBrowserGatewayHealth(payload)) throw new Error("invalid health");
      expect(payload).toMatchObject({
        endpoint: info.endpoint,
        tokenRequired: true,
      });
      expect(payload.manifest.endpoints.browserGateway.tokenRequired).toBe(true);
      expect(text).not.toContain("secret-token");
    } finally {
      await server.stop();
    }
  });

  it("serves a sanitized manifest from an injected daemon manifest provider", async () => {
    const server = new BrowserGatewayServer({
      async onMessage() {},
      manifest: () =>
        runtimeManifest({
          socketPath: "\\\\.\\pipe\\kirakira-agent-test",
          capabilities: {
            subagents: { state: "enabled" },
            deep_research: { state: "enabled" },
            memory: { state: "enabled" },
            mcp: { state: "enabled" },
          },
        }),
    });
    const info = await server.start({
      port: 0,
      allowedOrigins: ["http://127.0.0.1:5179"],
    });

    try {
      const response = await fetch(`http://${info.host}:${info.port}/manifest`);
      const text = await response.text();
      const payload: unknown = JSON.parse(text);

      expect(response.ok).toBe(true);
      expect(isRuntimeManifest(payload)).toBe(true);
      expect(payload).toMatchObject({
        runtime: "kirakira-agent",
        endpoints: {
          socketPath: "\\\\.\\pipe\\kirakira-agent-test",
        },
      });
      expect(
        (payload as ReturnType<typeof runtimeManifest>).capabilities.deep_research.state,
      ).toBe("enabled");
      expect(text).not.toContain("secret-token");
    } finally {
      await server.stop();
    }
  });

  it("rejects non-loopback binds without an explicit token", async () => {
    const server = new BrowserGatewayServer({
      async onMessage() {},
    });

    await expect(server.start({ host: "0.0.0.0", port: 0 })).rejects.toThrow(
      "requires a token",
    );
  });

  it("rejects disallowed websocket origins", async () => {
    const server = new BrowserGatewayServer({
      async onMessage() {},
    });
    const info = await server.start({
      port: 0,
      allowedOrigins: ["http://127.0.0.1:5179"],
    });

    try {
      const ws = new WebSocket(info.url, {
        headers: { Origin: "http://example.test" },
      });
      const status = await new Promise<number>((resolve, reject) => {
        ws.once("unexpected-response", (_request, response) => {
          resolve(response.statusCode ?? 0);
        });
        ws.once("open", () => reject(new Error("unexpected open")));
        ws.once("error", reject);
      });
      expect(status).toBe(403);
    } finally {
      await server.stop();
    }
  });

  it("returns correlated errors for malformed control frames without invoking handlers", async () => {
    const onMessage = vi.fn();
    const server = new BrowserGatewayServer({
      async onMessage(clientId, message) {
        onMessage(clientId, message);
      },
    });
    const info = await server.start({
      port: 0,
      allowedOrigins: ["http://127.0.0.1:5179"],
    });

    try {
      const ws = new WebSocket(info.url, {
        headers: { Origin: "http://127.0.0.1:5179" },
      });
      await waitOpen(ws);
      ws.send(
        JSON.stringify({
          type: "control",
          messageId: "bad-control-1",
          message: { type: "inspect" },
        }),
      );
      await expect(waitMessage(ws)).resolves.toMatchObject({
        type: "error",
        code: "invalid_control",
        messageId: "bad-control-1",
      });
      expect(onMessage).not.toHaveBeenCalled();
      ws.close();
    } finally {
      await server.stop();
    }
  });
});

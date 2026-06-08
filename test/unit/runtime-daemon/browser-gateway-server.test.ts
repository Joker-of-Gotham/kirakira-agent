import { describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import {
  BrowserGatewayServer,
  type BrowserGatewayListenInfo,
} from "../../../packages/runtime-daemon/src/index.js";
import { DEFAULT_BROWSER_GATEWAY_ENDPOINT } from "../../../packages/runtime-contracts/src/index.js";

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

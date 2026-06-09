import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveWebRuntimeConfig } from "../../../apps/web/src/runtime-config.js";

class FakeWebSocket {
  static readonly OPEN = 1;
  readyState = 0;
  private readonly listeners = new Map<string, Array<(event: unknown) => void>>();

  constructor(readonly url: string) {}

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  close(): void {
    this.readyState = 3;
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    for (const listener of this.listeners.get("open") ?? []) listener({});
  }
}

const env = (input: Partial<ImportMetaEnv> & { PROD?: boolean }): ImportMetaEnv =>
  ({
    DEV: !input.PROD,
    PROD: Boolean(input.PROD),
    MODE: input.PROD ? "production" : "development",
    BASE_URL: "/",
    SSR: false,
    ...input,
  }) as ImportMetaEnv;

describe("web runtime config", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses browser gateway transport when an endpoint is configured", () => {
    const config = resolveWebRuntimeConfig(
      env({ VITE_KIRAKIRA_GATEWAY_URL: "ws://127.0.0.1:17373/runtime" }),
    );

    expect(config.mode).toBe("gateway");
    expect(config.gatewayEndpoint?.url).toBe("ws://127.0.0.1:17373/runtime");
    expect(config.transport?.mode).toBe("browser-gateway");
    expect(config.error).toBeUndefined();
  });

  it("returns a config error for non-websocket gateway endpoints", () => {
    const config = resolveWebRuntimeConfig(
      env({ VITE_KIRAKIRA_GATEWAY_URL: "http://127.0.0.1:17373/runtime" }),
    );

    expect(config.mode).toBe("gateway");
    expect(config.transport).toBeUndefined();
    expect(config.error).toContain("protocol is not allowed");
  });

  it("allows explicit mock mode", () => {
    const config = resolveWebRuntimeConfig(env({ VITE_KIRAKIRA_RUNTIME_MODE: "mock" }));

    expect(config.mode).toBe("mock");
    expect(config.transport).toBeUndefined();
    expect(config.error).toBeUndefined();
  });

  it("lets explicit mock mode win over configured gateway env", () => {
    const config = resolveWebRuntimeConfig(
      env({
        VITE_KIRAKIRA_RUNTIME_MODE: "mock",
        VITE_KIRAKIRA_GATEWAY_URL: "ws://127.0.0.1:17373/runtime",
        VITE_KIRAKIRA_GATEWAY_TOKEN: "secret-token",
      }),
    );

    expect(config.mode).toBe("mock");
    expect(config.gatewayEndpoint).toBeUndefined();
    expect(config.transport).toBeUndefined();
  });

  it("does not echo gateway tokens in URL parse errors", () => {
    const config = resolveWebRuntimeConfig(
      env({
        VITE_KIRAKIRA_GATEWAY_URL: "not a url",
        VITE_KIRAKIRA_GATEWAY_TOKEN: "secret-token",
      }),
    );

    expect(config.error).toBeDefined();
    expect(config.error).not.toContain("secret-token");
  });

  it("treats blank gateway tokens as absent", async () => {
    let socket: FakeWebSocket | null = null;
    vi.stubGlobal(
      "WebSocket",
      class extends FakeWebSocket {
        constructor(url: string) {
          super(url);
          socket = this;
        }
      },
    );
    const config = resolveWebRuntimeConfig(
      env({
        VITE_KIRAKIRA_GATEWAY_URL: "ws://127.0.0.1:17373/runtime",
        VITE_KIRAKIRA_GATEWAY_TOKEN: "   ",
      }),
    );

    const connect = config.transport?.connect();
    socket?.open();
    await connect;

    expect(socket?.url).toBe("ws://127.0.0.1:17373/runtime");
  });

  it("does not silently mock production without an endpoint", () => {
    const config = resolveWebRuntimeConfig(env({ PROD: true }));

    expect(config.error).toContain("Production web builds require");
  });

  it("requires an endpoint in explicit gateway mode", () => {
    const config = resolveWebRuntimeConfig(
      env({ VITE_KIRAKIRA_RUNTIME_MODE: "gateway" }),
    );

    expect(config.error).toContain("VITE_KIRAKIRA_GATEWAY_URL");
  });
});

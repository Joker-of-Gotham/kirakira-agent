import { describe, expect, it, vi } from "vitest";
import { createBrowserGatewayTransport } from "../../../packages/frontend-core/src/index.js";
import type { RuntimeServerMessage } from "../../../packages/runtime-contracts/src/index.js";

class FakeWebSocket {
  static readonly OPEN = 1;
  readyState = 0;
  readonly sent: string[] = [];
  private readonly listeners = new Map<string, Array<(event: unknown) => void>>();

  constructor(readonly url: string) {}

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.emit("close", {});
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open", {});
  }

  message(message: RuntimeServerMessage): void {
    this.emit("message", { data: JSON.stringify(message) });
  }

  private emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

const idFactory = () => {
  let id = 0;
  return () => {
    id += 1;
    return `msg-${id}`;
  };
};

describe("browser gateway runtime transport", () => {
  it("submits prompts through the runtime protocol and resolves ack run ids", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    let socket: FakeWebSocket | null = null;
    const transport = createBrowserGatewayTransport({
      endpoint: "ws://127.0.0.1:17373/runtime",
      idFactory: idFactory(),
      socketFactory(url) {
        socket = new FakeWebSocket(url);
        return socket as unknown as WebSocket;
      },
    });

    const connect = transport.connect();
    socket?.open();
    await connect;

    const submit = transport.submitPrompt({
      prompt: "Map the runtime gateway",
      mode: "headless",
    });
    const frame = JSON.parse(socket?.sent[0] ?? "{}") as {
      messageId: string;
      message: { type: string; mode: string; prompt: string };
    };
    expect(frame).toMatchObject({
      type: "control",
      message: {
        type: "submit",
        prompt: "Map the runtime gateway",
        mode: "headless",
      },
    });

    socket?.message({
      type: "ack",
      messageId: frame.messageId,
      result: { runId: "run-1" },
    });
    await expect(submit).resolves.toEqual({ runId: "run-1" });
  });

  it("maps subscriptions to events and sends daemon unsubscribe frames", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    let socket: FakeWebSocket | null = null;
    const transport = createBrowserGatewayTransport({
      endpoint: "ws://127.0.0.1:17373/runtime",
      idFactory: idFactory(),
      socketFactory(url) {
        socket = new FakeWebSocket(url);
        return socket as unknown as WebSocket;
      },
    });

    const connect = transport.connect();
    socket?.open();
    await connect;

    const seen: string[] = [];
    const unsubscribe = transport.subscribeRun("run-1", (event) => {
      if (event.type === "event") seen.push(event.event.kind);
    });
    const subscribeFrame = JSON.parse(socket?.sent[0] ?? "{}") as { messageId: string };
    socket?.message({
      type: "subscribed",
      subscriptionId: "server-sub-1",
      messageId: subscribeFrame.messageId,
    });
    socket?.message({
      type: "event",
      event: {
        id: "event-1",
        runId: "run-1",
        timestamp: "2026-06-09T00:00:00.000Z",
        kind: "run.started",
        payload: {},
      },
    });

    expect(seen).toEqual(["run.started"]);
    unsubscribe();
    const unsubscribeFrame = JSON.parse(socket?.sent.at(-1) ?? "{}") as {
      subscriptionId: string;
    };
    expect(unsubscribeFrame).toMatchObject({
      type: "unsubscribe",
      subscriptionId: "server-sub-1",
    });
  });

  it("rejects pending requests when the socket closes", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    let socket: FakeWebSocket | null = null;
    const transport = createBrowserGatewayTransport({
      endpoint: "ws://127.0.0.1:17373/runtime",
      idFactory: idFactory(),
      socketFactory(url) {
        socket = new FakeWebSocket(url);
        return socket as unknown as WebSocket;
      },
    });

    const connect = transport.connect();
    socket?.open();
    await connect;

    const pending = transport.drain();
    socket?.close();
    await expect(pending).rejects.toThrow("closed");
  });
});

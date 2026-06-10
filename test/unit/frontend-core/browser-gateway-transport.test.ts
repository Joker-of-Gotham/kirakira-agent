import { describe, expect, it, vi } from "vitest";
import { createBrowserGatewayTransport } from "../../../packages/frontend-core/src/index.js";
import {
  parseHttpRuntimeEndpoint,
  parseWebSocketRuntimeEndpoint,
  type RuntimeServerMessage,
} from "../../../packages/runtime-contracts/src/index.js";

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
  it("accepts typed websocket endpoints and appends tokens only when connecting", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const endpoint = parseWebSocketRuntimeEndpoint(
      "ws://127.0.0.1:17373/runtime?discard=true#fragment",
    );
    let socket: FakeWebSocket | null = null;
    const transport = createBrowserGatewayTransport({
      endpoint,
      token: "secret",
      socketFactory(url) {
        socket = new FakeWebSocket(url);
        return socket as unknown as WebSocket;
      },
    });

    const connect = transport.connect();
    socket?.open();
    await connect;

    expect(endpoint.url).toBe("ws://127.0.0.1:17373/runtime");
    expect(socket?.url).toBe("ws://127.0.0.1:17373/runtime?token=secret");
  });

  it("rejects typed non-websocket endpoints", () => {
    const endpoint = parseHttpRuntimeEndpoint("http://127.0.0.1:5183/");

    expect(() => createBrowserGatewayTransport({ endpoint })).toThrow(
      "protocol is not allowed",
    );
  });

  it("does not append blank tokens to socket URLs", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    let socket: FakeWebSocket | null = null;
    const transport = createBrowserGatewayTransport({
      endpoint: "ws://127.0.0.1:17373/runtime",
      token: "   ",
      socketFactory(url) {
        socket = new FakeWebSocket(url);
        return socket as unknown as WebSocket;
      },
    });

    const connect = transport.connect();
    socket?.open();
    await connect;

    expect(socket?.url).toBe("ws://127.0.0.1:17373/runtime");
  });

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

  it("requests artifact content through the runtime protocol", async () => {
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

    const pending = transport.getArtifactContent({
      runId: "run-1",
      artifactId: "artifact-a",
      maxBytes: 1024,
    });
    const frame = JSON.parse(socket?.sent[0] ?? "{}") as {
      messageId: string;
      type: string;
    };
    expect(frame).toMatchObject({
      type: "get_artifact",
      runId: "run-1",
      artifactId: "artifact-a",
      maxBytes: 1024,
    });

    socket?.message({
      type: "ack",
      messageId: frame.messageId,
      result: {
        runId: "run-1",
        artifactId: "artifact-a",
        path: "artifacts/report.md",
        sizeBytes: 7,
        truncated: false,
        encoding: "utf8",
        content: "preview",
      },
    });
    await expect(pending).resolves.toMatchObject({
      artifactId: "artifact-a",
      content: "preview",
    });
  });

  it("sends run command center controls through the runtime protocol", async () => {
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

    const steer = transport.steer({
      runId: "run-1",
      instruction: "Keep changes scoped",
      priority: "high",
    });
    const enqueue = transport.enqueue({
      runId: "run-1",
      prompt: "Continue verification",
      priority: 3,
    });
    const provideInput = transport.provideInput({
      runId: "run-1",
      interruptId: "interrupt-1",
      data: { decision: "continue" },
    });
    const resume = transport.resume({
      runId: "run-1",
      fromCheckpoint: "checkpoint-1",
    });
    const inspect = transport.inspect({ runId: "run-1", includeEvents: true });

    const frames = socket?.sent.map((item) => JSON.parse(item)) ?? [];
    expect(frames).toMatchObject([
      {
        type: "control",
        message: {
          type: "steer",
          runId: "run-1",
          instruction: "Keep changes scoped",
          priority: "high",
        },
      },
      {
        type: "control",
        message: {
          type: "enqueue",
          runId: "run-1",
          prompt: "Continue verification",
          priority: 3,
        },
      },
      {
        type: "control",
        message: {
          type: "provide_input",
          runId: "run-1",
          interruptId: "interrupt-1",
          data: { decision: "continue" },
        },
      },
      {
        type: "control",
        message: {
          type: "resume",
          runId: "run-1",
          fromCheckpoint: "checkpoint-1",
        },
      },
      {
        type: "control",
        message: {
          type: "inspect",
          runId: "run-1",
          includeEvents: true,
        },
      },
    ]);

    for (const frame of frames.slice(0, 4)) {
      socket?.message({ type: "ack", messageId: frame.messageId });
    }
    socket?.message({
      type: "ack",
      messageId: frames[4].messageId,
      result: {
        runId: "run-1",
        status: "running",
        activeWorkers: [],
        pendingApprovals: [],
        costSummary: { totalCostUsd: 0, totalTokens: 0 },
      },
    });

    await expect(steer).resolves.toBeUndefined();
    await expect(enqueue).resolves.toBeUndefined();
    await expect(provideInput).resolves.toBeUndefined();
    await expect(resume).resolves.toBeUndefined();
    await expect(inspect).resolves.toMatchObject({
      runId: "run-1",
      state: { status: "running" },
    });
  });

  it("calls MCP tools through the runtime protocol and resolves typed results", async () => {
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

    const pending = transport.callMcpTool({
      server: "filesystem-core",
      tool: "read_file",
      arguments: { path: "README.md" },
      runId: "run-1",
      traceId: "trace-1",
    });
    const frame = JSON.parse(socket?.sent[0] ?? "{}") as {
      messageId: string;
      type: string;
    };
    expect(frame).toMatchObject({
      type: "mcp_call",
      server: "filesystem-core",
      tool: "read_file",
      arguments: { path: "README.md" },
      runId: "run-1",
      traceId: "trace-1",
    });

    socket?.message({
      type: "ack",
      messageId: frame.messageId,
      result: {
        server: "filesystem-core",
        tool: "read_file",
        success: true,
        content: [{ type: "text", text: "preview" }],
        latencyMs: 5,
        policy: {
          effect: "allow",
          reasonCodes: ["baseline_read_workspace"],
          approvalRequired: false,
          traceId: "trace-1",
        },
      },
    });
    await expect(pending).resolves.toMatchObject({
      server: "filesystem-core",
      tool: "read_file",
      success: true,
    });
  });

  it("discovers MCP tools through the runtime protocol", async () => {
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

    const pending = transport.listMcpTools({
      server: "filesystem-core",
      includeTools: true,
      startServers: true,
    });
    const frame = JSON.parse(socket?.sent[0] ?? "{}") as {
      messageId: string;
      type: string;
    };
    expect(frame).toMatchObject({
      type: "mcp_list",
      server: "filesystem-core",
      includeTools: true,
      startServers: true,
    });

    socket?.message({
      type: "ack",
      messageId: frame.messageId,
      result: {
        generatedAt: "2026-06-09T00:00:00.000Z",
        servers: [
          {
            name: "filesystem-core",
            health: "healthy",
            toolCount: 1,
            tools: [{ name: "read_file", inputSchema: { type: "object" } }],
          },
        ],
      },
    });
    await expect(pending).resolves.toMatchObject({
      servers: [{ name: "filesystem-core", health: "healthy", toolCount: 1 }],
    });
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

  it("rejects only the matching request for correlated errors", async () => {
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

    const submit = transport.submitPrompt({ prompt: "one", mode: "headless" });
    const drain = transport.drain();
    const submitFrame = JSON.parse(socket?.sent[0] ?? "{}") as { messageId: string };
    const drainFrame = JSON.parse(socket?.sent[1] ?? "{}") as { messageId: string };

    socket?.message({
      type: "error",
      code: "invalid_control",
      message: "Bad submit",
      messageId: submitFrame.messageId,
    });
    socket?.message({ type: "ack", messageId: drainFrame.messageId });

    await expect(submit).rejects.toThrow("Bad submit");
    await expect(drain).resolves.toBeUndefined();
  });

  it("cleans up the matching subscription when subscribe returns a correlated error", async () => {
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
    const errors: string[] = [];
    const unsubscribe = transport.subscribeRun("run-1", (event) => {
      if (event.type === "event") seen.push(event.event.kind);
      if (event.type === "error") errors.push(event.message);
    });
    const subscribeFrame = JSON.parse(socket?.sent[0] ?? "{}") as { messageId: string };

    socket?.message({
      type: "error",
      code: "invalid_filter",
      message: "Bad subscribe",
      messageId: subscribeFrame.messageId,
    });
    socket?.message({
      type: "event",
      event: {
        id: "event-after-error",
        runId: "run-1",
        timestamp: "2026-06-09T00:00:00.000Z",
        kind: "run.started",
        payload: {},
      },
    });
    unsubscribe();

    expect(errors).toEqual(["Bad subscribe"]);
    expect(seen).toEqual([]);
    expect(socket?.sent).toHaveLength(1);
  });

  it("sends daemon unsubscribe when a local unsubscribe happens before subscribe ack", async () => {
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

    const unsubscribe = transport.subscribeRun("run-1", () => {});
    const subscribeFrame = JSON.parse(socket?.sent[0] ?? "{}") as { messageId: string };
    unsubscribe();
    expect(socket?.sent).toHaveLength(1);

    socket?.message({
      type: "subscribed",
      subscriptionId: "server-sub-late",
      messageId: subscribeFrame.messageId,
    });
    const unsubscribeFrame = JSON.parse(socket?.sent.at(-1) ?? "{}") as {
      subscriptionId: string;
    };
    expect(unsubscribeFrame).toMatchObject({
      type: "unsubscribe",
      subscriptionId: "server-sub-late",
    });
  });
});

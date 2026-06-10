import { describe, expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isTrustedDesktopRuntimeSenderUrl } from "../../../apps/desktop/src/main/renderer-endpoint.js";
import { createRuntimeIpcController } from "../../../apps/desktop/src/main/runtime-ipc.js";
import type { RuntimeTransportStatus } from "../../../packages/frontend-core/src/index.js";
import type { ServerMessage } from "../../../packages/runtime-daemon/src/index.js";
import {
  DEFAULT_BROWSER_GATEWAY_ENDPOINT,
  renderRuntimeEndpoint,
  runtimeDaemonHealth,
} from "../../../packages/runtime-contracts/src/index.js";

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

const statusTrustEnv = {
  KIRAKIRA_DESKTOP_RENDERER_URL: "http://127.0.0.1:5174",
};

const packagedRendererUrl = pathToFileURL(
  resolve("apps/desktop/dist/renderer/index.html"),
).toString();

const isTrustedStatusSender = (event: IpcMainInvokeEvent): boolean =>
  isTrustedDesktopRuntimeSenderUrl(event.senderFrame?.url, statusTrustEnv, {
    packagedRendererUrl,
  });

class FakeIpcMain {
  readonly handlers = new Map<string, Handler>();

  handle(channel: string, handler: Handler): void {
    this.handlers.set(channel, handler);
  }

  async invoke(channel: string, event: IpcMainInvokeEvent, ...args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(channel);
    if (!handler) throw new Error(`Missing IPC handler: ${channel}`);
    return await handler(event, ...args);
  }
}

function eventFor(senderId: number, url = "http://127.0.0.1:5174/"): IpcMainInvokeEvent {
  return {
    sender: { id: senderId },
    senderFrame: { url },
  } as IpcMainInvokeEvent;
}

function createFakeClient() {
  let messageHandler: ((message: ServerMessage) => void) | null = null;
  return {
    client: {
      connect: vi.fn(async () => {}),
      disconnect: vi.fn(),
      submitPrompt: vi.fn(async () => "run-1"),
      getState: vi.fn(async (runId: string) => ({ runId })),
      getArtifactContent: vi.fn(async () => ({
        runId: "run-1",
        artifactId: "artifact-a",
        path: "artifacts/report.md",
        sizeBytes: 7,
        truncated: false,
        encoding: "utf8" as const,
        content: "preview",
      })),
      listMcpTools: vi.fn(async () => ({
        generatedAt: "2026-06-09T00:00:00.000Z",
        servers: [
          {
            name: "filesystem-core",
            health: "healthy" as const,
            toolCount: 1,
            tools: [{ name: "read_file", inputSchema: { type: "object" } }],
          },
        ],
      })),
      callMcpTool: vi.fn(async () => ({
        server: "filesystem-core",
        tool: "read_file",
        success: true,
        content: [{ type: "text", text: "preview" }],
        latencyMs: 5,
        policy: {
          effect: "allow" as const,
          reasonCodes: ["baseline_read_workspace"],
          approvalRequired: false,
          traceId: "trace-1",
        },
      })),
      subscribeToRun: vi.fn(),
      unsubscribe: vi.fn(),
      steerRun: vi.fn(async () => {}),
      enqueuePrompt: vi.fn(async () => {}),
      approve: vi.fn(async () => {}),
      provideInput: vi.fn(async () => {}),
      resume: vi.fn(async () => {}),
      inspectThread: vi.fn(async (runId: string) => ({
        runId,
        status: "running",
        activeWorkers: [],
        pendingApprovals: [],
        costSummary: { totalCostUsd: 0, totalTokens: 0 },
      })),
      cancel: vi.fn(async () => {}),
      drain: vi.fn(async () => {}),
      onMessage: vi.fn((handler: (message: ServerMessage) => void) => {
        messageHandler = handler;
        return () => {
          messageHandler = null;
        };
      }),
    },
    emit(message: ServerMessage) {
      if (!messageHandler) throw new Error("No message handler registered");
      messageHandler(message);
    },
  };
}

describe("desktop runtime IPC controller", () => {
  it("forwards subscription filters and unsubscribes daemon-side after ack", async () => {
    const ipcMain = new FakeIpcMain();
    const fake = createFakeClient();
    const send = vi.fn();
    const controller = createRuntimeIpcController({
      client: fake.client,
      idFactory: () => "subscribe-msg-1",
      isTrustedSender: () => true,
      webContentsFromId: () => ({
        send,
        isDestroyed: () => false,
      }),
    });
    controller.register(ipcMain);

    await ipcMain.invoke(ipcMainChannel("subscribe"), eventFor(10), {
      runId: "run-1",
      subscriptionId: "local-sub-1",
      options: {
        afterSeq: 7,
        filter: { kinds: ["research.started"] },
      },
    });

    expect(fake.client.subscribeToRun).toHaveBeenCalledWith("run-1", {
      afterSeq: 7,
      filter: { kinds: ["research.started"] },
      messageId: "subscribe-msg-1",
    });

    fake.emit({
      type: "subscribed",
      subscriptionId: "daemon-sub-1",
      messageId: "subscribe-msg-1",
    });
    fake.emit({
      type: "event",
      event: {
        id: "event-1",
        runId: "run-1",
        timestamp: "2026-06-09T00:00:00.000Z",
        kind: "research.started",
        checkpointSeq: 8,
        payload: {},
      },
    });
    expect(send).toHaveBeenCalledWith("runtime:event:local-sub-1", {
      type: "event",
      event: expect.objectContaining({ id: "event-1" }),
    });

    await ipcMain.invoke(ipcMainChannel("unsubscribe"), eventFor(10), {
      subscriptionId: "local-sub-1",
    });
    expect(fake.client.unsubscribe).toHaveBeenCalledWith("daemon-sub-1");
    expect(controller.subscriptionCount()).toBe(0);
  });

  it("sends daemon unsubscribe when renderer unsubscribes before subscribe ack", async () => {
    const ipcMain = new FakeIpcMain();
    const fake = createFakeClient();
    const controller = createRuntimeIpcController({
      client: fake.client,
      idFactory: () => "subscribe-msg-late",
      isTrustedSender: () => true,
      webContentsFromId: () => undefined,
    });
    controller.register(ipcMain);

    await ipcMain.invoke(ipcMainChannel("subscribe"), eventFor(11), {
      runId: "run-1",
      subscriptionId: "local-sub-late",
    });
    await ipcMain.invoke(ipcMainChannel("unsubscribe"), eventFor(11), {
      subscriptionId: "local-sub-late",
    });

    expect(fake.client.unsubscribe).not.toHaveBeenCalled();
    fake.emit({
      type: "subscribed",
      subscriptionId: "daemon-sub-late",
      messageId: "subscribe-msg-late",
    });

    expect(fake.client.unsubscribe).toHaveBeenCalledWith("daemon-sub-late");
    expect(controller.subscriptionCount()).toBe(0);
  });

  it("cleans up and reports correlated subscribe errors from the daemon", async () => {
    const ipcMain = new FakeIpcMain();
    const fake = createFakeClient();
    const send = vi.fn();
    const controller = createRuntimeIpcController({
      client: fake.client,
      idFactory: () => "subscribe-msg-error",
      isTrustedSender: () => true,
      webContentsFromId: () => ({
        send,
        isDestroyed: () => false,
      }),
    });
    controller.register(ipcMain);

    await ipcMain.invoke(ipcMainChannel("subscribe"), eventFor(12), {
      runId: "run-1",
      subscriptionId: "local-sub-error",
      options: { filter: { kinds: ["run.started"] } },
    });

    fake.emit({
      type: "error",
      code: "invalid_filter",
      message: "Bad filter",
      messageId: "subscribe-msg-error",
    });

    expect(send).toHaveBeenCalledWith("runtime:event:local-sub-error", {
      type: "error",
      message: "Bad filter",
      detail: expect.objectContaining({
        code: "invalid_filter",
        messageId: "subscribe-msg-error",
      }),
    });
    expect(controller.subscriptionCount()).toBe(0);
    expect(fake.client.unsubscribe).not.toHaveBeenCalled();
  });

  it("rejects unsubscribe attempts from a renderer that does not own the subscription", async () => {
    const ipcMain = new FakeIpcMain();
    const fake = createFakeClient();
    const controller = createRuntimeIpcController({
      client: fake.client,
      idFactory: () => "subscribe-msg-owned",
      isTrustedSender: () => true,
      webContentsFromId: () => undefined,
    });
    controller.register(ipcMain);

    await ipcMain.invoke(ipcMainChannel("subscribe"), eventFor(21), {
      runId: "run-1",
      subscriptionId: "local-sub-owned",
    });

    await expect(
      ipcMain.invoke(ipcMainChannel("unsubscribe"), eventFor(22), {
        subscriptionId: "local-sub-owned",
      }),
    ).rejects.toThrow("Renderer does not own runtime subscription");
    expect(fake.client.unsubscribe).not.toHaveBeenCalled();
  });

  it("guards untrusted senders and malformed payloads before touching the daemon client", async () => {
    const ipcMain = new FakeIpcMain();
    const fake = createFakeClient();
    const controller = createRuntimeIpcController({
      client: fake.client,
      isTrustedSender: (event) => event.senderFrame?.url === "file:///trusted/index.html",
      webContentsFromId: () => undefined,
    });
    controller.register(ipcMain);

    await expect(
      ipcMain.invoke(ipcMainChannel("submit"), eventFor(30, "http://example.test/"), {
        prompt: "hi",
      }),
    ).rejects.toThrow("Untrusted runtime IPC sender");
    expect(fake.client.connect).not.toHaveBeenCalled();

    await expect(
      ipcMain.invoke(ipcMainChannel("subscribe"), eventFor(30, "file:///trusted/index.html"), {
        subscriptionId: "missing-run",
      }),
    ).rejects.toThrow("subscribeRun requires runId");
    expect(fake.client.subscribeToRun).not.toHaveBeenCalled();

    await expect(
      ipcMain.invoke(ipcMainChannel("subscribe"), eventFor(30, "file:///trusted/index.html"), {
        runId: "run-1",
        subscriptionId: "bad-filter",
        options: { filter: { kinds: ["research.progress"] } },
      }),
    ).rejects.toThrow("subscribe filter is malformed");
    expect(fake.client.subscribeToRun).not.toHaveBeenCalled();
  });

  it("validates artifact content requests before forwarding through desktop IPC", async () => {
    const ipcMain = new FakeIpcMain();
    const fake = createFakeClient();
    const controller = createRuntimeIpcController({
      client: fake.client,
      isTrustedSender: () => true,
      webContentsFromId: () => undefined,
    });
    controller.register(ipcMain);

    await expect(
      ipcMain.invoke("runtime:getArtifactContent", eventFor(35), {
        runId: "run-1",
        artifactId: "artifact-a",
        maxBytes: 1024,
      }),
    ).resolves.toMatchObject({
      artifactId: "artifact-a",
      content: "preview",
    });
    expect(fake.client.getArtifactContent).toHaveBeenCalledWith({
      runId: "run-1",
      artifactId: "artifact-a",
      maxBytes: 1024,
    });

    await expect(
      ipcMain.invoke("runtime:getArtifactContent", eventFor(35), {
        runId: "run-1",
      }),
    ).rejects.toThrow("getArtifactContent requires artifactId");
  });

  it("validates MCP tool calls before forwarding through desktop IPC", async () => {
    const ipcMain = new FakeIpcMain();
    const fake = createFakeClient();
    const controller = createRuntimeIpcController({
      client: fake.client,
      isTrustedSender: () => true,
      webContentsFromId: () => undefined,
    });
    controller.register(ipcMain);

    await expect(
      ipcMain.invoke("runtime:callMcpTool", eventFor(36), {
        server: "filesystem-core",
        tool: "read_file",
        arguments: { path: "README.md" },
        runId: "run-1",
        traceId: "trace-1",
      }),
    ).resolves.toMatchObject({
      server: "filesystem-core",
      tool: "read_file",
      success: true,
    });
    expect(fake.client.callMcpTool).toHaveBeenCalledWith({
      server: "filesystem-core",
      tool: "read_file",
      arguments: { path: "README.md" },
      runId: "run-1",
      traceId: "trace-1",
    });

    await expect(
      ipcMain.invoke("runtime:callMcpTool", eventFor(36), {
        server: "filesystem-core",
        tool: "read_file",
        arguments: ["README.md"],
      }),
    ).rejects.toThrow("callMcpTool arguments must be an object");
  });

  it("validates MCP discovery requests before forwarding through desktop IPC", async () => {
    const ipcMain = new FakeIpcMain();
    const fake = createFakeClient();
    const controller = createRuntimeIpcController({
      client: fake.client,
      isTrustedSender: () => true,
      webContentsFromId: () => undefined,
    });
    controller.register(ipcMain);

    await expect(
      ipcMain.invoke("runtime:listMcpTools", eventFor(37), {
        server: "filesystem-core",
        includeTools: true,
        startServers: true,
      }),
    ).resolves.toMatchObject({
      servers: [{ name: "filesystem-core", health: "healthy", toolCount: 1 }],
    });
    expect(fake.client.listMcpTools).toHaveBeenCalledWith({
      server: "filesystem-core",
      includeTools: true,
      startServers: true,
    });

    await expect(
      ipcMain.invoke("runtime:listMcpTools", eventFor(37), {
        includeTools: "yes",
      }),
    ).rejects.toThrow("listMcpTools includeTools must be a boolean");
  });

  it("validates run command center controls before forwarding through desktop IPC", async () => {
    const ipcMain = new FakeIpcMain();
    const fake = createFakeClient();
    const controller = createRuntimeIpcController({
      client: fake.client,
      isTrustedSender: () => true,
      webContentsFromId: () => undefined,
    });
    controller.register(ipcMain);

    await expect(
      ipcMain.invoke("runtime:steer", eventFor(38), {
        runId: "run-1",
        instruction: "Keep changes scoped",
        priority: "high",
      }),
    ).resolves.toBeUndefined();
    expect(fake.client.steerRun).toHaveBeenCalledWith("run-1", "Keep changes scoped", "high");

    await expect(
      ipcMain.invoke("runtime:enqueue", eventFor(38), {
        runId: "run-1",
        prompt: "Continue verification",
        priority: 4,
      }),
    ).resolves.toBeUndefined();
    expect(fake.client.enqueuePrompt).toHaveBeenCalledWith("Continue verification", 4, "run-1");

    await expect(
      ipcMain.invoke("runtime:provideInput", eventFor(38), {
        runId: "run-1",
        interruptId: "interrupt-1",
        data: { decision: "continue" },
      }),
    ).resolves.toBeUndefined();
    expect(fake.client.provideInput).toHaveBeenCalledWith("run-1", "interrupt-1", {
      decision: "continue",
    });

    await expect(
      ipcMain.invoke("runtime:resume", eventFor(38), {
        runId: "run-1",
        fromCheckpoint: "checkpoint-1",
      }),
    ).resolves.toBeUndefined();
    expect(fake.client.resume).toHaveBeenCalledWith("run-1", "checkpoint-1");

    await expect(
      ipcMain.invoke("runtime:inspect", eventFor(38), {
        runId: "run-1",
        includeEvents: true,
      }),
    ).resolves.toMatchObject({
      runId: "run-1",
      state: { runId: "run-1", status: "running" },
    });
    expect(fake.client.inspectThread).toHaveBeenCalledWith("run-1", true);

    await expect(
      ipcMain.invoke("runtime:steer", eventFor(38), {
        runId: "run-1",
        instruction: "bad",
        priority: "urgent",
      }),
    ).rejects.toThrow("steer priority is invalid");
  });

  it("reports desktop IPC status without forcing daemon connection", async () => {
    const ipcMain = new FakeIpcMain();
    const fake = createFakeClient();
    const controller = createRuntimeIpcController({
      client: fake.client,
      isTrustedSender: () => true,
      webContentsFromId: () => undefined,
    });
    controller.register(ipcMain);

    await expect(
      ipcMain.invoke("runtime:getStatus", eventFor(40)),
    ).resolves.toMatchObject({
      mode: "desktop-ipc",
      state: "unknown",
      label: "Desktop IPC",
      detail: "Daemon socket not connected",
    });
    expect(fake.client.connect).not.toHaveBeenCalled();
    expect(fake.client.getState).not.toHaveBeenCalled();
    expect(fake.client.submitPrompt).not.toHaveBeenCalled();
    expect(fake.client.subscribeToRun).not.toHaveBeenCalled();
    expect(fake.client.unsubscribe).not.toHaveBeenCalled();

    await ipcMain.invoke("runtime:connect", eventFor(40));
    await expect(
      ipcMain.invoke("runtime:getStatus", eventFor(40)),
    ).resolves.toMatchObject({
      mode: "desktop-ipc",
      state: "healthy",
      label: "Desktop IPC",
      detail: "Connected to daemon socket",
    });
  });

  it("validates and returns daemon health from a trusted status provider", async () => {
    const ipcMain = new FakeIpcMain();
    const fake = createFakeClient();
    const endpoint = renderRuntimeEndpoint(DEFAULT_BROWSER_GATEWAY_ENDPOINT);
    const health = runtimeDaemonHealth({
      gateway: true,
      kernel: true,
      socket: true,
      browserGateway: {
        endpoint,
        tokenRequired: true,
      },
    });
    const getHealth = vi.fn(async () => ({
      ...health,
      token: "secret-token",
      services: {
        ...health.services,
        browserGateway: {
          ...health.services.browserGateway,
          token: "secret-token",
          endpoint: { ...endpoint, token: "secret-token" },
        },
      },
      details: {
        ...health.details,
        browserGateway: {
          endpoint: { ...endpoint, token: "secret-token" },
          tokenRequired: true,
          token: "secret-token",
        },
        token: "secret-token",
      },
    }));
    const controller = createRuntimeIpcController({
      client: fake.client,
      getHealth,
      isTrustedSender: isTrustedStatusSender,
      webContentsFromId: () => undefined,
    });
    controller.register(ipcMain);

    await expect(
      ipcMain.invoke("runtime:getStatus", eventFor(41, "http://127.0.0.1:5173/")),
    ).rejects.toThrow("Untrusted runtime IPC sender");
    expect(getHealth).not.toHaveBeenCalled();

    const status = (await ipcMain.invoke(
      "runtime:getStatus",
      eventFor(41),
    )) as RuntimeTransportStatus;
    expect(status).toMatchObject({
      mode: "desktop-ipc",
      state: "healthy",
      label: "Desktop daemon",
      health: {
        ok: true,
        details: {
          browserGateway: {
            endpoint,
            tokenRequired: true,
          },
        },
      },
    });
    expect(JSON.stringify(status)).not.toContain("5173");
    expect(JSON.stringify(status)).not.toContain("secret-token");
    const daemonHealth = status.health as {
      details: { browserGateway?: Record<string, unknown> };
    };
    expect(Object.keys(daemonHealth.details.browserGateway ?? {})).toEqual([
      "endpoint",
      "tokenRequired",
    ]);

    await expect(
      ipcMain.invoke("runtime:getStatus", eventFor(41, packagedRendererUrl)),
    ).resolves.toMatchObject({
      mode: "desktop-ipc",
      state: "healthy",
      label: "Desktop daemon",
    });
  });

  it("maps unhealthy daemon health to unavailable desktop status", async () => {
    const ipcMain = new FakeIpcMain();
    const fake = createFakeClient();
    const controller = createRuntimeIpcController({
      client: fake.client,
      getHealth: async () =>
        runtimeDaemonHealth({
          gateway: false,
          kernel: true,
          socket: true,
        }),
      isTrustedSender: () => true,
      webContentsFromId: () => undefined,
    });
    controller.register(ipcMain);

    await expect(ipcMain.invoke("runtime:getStatus", eventFor(43))).resolves.toMatchObject({
      mode: "desktop-ipc",
      state: "unavailable",
      label: "Desktop daemon",
      detail: "Daemon health check reported unavailable",
      health: {
        ok: false,
      },
    });
  });

  it("rejects unexpected desktop status arguments", async () => {
    const ipcMain = new FakeIpcMain();
    const fake = createFakeClient();
    const getHealth = vi.fn(async () =>
      runtimeDaemonHealth({
        gateway: true,
        kernel: true,
        socket: true,
      }),
    );
    const controller = createRuntimeIpcController({
      client: fake.client,
      getHealth,
      isTrustedSender: () => true,
      webContentsFromId: () => undefined,
    });
    controller.register(ipcMain);

    await expect(
      ipcMain.invoke("runtime:getStatus", eventFor(44), { payload: true }),
    ).rejects.toThrow("runtime:getStatus does not accept arguments");
    expect(getHealth).not.toHaveBeenCalled();
  });

  it("rejects malformed daemon health provider results", async () => {
    const ipcMain = new FakeIpcMain();
    const fake = createFakeClient();
    const controller = createRuntimeIpcController({
      client: fake.client,
      getHealth: async () => ({ ok: true }) as never,
      isTrustedSender: () => true,
      webContentsFromId: () => undefined,
    });
    controller.register(ipcMain);

    await expect(ipcMain.invoke("runtime:getStatus", eventFor(42))).rejects.toThrow(
      "Runtime daemon health response is invalid",
    );
  });
});

function ipcMainChannel(kind: "subscribe" | "unsubscribe" | "submit"): string {
  switch (kind) {
    case "subscribe":
      return "runtime:subscribeRun";
    case "unsubscribe":
      return "runtime:unsubscribeRun";
    case "submit":
      return "runtime:submitPrompt";
  }
}

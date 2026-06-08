import { describe, expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import { createRuntimeIpcController } from "../../../apps/desktop/src/main/runtime-ipc.js";
import type { ServerMessage } from "../../../packages/runtime-daemon/src/index.js";

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

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
      subscribeToRun: vi.fn(),
      unsubscribe: vi.fn(),
      approve: vi.fn(async () => {}),
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
        filter: { kinds: ["research.progress"] },
      },
    });

    expect(fake.client.subscribeToRun).toHaveBeenCalledWith("run-1", {
      afterSeq: 7,
      filter: { kinds: ["research.progress"] },
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
        kind: "research.progress",
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

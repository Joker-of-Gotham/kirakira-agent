import { app, BrowserWindow, ipcMain, webContents } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DaemonClient, type ServerMessage } from "@kirakira/runtime-daemon";
import type {
  ApprovalDecision,
  RuntimeTransportEvent,
  SubmitPromptRequest,
  SubscribeRunOptions,
} from "@kirakira/frontend-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const client = new DaemonClient();
let connected = false;

const subscriptions = new Map<
  string,
  { runId: string; webContentsId: number; options?: SubscribeRunOptions }
>();

const isLocalDevUrl = (value: string | undefined): value is string => {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)
    );
  } catch {
    return false;
  }
};

const rendererUrl = () => {
  const devUrl =
    process.env.KIRAKIRA_DESKTOP_RENDERER_URL ?? process.env.KIRAKIRA_DESKTOP_DEV_URL;
  return isLocalDevUrl(devUrl) ? devUrl : null;
};

const ensureConnected = async () => {
  if (connected) return;
  await client.connect(process.env.KIRAKIRA_DAEMON_SOCKET);
  connected = true;
};

const eventMatches = (
  message: ServerMessage,
  runId: string,
  options?: SubscribeRunOptions,
): message is Extract<ServerMessage, { type: "event" }> => {
  if (message.type !== "event") return false;
  if (message.event.runId !== runId) return false;
  if (options?.afterSeq !== undefined && (message.event.checkpointSeq ?? 0) <= options.afterSeq) {
    return false;
  }
  if (options?.filter?.kinds && !options.filter.kinds.includes(message.event.kind)) {
    return false;
  }
  return true;
};

client.onMessage((message) => {
  for (const [subscriptionId, subscription] of subscriptions) {
    if (!eventMatches(message, subscription.runId, subscription.options)) continue;
    const target = webContents.fromId(subscription.webContentsId);
    if (!target || target.isDestroyed()) {
      subscriptions.delete(subscriptionId);
      continue;
    }
    const payload: RuntimeTransportEvent = { type: "event", event: message.event };
    target.send(`runtime:event:${subscriptionId}`, payload);
  }
});

const createWindow = async () => {
  const window = new BrowserWindow({
    width: 1380,
    height: 920,
    minWidth: 940,
    minHeight: 680,
    title: "Kirakira Agent",
    backgroundColor: "#f5f7f8",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devUrl = rendererUrl();
  if (devUrl) {
    await window.loadURL(devUrl);
  } else {
    await window.loadFile(join(__dirname, "..", "renderer", "index.html"));
  }
};

ipcMain.handle("runtime:connect", async () => {
  await ensureConnected();
});

ipcMain.handle("runtime:disconnect", () => {
  subscriptions.clear();
  client.disconnect();
  connected = false;
});

ipcMain.handle(
  "runtime:submitPrompt",
  async (_event, request: SubmitPromptRequest) => {
    await ensureConnected();
    const runId = await client.submitPrompt(
      request.prompt,
      request.mode ?? "interactive",
      request.options,
    );
    return { runId };
  },
);

ipcMain.handle("runtime:getState", async (_event, runId: string) => {
  await ensureConnected();
  return { runId, state: await client.getState(runId) };
});

ipcMain.handle(
  "runtime:subscribeRun",
  async (
    event,
    request: {
      runId: string;
      options?: SubscribeRunOptions;
      subscriptionId: string;
    },
  ) => {
    await ensureConnected();
    subscriptions.set(request.subscriptionId, {
      runId: request.runId,
      webContentsId: event.sender.id,
      options: request.options,
    });
    client.subscribeToRun(request.runId, {
      afterSeq: request.options?.afterSeq,
    });
  },
);

ipcMain.handle(
  "runtime:unsubscribeRun",
  (_event, request: { subscriptionId: string }) => {
    subscriptions.delete(request.subscriptionId);
  },
);

ipcMain.handle("runtime:approve", async (_event, decision: ApprovalDecision) => {
  await ensureConnected();
  await client.approve(decision.ticketId, decision.decision, decision.reason, decision.runId);
});

ipcMain.handle(
  "runtime:cancel",
  async (_event, request: { runId: string; reason?: string }) => {
    await ensureConnected();
    await client.cancel(request.runId, request.reason);
  },
);

ipcMain.handle("runtime:drain", async () => {
  await ensureConnected();
  await client.drain();
});

app.whenReady().then(() => {
  void createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

import { app, BrowserWindow, ipcMain, webContents, type IpcMainInvokeEvent } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DaemonClient } from "@kirakira/runtime-daemon";
import { createRuntimeIpcController } from "./runtime-ipc.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const client = new DaemonClient();

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

const trustedRendererOrigins = () => {
  const devUrl = rendererUrl();
  if (!devUrl) return new Set<string>();
  return new Set([new URL(devUrl).origin]);
};

const isTrustedRuntimeSender = (event: IpcMainInvokeEvent): boolean => {
  const frameUrl = event.senderFrame?.url;
  if (!frameUrl) return false;
  try {
    const parsed = new URL(frameUrl);
    if (parsed.protocol === "file:") return true;
    return trustedRendererOrigins().has(parsed.origin);
  } catch {
    return false;
  }
};

createRuntimeIpcController({
  client,
  socketPath: process.env.KIRAKIRA_DAEMON_SOCKET,
  isTrustedSender: isTrustedRuntimeSender,
  webContentsFromId(id) {
    return webContents.fromId(id) ?? undefined;
  },
}).register(ipcMain);

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

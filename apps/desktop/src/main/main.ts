import { app, BrowserWindow, ipcMain, webContents, type IpcMainInvokeEvent } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DaemonClient } from "@kirakira/runtime-daemon";
import {
  desktopRendererUrl,
  isTrustedDesktopRuntimeSenderUrl,
} from "./renderer-endpoint.js";
import { createRuntimeIpcController } from "./runtime-ipc.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packagedRendererPath = join(__dirname, "..", "renderer", "index.html");
const packagedRendererUrl = pathToFileURL(packagedRendererPath).toString();
const client = new DaemonClient();

const isTrustedRuntimeSender = (event: IpcMainInvokeEvent): boolean => {
  return isTrustedDesktopRuntimeSenderUrl(event.senderFrame?.url, process.env, {
    packagedRendererUrl,
  });
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

  const devUrl = desktopRendererUrl();
  if (devUrl) {
    await window.loadURL(devUrl);
  } else {
    await window.loadFile(packagedRendererPath);
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

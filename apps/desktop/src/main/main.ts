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
const WORKBENCH_ELECTRON_SMOKE_ENV = "KIRAKIRA_WORKBENCH_ELECTRON_SMOKE";
const DEFAULT_ELECTRON_SMOKE_TIMEOUT_MS = 30_000;
let electronSmokeFinished = false;

function isWorkbenchElectronSmoke(): boolean {
  return process.env[WORKBENCH_ELECTRON_SMOKE_ENV] === "1";
}

function electronSmokeTimeoutMs(): number {
  const value = Number(process.env.KIRAKIRA_WORKBENCH_ELECTRON_SMOKE_TIMEOUT_MS);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_ELECTRON_SMOKE_TIMEOUT_MS;
}

function finishElectronSmoke(error?: unknown): void {
  if (electronSmokeFinished) return;
  electronSmokeFinished = true;
  if (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } else {
    console.log("Electron smoke renderer loaded.");
  }
  app.quit();
}

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
  const smoke = isWorkbenchElectronSmoke();
  const window = new BrowserWindow({
    show: !smoke,
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

  if (smoke) {
    const timeoutMs = electronSmokeTimeoutMs();
    const timeout = setTimeout(() => {
      finishElectronSmoke(
        new Error(`Electron smoke timed out after ${timeoutMs}ms`),
      );
    }, timeoutMs);

    window.webContents.once("did-finish-load", () => {
      clearTimeout(timeout);
      finishElectronSmoke();
    });
    window.webContents.once("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
      clearTimeout(timeout);
      finishElectronSmoke(
        new Error(
          `Electron smoke failed to load ${validatedURL}: ${errorCode} ${errorDescription}`,
        ),
      );
    });
  }

  const devUrl = desktopRendererUrl();
  if (devUrl) {
    await window.loadURL(devUrl);
  } else {
    await window.loadFile(packagedRendererPath);
  }
};

app.whenReady().then(() => {
  void createWindow().catch((error) => {
    if (isWorkbenchElectronSmoke()) {
      finishElectronSmoke(error);
      return;
    }
    console.error(error instanceof Error ? error.message : String(error));
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

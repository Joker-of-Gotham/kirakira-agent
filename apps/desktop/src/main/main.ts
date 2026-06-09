import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  webContents,
  type IpcMainInvokeEvent,
} from "electron";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DaemonClient } from "@kirakira/runtime-daemon";
import { isTrustedDesktopRuntimeSenderUrl } from "./renderer-endpoint.js";
import { createRuntimeIpcController } from "./runtime-ipc.js";
import {
  canOpenExternalDesktopUrl,
  desktopWindowOptionsFromManifest,
  resolveDesktopStartupManifest,
} from "./startup-manifest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const startupManifest = resolveDesktopStartupManifest({ mainDir: __dirname });
const client = new DaemonClient();
let electronSmokeFinished = false;

function isWorkbenchElectronSmoke(): boolean {
  return startupManifest.smoke.enabled;
}

function electronSmokeTimeoutMs(): number {
  return startupManifest.smoke.timeoutMs;
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
    packagedRendererUrl: startupManifest.renderer.fileUrl,
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

function isTrustedRendererUrl(url: string): boolean {
  return isTrustedDesktopRuntimeSenderUrl(url, process.env, {
    packagedRendererUrl: startupManifest.renderer.fileUrl,
  });
}

function applyNavigationPolicy(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (!isTrustedRendererUrl(url) && canOpenExternalDesktopUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (isTrustedRendererUrl(url)) return;
    event.preventDefault();
    if (canOpenExternalDesktopUrl(url)) {
      void shell.openExternal(url);
    }
  });
}

const createWindow = async () => {
  const smoke = isWorkbenchElectronSmoke();
  const window = new BrowserWindow(desktopWindowOptionsFromManifest(startupManifest));
  applyNavigationPolicy(window);

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

  if (startupManifest.renderer.url) {
    await window.loadURL(startupManifest.renderer.url);
  } else {
    await window.loadFile(startupManifest.renderer.filePath);
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

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const mainSource = () =>
  readFileSync(resolve("apps/desktop/src/main/main.ts"), "utf8");

describe("desktop main process security contract", () => {
  it("keeps the Electron renderer isolated and sandboxed", () => {
    const source = mainSource();

    expect(source).toContain("contextIsolation: true");
    expect(source).toContain("nodeIntegration: false");
    expect(source).toContain("sandbox: true");
    expect(source).not.toContain("webSecurity: false");
    expect(source).not.toContain("allowRunningInsecureContent: true");
  });

  it("loads only the configured local renderer URL or packaged renderer file", () => {
    const source = mainSource();

    expect(source).toContain("desktopRendererUrl()");
    expect(source).toContain("window.loadURL(devUrl)");
    expect(source).toContain("window.loadFile(packagedRendererPath)");
    expect(source).not.toContain("http://127.0.0.1:5173");
  });

  it("validates IPC senders through the desktop runtime trust helper", () => {
    const source = mainSource();

    expect(source).toContain("isTrustedDesktopRuntimeSenderUrl(");
    expect(source).toContain("event.senderFrame?.url");
    expect(source).toContain("isTrustedSender: isTrustedRuntimeSender");
  });

  it("supports a hidden bounded Electron smoke mode without weakening renderer security", () => {
    const source = mainSource();

    expect(source).toContain("KIRAKIRA_WORKBENCH_ELECTRON_SMOKE");
    expect(source).toContain("show: !smoke");
    expect(source).toContain("did-finish-load");
    expect(source).toContain("did-fail-load");
    expect(source).toContain("Electron smoke timed out");
    expect(source).toContain("contextIsolation: true");
    expect(source).toContain("nodeIntegration: false");
    expect(source).toContain("sandbox: true");
  });
});

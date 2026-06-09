import { describe, expect, it } from "vitest";
import { join, resolve } from "node:path";
import {
  DEFAULT_ELECTRON_SMOKE_TIMEOUT_MS,
  DEFAULT_ELECTRON_SMOKE_INTERVAL_MS,
  DEFAULT_ELECTRON_SMOKE_SELECTORS,
  DEFAULT_ELECTRON_SMOKE_TEXT,
  canOpenExternalDesktopUrl,
  desktopWindowOptionsFromManifest,
  electronSmokeIntervalMs,
  electronSmokeSelectors,
  electronSmokeTextMarkers,
  electronSmokeTimeoutMs,
  isWorkbenchElectronSmoke,
  resolveDesktopStartupManifest,
} from "../../../apps/desktop/src/main/startup-manifest.js";

const mainDir = resolve("apps/desktop/dist/main");

describe("desktop startup manifest", () => {
  it("resolves a profile-provided loopback renderer URL without inventing ports", () => {
    const manifest = resolveDesktopStartupManifest(
      { mainDir },
      {
        KIRAKIRA_DESKTOP_RENDERER_URL: "http://127.0.0.1:5174",
        KIRAKIRA_WORKBENCH_ELECTRON_SMOKE: "1",
        KIRAKIRA_WORKBENCH_ELECTRON_SMOKE_TIMEOUT_MS: "2500",
      },
    );

    expect(manifest.renderer).toMatchObject({
      mode: "dev",
      url: "http://127.0.0.1:5174/",
      trustedOrigins: ["http://127.0.0.1:5174"],
    });
    expect(manifest.renderer.filePath).toBe(join(mainDir, "..", "renderer", "index.html"));
    expect(manifest.renderer.fileUrl).toContain("apps/desktop/dist/renderer/index.html");
    expect(manifest.window.show).toBe(false);
    expect(manifest.smoke.timeoutMs).toBe(2500);
    expect(manifest.smoke.intervalMs).toBe(DEFAULT_ELECTRON_SMOKE_INTERVAL_MS);
    expect(manifest.smoke.selectors).toEqual([...DEFAULT_ELECTRON_SMOKE_SELECTORS]);
    expect(DEFAULT_ELECTRON_SMOKE_SELECTORS).toContain(
      '[data-kk-presentation-surface="desktop"]',
    );
    expect(manifest.smoke.textMarkers).toEqual([...DEFAULT_ELECTRON_SMOKE_TEXT]);
    expect(JSON.stringify(manifest)).not.toContain("5173");
  });

  it("falls back to the packaged renderer file when no renderer URL is configured", () => {
    const manifest = resolveDesktopStartupManifest({ mainDir }, {});

    expect(manifest.renderer).toMatchObject({
      mode: "packaged",
      url: null,
      trustedOrigins: [],
    });
    expect(manifest.window.show).toBe(true);
    expect(manifest.security.webPreferences).toMatchObject({
      preload: join(mainDir, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    });
  });

  it("publishes the preload bridge contract used by the renderer", () => {
    const manifest = resolveDesktopStartupManifest({ mainDir }, {});

    expect(manifest.preload.apiKey).toBe("kirakiraRuntime");
    expect(manifest.preload.methods).toEqual([
      "connect",
      "disconnect",
      "getStatus",
      "submitPrompt",
      "getState",
      "getArtifactContent",
      "listMcpTools",
      "callMcpTool",
      "subscribeRun",
      "approve",
      "cancel",
      "drain",
    ]);
  });

  it("keeps smoke mode opt-in and bounded by a positive timeout", () => {
    expect(isWorkbenchElectronSmoke({})).toBe(false);
    expect(isWorkbenchElectronSmoke({ KIRAKIRA_WORKBENCH_ELECTRON_SMOKE: "1" })).toBe(true);
    expect(electronSmokeTimeoutMs({ KIRAKIRA_WORKBENCH_ELECTRON_SMOKE_TIMEOUT_MS: "0" })).toBe(
      DEFAULT_ELECTRON_SMOKE_TIMEOUT_MS,
    );
    expect(electronSmokeTimeoutMs({ KIRAKIRA_WORKBENCH_ELECTRON_SMOKE_TIMEOUT_MS: "42" })).toBe(
      42,
    );
    expect(electronSmokeIntervalMs({ KIRAKIRA_WORKBENCH_ELECTRON_SMOKE_INTERVAL_MS: "0" })).toBe(
      DEFAULT_ELECTRON_SMOKE_INTERVAL_MS,
    );
    expect(electronSmokeIntervalMs({ KIRAKIRA_WORKBENCH_ELECTRON_SMOKE_INTERVAL_MS: "10" })).toBe(
      10,
    );
  });

  it("keeps renderer content smoke markers configurable", () => {
    expect(electronSmokeSelectors({})).toEqual([...DEFAULT_ELECTRON_SMOKE_SELECTORS]);
    expect(electronSmokeTextMarkers({})).toEqual([...DEFAULT_ELECTRON_SMOKE_TEXT]);
    expect(
      electronSmokeSelectors({
        KIRAKIRA_WORKBENCH_ELECTRON_SMOKE_SELECTORS:
          '["main.kk-shell","[aria-label=\\"Runtime workspace\\"]"]',
      }),
    ).toEqual(["main.kk-shell", '[aria-label="Runtime workspace"]']);
    expect(
      electronSmokeTextMarkers({
        KIRAKIRA_WORKBENCH_ELECTRON_SMOKE_TEXT: "Kirakira Agent,Desktop IPC",
      }),
    ).toEqual(["Kirakira Agent", "Desktop IPC"]);
    expect(() =>
      electronSmokeSelectors({
        KIRAKIRA_WORKBENCH_ELECTRON_SMOKE_SELECTORS: "[1]",
      }),
    ).toThrow("KIRAKIRA_WORKBENCH_ELECTRON_SMOKE_SELECTORS must be a JSON string array");
  });

  it("creates BrowserWindow options from the manifest security contract", () => {
    const manifest = resolveDesktopStartupManifest({ mainDir }, {});

    expect(desktopWindowOptionsFromManifest(manifest)).toMatchObject({
      show: true,
      width: 1380,
      height: 920,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
  });

  it("limits shell-open external URLs to browser-safe protocols", () => {
    expect(canOpenExternalDesktopUrl("https://kirakira.local/docs")).toBe(true);
    expect(canOpenExternalDesktopUrl("http://127.0.0.1:5183")).toBe(true);
    expect(canOpenExternalDesktopUrl("mailto:support@example.test")).toBe(true);
    expect(canOpenExternalDesktopUrl("file:///C:/secret.txt")).toBe(false);
    expect(canOpenExternalDesktopUrl("javascript:alert(1)")).toBe(false);
    expect(canOpenExternalDesktopUrl("not a url")).toBe(false);
  });
});

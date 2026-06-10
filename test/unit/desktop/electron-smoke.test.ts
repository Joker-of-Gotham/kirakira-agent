import { describe, expect, it } from "vitest";
import {
  assertElectronSmokeSecurityPreferences,
  buildElectronSmokeRendererProbeScript,
  electronSmokeRendererProbeFailures,
  waitForElectronSmokeRendererContent,
  type ElectronSmokeRendererProbe,
} from "../../../apps/desktop/src/main/electron-smoke.js";
import { resolveDesktopStartupManifest } from "../../../apps/desktop/src/main/startup-manifest.js";

const manifest = () =>
  resolveDesktopStartupManifest(
    { mainDir: "apps/desktop/dist/main" },
    {
      KIRAKIRA_DESKTOP_RENDERER_URL: "http://127.0.0.1:5174",
      KIRAKIRA_WORKBENCH_ELECTRON_SMOKE: "1",
      KIRAKIRA_WORKBENCH_ELECTRON_SMOKE_TIMEOUT_MS: "50",
      KIRAKIRA_WORKBENCH_ELECTRON_SMOKE_INTERVAL_MS: "1",
    },
  );

describe("desktop Electron smoke assertions", () => {
  it("keeps the smoke security baseline aligned with Electron hardening guidance", () => {
    assertElectronSmokeSecurityPreferences({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    });

    expect(() =>
      assertElectronSmokeSecurityPreferences({
        contextIsolation: false,
        nodeIntegration: true,
        sandbox: false,
        webSecurity: false,
        allowRunningInsecureContent: true,
        experimentalFeatures: true,
        enableBlinkFeatures: "DangerFeature",
        webviewTag: true,
      }),
    ).toThrow(
      /contextIsolation must be true.*nodeIntegration must not be true.*sandbox must be true.*webSecurity must not be false/s,
    );
  });

  it("generates a renderer probe from manifest-owned selectors and bridge methods", () => {
    const script = buildElectronSmokeRendererProbeScript({
      selectors: ["main.kk-shell"],
      textMarkers: ["Desktop IPC"],
      bridgeApiKey: "kirakiraRuntime",
      bridgeApiMethods: ["connect", "drain"],
    });

    expect(script).toContain("main.kk-shell");
    expect(script).toContain("Desktop IPC");
    expect(script).toContain("kirakiraRuntime");
    expect(script).toContain("connect");
    expect(script).toContain("typeof globals.require");
  });

  it("accepts a mounted workbench probe and rejects blank or unsafe renderer state", () => {
    expect(electronSmokeRendererProbeFailures(validProbe())).toEqual([]);

    expect(
      electronSmokeRendererProbeFailures({
        ...validProbe(),
        rootChildCount: 0,
        selectors: [{ selector: "main.kk-shell", found: false }],
        globals: {
          requireType: "function",
          processType: "object",
          nodeVersionExposed: true,
          electronApiExposed: true,
        },
      }),
    ).toEqual([
      "#root has no mounted renderer children",
      "missing selector main.kk-shell",
      "renderer require global is function",
      "renderer exposes process.versions.node",
      "renderer exposes a raw Electron global",
    ]);
  });

  it("polls until the renderer reports real content instead of load-only success", async () => {
    const calls: string[] = [];
    const probes = [
      { ...validProbe(), rootChildCount: 0 },
      validProbe(),
    ];
    const fakeWebContents = {
      async executeJavaScript(script: string) {
        calls.push(script);
        return probes.shift();
      },
    };

    await expect(waitForElectronSmokeRendererContent(fakeWebContents, manifest())).resolves.toMatchObject({
      rootChildCount: 1,
    });
    expect(calls).toHaveLength(2);
  });

  it("reports missing renderer markers with a body text sample", async () => {
    const fakeWebContents = {
      async executeJavaScript() {
        return {
          ...validProbe(),
          selectors: [{ selector: "main.kk-shell", found: false }],
          bodyTextSample: "blank dev shell",
        };
      },
    };

    await expect(
      waitForElectronSmokeRendererContent(fakeWebContents, manifest()),
    ).rejects.toThrow(
      'Electron smoke renderer content assertion failed: missing selector main.kk-shell; body text sample: "blank dev shell"',
    );
  });

  it("requires the desktop presentation surface identity marker", () => {
    expect(
      electronSmokeRendererProbeFailures({
        ...validProbe(),
        selectors: [
          { selector: "main.kk-shell", found: true },
          { selector: '[data-kk-presentation-surface="desktop"]', found: false },
          { selector: '[aria-label="Run navigation"]', found: true },
          { selector: '[aria-label="Runtime workspace"]', found: true },
        ],
      }),
    ).toContain('missing selector [data-kk-presentation-surface="desktop"]');
  });
});

function validProbe(): ElectronSmokeRendererProbe {
  return {
    readyState: "complete",
    title: "Kirakira Agent Desktop",
    rootChildCount: 1,
    selectors: [
      { selector: "main.kk-shell", found: true },
      { selector: '[data-kk-presentation-surface="desktop"]', found: true },
      { selector: '[aria-label="Run navigation"]', found: true },
      { selector: '[aria-label="Runtime workspace"]', found: true },
    ],
    textMarkers: [
      { text: "Kirakira Agent", found: true },
      { text: "Desktop IPC", found: true },
      { text: "Runs Workbench", found: true },
      { text: "Recent Runs", found: true },
    ],
    bridge: {
      apiKey: "kirakiraRuntime",
      available: true,
      methods: [
        { name: "connect", type: "function" },
        { name: "disconnect", type: "function" },
        { name: "getStatus", type: "function" },
        { name: "submitPrompt", type: "function" },
        { name: "getState", type: "function" },
        { name: "getArtifactContent", type: "function" },
        { name: "listMcpTools", type: "function" },
        { name: "callMcpTool", type: "function" },
        { name: "subscribeRun", type: "function" },
        { name: "steer", type: "function" },
        { name: "enqueue", type: "function" },
        { name: "approve", type: "function" },
        { name: "provideInput", type: "function" },
        { name: "resume", type: "function" },
        { name: "inspect", type: "function" },
        { name: "cancel", type: "function" },
        { name: "drain", type: "function" },
        { name: "onOpenCommandPalette", type: "function" },
      ],
    },
    globals: {
      requireType: "undefined",
      processType: "undefined",
      nodeVersionExposed: false,
      electronApiExposed: false,
    },
    bodyTextSample: "Kirakira Agent Desktop IPC Runs Workbench Recent Runs",
  };
}

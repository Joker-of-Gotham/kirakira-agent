import type {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  WebContents,
} from "electron";
import { setTimeout as delay } from "node:timers/promises";
import type { DesktopStartupManifest } from "./startup-manifest.js";

type WebPreferences = BrowserWindowConstructorOptions["webPreferences"];

export interface ElectronSmokeContentExpectation {
  selectors: readonly string[];
  textMarkers: readonly string[];
  bridgeApiKey: string;
  bridgeApiMethods: readonly string[];
}

export interface ElectronSmokeRendererProbe {
  readyState: string;
  title: string;
  rootChildCount: number;
  selectors: Array<{ selector: string; found: boolean }>;
  textMarkers: Array<{ text: string; found: boolean }>;
  bridge: {
    apiKey: string;
    available: boolean;
    methods: Array<{ name: string; type: string }>;
  };
  globals: {
    requireType: string;
    processType: string;
    nodeVersionExposed: boolean;
    electronApiExposed: boolean;
  };
  bodyTextSample: string;
}

export function electronSmokeContentExpectationFromManifest(
  manifest: DesktopStartupManifest,
): ElectronSmokeContentExpectation {
  return {
    selectors: manifest.smoke.selectors,
    textMarkers: manifest.smoke.textMarkers,
    bridgeApiKey: manifest.preload.apiKey,
    bridgeApiMethods: manifest.preload.methods,
  };
}

export function assertElectronSmokeSecurityPreferences(
  webPreferences: WebPreferences,
): void {
  const failures: string[] = [];
  if (!webPreferences) {
    failures.push("webPreferences are missing");
  } else {
    if (webPreferences.contextIsolation !== true) {
      failures.push("contextIsolation must be true");
    }
    if (webPreferences.nodeIntegration === true) {
      failures.push("nodeIntegration must not be true");
    }
    if (webPreferences.nodeIntegrationInWorker === true) {
      failures.push("nodeIntegrationInWorker must not be true");
    }
    if (webPreferences.nodeIntegrationInSubFrames === true) {
      failures.push("nodeIntegrationInSubFrames must not be true");
    }
    if (webPreferences.sandbox !== true) {
      failures.push("sandbox must be true");
    }
    if (webPreferences.webSecurity === false) {
      failures.push("webSecurity must not be false");
    }
    if (webPreferences.allowRunningInsecureContent === true) {
      failures.push("allowRunningInsecureContent must not be true");
    }
    if (webPreferences.experimentalFeatures === true) {
      failures.push("experimentalFeatures must not be true");
    }
    if (webPreferences.enableBlinkFeatures) {
      failures.push("enableBlinkFeatures must not be set");
    }
    if (webPreferences.webviewTag === true) {
      failures.push("webviewTag must not be true");
    }
  }

  if (failures.length > 0) {
    throw new Error(`Electron smoke security preferences failed: ${failures.join("; ")}`);
  }
}

export function buildElectronSmokeRendererProbeScript(
  expectation: ElectronSmokeContentExpectation,
): string {
  const payload = JSON.stringify({
    selectors: [...expectation.selectors],
    textMarkers: [...expectation.textMarkers],
    bridgeApiKey: expectation.bridgeApiKey,
    bridgeApiMethods: [...expectation.bridgeApiMethods],
  });

  return `(() => {
    const config = ${payload};
    const root = document.getElementById("root");
    const bodyText = document.body?.innerText ?? "";
    const normalizedBodyText = bodyText.toLocaleLowerCase();
    const globals = globalThis;
    const bridge = globals[config.bridgeApiKey];
    const processGlobal = globals.process;
    return {
      readyState: document.readyState,
      title: document.title,
      rootChildCount: root?.childElementCount ?? 0,
      selectors: config.selectors.map((selector) => ({
        selector,
        found: Boolean(document.querySelector(selector)),
      })),
      textMarkers: config.textMarkers.map((text) => ({
        text,
        found: normalizedBodyText.includes(text.toLocaleLowerCase()),
      })),
      bridge: {
        apiKey: config.bridgeApiKey,
        available: Boolean(bridge && typeof bridge === "object"),
        methods: config.bridgeApiMethods.map((name) => ({
          name,
          type: typeof bridge?.[name],
        })),
      },
      globals: {
        requireType: typeof globals.require,
        processType: typeof processGlobal,
        nodeVersionExposed: Boolean(processGlobal?.versions?.node),
        electronApiExposed: Boolean(globals.electron || globals.ipcRenderer),
      },
      bodyTextSample: bodyText.replace(/\\s+/g, " ").trim().slice(0, 240),
    };
  })()`;
}

export function electronSmokeRendererProbeFailures(
  probe: ElectronSmokeRendererProbe,
): string[] {
  const failures: string[] = [];
  if (!["interactive", "complete"].includes(probe.readyState)) {
    failures.push(`document readiness is ${probe.readyState}`);
  }
  if (probe.rootChildCount < 1) {
    failures.push("#root has no mounted renderer children");
  }
  for (const selector of probe.selectors) {
    if (!selector.found) {
      failures.push(`missing selector ${selector.selector}`);
    }
  }
  for (const marker of probe.textMarkers) {
    if (!marker.found) {
      failures.push(`missing text marker ${JSON.stringify(marker.text)}`);
    }
  }
  if (!probe.bridge.available) {
    failures.push(`missing preload bridge ${probe.bridge.apiKey}`);
  }
  for (const method of probe.bridge.methods) {
    if (method.type !== "function") {
      failures.push(`preload bridge method ${method.name} is ${method.type}`);
    }
  }
  if (probe.globals.requireType !== "undefined") {
    failures.push(`renderer require global is ${probe.globals.requireType}`);
  }
  if (probe.globals.nodeVersionExposed) {
    failures.push("renderer exposes process.versions.node");
  }
  if (probe.globals.electronApiExposed) {
    failures.push("renderer exposes a raw Electron global");
  }
  return failures;
}

export async function evaluateElectronSmokeRendererContent(
  webContents: Pick<WebContents, "executeJavaScript">,
  expectation: ElectronSmokeContentExpectation,
): Promise<ElectronSmokeRendererProbe> {
  return webContents.executeJavaScript(
    buildElectronSmokeRendererProbeScript(expectation),
    true,
  ) as Promise<ElectronSmokeRendererProbe>;
}

export async function waitForElectronSmokeRendererContent(
  webContents: Pick<WebContents, "executeJavaScript">,
  manifest: DesktopStartupManifest,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<ElectronSmokeRendererProbe> {
  const expectation = electronSmokeContentExpectationFromManifest(manifest);
  const timeoutMs = options.timeoutMs ?? manifest.smoke.timeoutMs;
  const intervalMs = options.intervalMs ?? manifest.smoke.intervalMs;
  const deadline = Date.now() + timeoutMs;
  let latestProbe: ElectronSmokeRendererProbe | undefined;
  let latestFailures: string[] = [];

  for (;;) {
    try {
      latestProbe = await evaluateElectronSmokeRendererContent(webContents, expectation);
      latestFailures = electronSmokeRendererProbeFailures(latestProbe);
      if (latestFailures.length === 0) return latestProbe;
    } catch (error) {
      latestFailures = [
        `renderer probe failed: ${error instanceof Error ? error.message : String(error)}`,
      ];
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    await delay(Math.min(intervalMs, remainingMs));
  }

  const sample = latestProbe?.bodyTextSample
    ? `; body text sample: ${JSON.stringify(latestProbe.bodyTextSample)}`
    : "";
  throw new Error(
    `Electron smoke renderer content assertion failed: ${latestFailures.join("; ")}${sample}`,
  );
}

export async function assertElectronSmokeWindow(
  window: Pick<BrowserWindow, "webContents">,
  manifest: DesktopStartupManifest,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<ElectronSmokeRendererProbe> {
  assertElectronSmokeSecurityPreferences(manifest.security.webPreferences);
  return waitForElectronSmokeRendererContent(window.webContents, manifest, options);
}

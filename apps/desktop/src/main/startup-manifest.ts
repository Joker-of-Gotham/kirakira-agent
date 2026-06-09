import type { BrowserWindowConstructorOptions } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  desktopRendererUrl,
  trustedDesktopRendererOrigins,
  type DesktopRendererEndpointEnv,
} from "./renderer-endpoint.js";
import {
  KIRAKIRA_PRELOAD_API_KEY,
  KIRAKIRA_PRELOAD_API_METHODS,
} from "./preload-contract.js";

export const WORKBENCH_ELECTRON_SMOKE_ENV = "KIRAKIRA_WORKBENCH_ELECTRON_SMOKE";
export const WORKBENCH_ELECTRON_SMOKE_TIMEOUT_ENV =
  "KIRAKIRA_WORKBENCH_ELECTRON_SMOKE_TIMEOUT_MS";
export const WORKBENCH_ELECTRON_SMOKE_INTERVAL_ENV =
  "KIRAKIRA_WORKBENCH_ELECTRON_SMOKE_INTERVAL_MS";
export const WORKBENCH_ELECTRON_SMOKE_SELECTORS_ENV =
  "KIRAKIRA_WORKBENCH_ELECTRON_SMOKE_SELECTORS";
export const WORKBENCH_ELECTRON_SMOKE_TEXT_ENV =
  "KIRAKIRA_WORKBENCH_ELECTRON_SMOKE_TEXT";
export const DEFAULT_ELECTRON_SMOKE_TIMEOUT_MS = 30_000;
export const DEFAULT_ELECTRON_SMOKE_INTERVAL_MS = 250;
export const DEFAULT_ELECTRON_SMOKE_SELECTORS = [
  "main.kk-shell",
  '[data-kk-presentation-surface="desktop"]',
  '[aria-label="Run navigation"]',
  '[aria-label="Runtime workspace"]',
] as const;
export const DEFAULT_ELECTRON_SMOKE_TEXT = [
  "Kirakira Agent",
  "Desktop IPC",
  "Runs Workbench",
  "Recent Runs",
] as const;

const EXTERNAL_BROWSER_PROTOCOLS = ["https:", "http:", "mailto:"] as const;

export interface DesktopStartupManifestEnv extends DesktopRendererEndpointEnv {
  KIRAKIRA_WORKBENCH_ELECTRON_SMOKE?: string;
  KIRAKIRA_WORKBENCH_ELECTRON_SMOKE_TIMEOUT_MS?: string;
  KIRAKIRA_WORKBENCH_ELECTRON_SMOKE_INTERVAL_MS?: string;
  KIRAKIRA_WORKBENCH_ELECTRON_SMOKE_SELECTORS?: string;
  KIRAKIRA_WORKBENCH_ELECTRON_SMOKE_TEXT?: string;
}

export interface DesktopStartupManifestPaths {
  mainDir: string;
  packagedRendererPath?: string;
  preloadPath?: string;
}

export interface DesktopStartupRendererManifest {
  mode: "dev" | "packaged";
  url: string | null;
  filePath: string;
  fileUrl: string;
  trustedOrigins: string[];
}

export interface DesktopStartupManifest {
  renderer: DesktopStartupRendererManifest;
  preload: {
    apiKey: typeof KIRAKIRA_PRELOAD_API_KEY;
    methods: typeof KIRAKIRA_PRELOAD_API_METHODS;
  };
  smoke: {
    enabled: boolean;
    envKey: typeof WORKBENCH_ELECTRON_SMOKE_ENV;
    timeoutEnvKey: typeof WORKBENCH_ELECTRON_SMOKE_TIMEOUT_ENV;
    timeoutMs: number;
    intervalEnvKey: typeof WORKBENCH_ELECTRON_SMOKE_INTERVAL_ENV;
    intervalMs: number;
    selectorsEnvKey: typeof WORKBENCH_ELECTRON_SMOKE_SELECTORS_ENV;
    selectors: string[];
    textEnvKey: typeof WORKBENCH_ELECTRON_SMOKE_TEXT_ENV;
    textMarkers: string[];
  };
  window: Pick<
    BrowserWindowConstructorOptions,
    "backgroundColor" | "height" | "minHeight" | "minWidth" | "show" | "title" | "width"
  >;
  security: {
    webPreferences: NonNullable<BrowserWindowConstructorOptions["webPreferences"]>;
    externalOpenProtocols: typeof EXTERNAL_BROWSER_PROTOCOLS;
  };
}

export function isWorkbenchElectronSmoke(
  env: DesktopStartupManifestEnv = process.env,
): boolean {
  return env[WORKBENCH_ELECTRON_SMOKE_ENV] === "1";
}

export function electronSmokeTimeoutMs(
  env: DesktopStartupManifestEnv = process.env,
): number {
  const value = Number(env[WORKBENCH_ELECTRON_SMOKE_TIMEOUT_ENV]);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_ELECTRON_SMOKE_TIMEOUT_MS;
}

export function electronSmokeIntervalMs(
  env: DesktopStartupManifestEnv = process.env,
): number {
  const value = Number(env[WORKBENCH_ELECTRON_SMOKE_INTERVAL_ENV]);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_ELECTRON_SMOKE_INTERVAL_MS;
}

function parseSmokeListEnv(
  value: string | undefined,
  fallback: readonly string[],
  envKey: string,
): string[] {
  const trimmed = value?.trim();
  if (!trimmed) return [...fallback];

  const rawValues = trimmed.startsWith("[")
    ? parseJsonSmokeList(trimmed, envKey)
    : trimmed.split(",");
  const values = rawValues.map((item) => item.trim()).filter(Boolean);
  if (values.length === 0) {
    throw new Error(`${envKey} must contain at least one non-empty value`);
  }
  return values;
}

function parseJsonSmokeList(value: string, envKey: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(
      `${envKey} must be a comma-separated list or JSON string array: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error(`${envKey} must be a JSON string array`);
  }
  return parsed;
}

export function electronSmokeSelectors(
  env: DesktopStartupManifestEnv = process.env,
): string[] {
  return parseSmokeListEnv(
    env[WORKBENCH_ELECTRON_SMOKE_SELECTORS_ENV],
    DEFAULT_ELECTRON_SMOKE_SELECTORS,
    WORKBENCH_ELECTRON_SMOKE_SELECTORS_ENV,
  );
}

export function electronSmokeTextMarkers(
  env: DesktopStartupManifestEnv = process.env,
): string[] {
  return parseSmokeListEnv(
    env[WORKBENCH_ELECTRON_SMOKE_TEXT_ENV],
    DEFAULT_ELECTRON_SMOKE_TEXT,
    WORKBENCH_ELECTRON_SMOKE_TEXT_ENV,
  );
}

export function canOpenExternalDesktopUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return EXTERNAL_BROWSER_PROTOCOLS.includes(
      url.protocol as (typeof EXTERNAL_BROWSER_PROTOCOLS)[number],
    );
  } catch {
    return false;
  }
}

export function resolveDesktopStartupManifest(
  paths: DesktopStartupManifestPaths,
  env: DesktopStartupManifestEnv = process.env,
): DesktopStartupManifest {
  const filePath =
    paths.packagedRendererPath ?? join(paths.mainDir, "..", "renderer", "index.html");
  const fileUrl = pathToFileURL(filePath).toString();
  const url = desktopRendererUrl(env);
  const smokeEnabled = isWorkbenchElectronSmoke(env);

  return {
    renderer: {
      mode: url ? "dev" : "packaged",
      url,
      filePath,
      fileUrl,
      trustedOrigins: [...trustedDesktopRendererOrigins(env)],
    },
    preload: {
      apiKey: KIRAKIRA_PRELOAD_API_KEY,
      methods: KIRAKIRA_PRELOAD_API_METHODS,
    },
    smoke: {
      enabled: smokeEnabled,
      envKey: WORKBENCH_ELECTRON_SMOKE_ENV,
      timeoutEnvKey: WORKBENCH_ELECTRON_SMOKE_TIMEOUT_ENV,
      timeoutMs: electronSmokeTimeoutMs(env),
      intervalEnvKey: WORKBENCH_ELECTRON_SMOKE_INTERVAL_ENV,
      intervalMs: electronSmokeIntervalMs(env),
      selectorsEnvKey: WORKBENCH_ELECTRON_SMOKE_SELECTORS_ENV,
      selectors: electronSmokeSelectors(env),
      textEnvKey: WORKBENCH_ELECTRON_SMOKE_TEXT_ENV,
      textMarkers: electronSmokeTextMarkers(env),
    },
    window: {
      show: !smokeEnabled,
      width: 1380,
      height: 920,
      minWidth: 940,
      minHeight: 680,
      title: "Kirakira Agent",
      backgroundColor: "#f5f7f8",
    },
    security: {
      webPreferences: {
        preload: paths.preloadPath ?? join(paths.mainDir, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
      externalOpenProtocols: EXTERNAL_BROWSER_PROTOCOLS,
    },
  };
}

export function desktopWindowOptionsFromManifest(
  manifest: DesktopStartupManifest,
): BrowserWindowConstructorOptions {
  return {
    ...manifest.window,
    webPreferences: {
      ...manifest.security.webPreferences,
    },
  };
}

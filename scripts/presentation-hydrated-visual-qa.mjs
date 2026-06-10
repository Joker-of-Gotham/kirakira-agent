#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ensureEnvFile, ensureMcpConfig } from "./kirakira-common.mjs";
import {
  buildWorkbenchSmokeCommand,
  buildWorkbenchSmokeGateCommand,
  runWorkbenchSmoke,
} from "./kirakira-workbench-smoke.mjs";
import { waitForReadinessChecks } from "./kirakira-workbench.mjs";
import { loadRuntimeProfiles } from "./runtime-profile.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_GATE = "presentation-hydrated-visual-qa";
const DEFAULT_TIMEOUT_MS = 180_000;
const FALLBACK_LIVE_ENV = "KIRAKIRA_PRESENTATION_HYDRATED_VISUAL_QA_LIVE";
const FALLBACK_RESULT_PATH = "docs/upgrade/gates/presentation-hydrated-visual-qa.json";
const FALLBACK_SCREENSHOT_DIR = "docs/upgrade/gates/presentation-hydrated-visual-qa";
const DEFAULT_VIEWS = Object.freeze([
  {
    id: "runs",
    label: "Runs",
    navAriaLabel: "Show run operations workspace",
    selector: "workbench-view-runs",
    workspaceAriaLabel: "Run operations workspace",
  },
  {
    id: "agents",
    label: "Agents",
    navAriaLabel: "Show agent swarm workspace",
    selector: "workbench-view-agents",
    workspaceAriaLabel: "Agent swarm workspace",
  },
  {
    id: "research",
    label: "Research",
    navAriaLabel: "Show research evidence workspace",
    selector: "workbench-view-research",
    workspaceAriaLabel: "Research evidence workspace",
  },
  {
    id: "systems",
    label: "Systems",
    navAriaLabel: "Show runtime systems workspace",
    selector: "workbench-view-systems",
    workspaceAriaLabel: "Memory, MCP, and artifact systems",
  },
]);
const DEFAULT_VIEWPORTS = Object.freeze([
  { id: "mobile", width: 375, height: 812 },
  { id: "tablet", width: 768, height: 1024 },
  { id: "desktop", width: 1440, height: 900 },
]);
const REFERENCES = Object.freeze([
  {
    title: "Electron BrowserWindow",
    url: "https://www.electronjs.org/docs/latest/api/browser-window",
  },
  {
    title: "Electron webContents",
    url: "https://www.electronjs.org/docs/latest/api/web-contents",
  },
  {
    title: "Electron offscreen rendering",
    url: "https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering",
  },
  {
    title: "Playwright screenshots",
    url: "https://playwright.dev/docs/screenshots",
  },
  {
    title: "Playwright events",
    url: "https://playwright.dev/docs/events",
  },
  {
    title: "Playwright locators",
    url: "https://playwright.dev/docs/locators",
  },
]);

export function normalizePresentationHydratedVisualQaArgs(argv = []) {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const options = {
    gateName: DEFAULT_GATE,
    profileName: undefined,
    timeoutMs: undefined,
    resultPath: undefined,
    screenshotDir: undefined,
    dryRun: false,
    live: false,
    skipInfra: false,
    skipDaemon: false,
    writeResult: true,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--gate") {
      options.gateName = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--profile") {
      options.profileName = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      options.timeoutMs = positiveInteger(readValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--result") {
      options.resultPath = resolve(readValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--write-result") {
      options.resultPath = resolve(readValue(args, index, arg));
      options.writeResult = true;
      index += 1;
      continue;
    }
    if (arg === "--screenshot-dir") {
      options.screenshotDir = resolve(readValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--no-write-result") {
      options.writeResult = false;
      continue;
    }
    if (arg === "--skip-infra") {
      options.skipInfra = true;
      continue;
    }
    if (arg === "--skip-daemon") {
      options.skipDaemon = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--live") {
      options.live = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      return { ...options, help: true };
    }
    throw new Error(`Unknown presentation hydrated visual QA argument: ${arg}`);
  }

  return options;
}

export function buildPresentationHydratedVisualQaCommand(
  options = {},
  env = process.env,
  deps = {},
) {
  const config = deps.config ?? loadRuntimeProfiles();
  const gate = presentationHydratedVisualQaGate(config, options.gateName ?? DEFAULT_GATE);
  const profileName = options.profileName ?? gate.profile;
  const live = liveRequested(options, env, gate);
  const resultPath = resolveConfiguredPath(options.resultPath, gate.resultPath ?? FALLBACK_RESULT_PATH);
  const screenshotDir = resolveConfiguredPath(
    options.screenshotDir,
    gate.screenshotDir ?? FALLBACK_SCREENSHOT_DIR,
  );
  const workbench = buildWorkbenchSmokeGateCommand({
    profileName,
    gateName: gate.workbenchSmokeGate,
    live,
    skipInfra: options.skipInfra,
    skipDaemon: options.skipDaemon,
    resultPath: null,
    timeoutMs: options.timeoutMs ?? gate.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  }, env);
  const surfaces = gate.surfaces.length > 0
    ? gate.surfaces
    : workbench.surfaces.map((surface) => surface.plan.surface);
  const surfaceCommands = surfaces.map((surface) =>
    buildWorkbenchSmokeCommand({
      profileName,
      surface,
      live,
      skipInfra: options.skipInfra,
      skipDaemon: options.skipDaemon,
      resultPath: null,
      timeoutMs: options.timeoutMs ?? gate.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    }, env),
  );
  const targets = Object.fromEntries(
    surfaceCommands.map((surface) => [
      surface.plan.surface,
      surface.targets[`presentation:${surface.plan.surface}`]?.target,
    ]),
  );
  const result = readResult(resultPath);
  const expected = visualQaIdentity({
    gate: gate.name,
    profile: profileName,
    checks: gate.checks,
    surfaces,
    viewports: gate.viewports,
    views: gate.views,
  });
  const resultMatches = visualQaResultMatches(result, expected);
  const externallyPassed = env[gate.passedEnv] === "1" || resultMatches;
  const skipReason = externallyPassed
    ? undefined
    : live
      ? undefined
      : `live gate is opt-in; set ${gate.liveEnv}=1 or pass --live`;
  const command = {
    schemaVersion: 1,
    gate: gate.name,
    gateSource: "runtime-profile.presentationHydratedVisualQaGates",
    description: gate.description,
    profile: profileName,
    live,
    status: externallyPassed ? "passed" : live ? "ready" : "skipped",
    ...(skipReason ? { skipReason } : {}),
    liveEnv: gate.liveEnv,
    timeoutMs: options.timeoutMs ?? gate.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    skipDaemon: options.skipDaemon === true,
    skipInfra: options.skipInfra === true,
    checks: gate.checks,
    surfaces,
    viewports: gate.viewports,
    views: gate.views,
    targets,
    screenshotDir: relativePath(screenshotDir),
    evidence: {
      resultPath: relativePath(resultPath),
      ...(isRecord(result)
        ? {
            resultStatus: typeof result.status === "string" ? result.status : "unknown",
            resultPassedAt: typeof result.passedAt === "string" ? result.passedAt : undefined,
            resultMatches,
          }
        : {
            resultStatus: "missing",
            resultMatches: false,
          }),
    },
    liveGate: {
      status: externallyPassed ? "passed" : live ? "pending" : "skipped",
      ...(skipReason ? { skipReason } : {}),
      command: `node scripts/presentation-hydrated-visual-qa.mjs --gate ${gate.name} --profile ${profileName} --live`,
      surfaces,
      viewports: gate.viewports,
      views: gate.views.map((view) => view.id),
      checks: gate.checks,
      targets,
    },
    references: REFERENCES,
  };
  Object.defineProperties(command, {
    profileObject: {
      value: workbench.profile,
      enumerable: false,
    },
    resultPath: {
      value: resultPath,
      enumerable: false,
    },
    screenshotDirAbsolute: {
      value: screenshotDir,
      enumerable: false,
    },
    surfaceCommands: {
      value: surfaceCommands,
      enumerable: false,
    },
  });
  return command;
}

export async function runPresentationHydratedVisualQa(command, options = {}) {
  const results = [];
  const runner = options.runner ?? runElectronQaRunner;
  process.env.KIRAKIRA_RUNTIME_PROFILE = command.profile;
  ensureEnvFile(repoRoot);
  ensureMcpConfig(repoRoot, command.profileObject);

  for (const surfaceCommand of command.surfaceCommands) {
    await runWorkbenchSmoke(surfaceCommand, {
      installSignalHandlers: options.installSignalHandlers,
      portPreflight: options.portPreflight,
      portProbe: options.portProbe,
      processes: options.processes,
      runChecked: options.runChecked,
      runForeground: options.runForeground,
      waitForReadiness: rendererOnlyWaitForReadiness(command, options.waitForReadiness),
      readiness: {
        timeoutMs: command.timeoutMs,
      },
      afterReady: async () => {
        const surface = surfaceCommand.plan.surface;
        const target = command.targets[surface];
        if (!target) {
          throw new Error(`Missing presentation target for hydrated QA surface ${surface}`);
        }
        const result = await runner({
          surface: { surface, target },
          viewports: command.viewports,
          views: command.views,
          screenshotDir: command.screenshotDirAbsolute,
          timeoutMs: command.timeoutMs,
        }, command);
        results.push(result);
      },
    });
  }

  const failures = results.flatMap((result) =>
    (result.failures ?? []).map((failure) => `${result.surface ?? "surface"}: ${failure}`),
  );
  if (failures.length > 0) {
    throw new Error(`Presentation hydrated visual QA failed: ${failures.join("; ")}`);
  }
  return results;
}

function rendererOnlyWaitForReadiness(command, injectedWaitForReadiness) {
  const waitForChecks = injectedWaitForReadiness ?? waitForReadinessChecks;
  return async (readiness, checks, options) => {
    const effectiveChecks = command.skipDaemon
      ? (checks ?? []).filter((check) => !String(check).startsWith("daemon:"))
      : checks;
    if (!effectiveChecks || effectiveChecks.length === 0) return undefined;
    return waitForChecks(readiness, effectiveChecks, options);
  };
}

export function writePresentationHydratedVisualQaResult(command, results, path = command.resultPath) {
  const result = {
    schemaVersion: 1,
    gate: command.gate,
    profile: command.profile,
    status: "passed",
    passedAt: new Date().toISOString(),
    checks: command.checks,
    surfaces: command.surfaces,
    viewports: command.viewports,
    views: command.views,
    targets: command.targets,
    screenshotDir: command.screenshotDir,
    surfaceResults: results.map(relativeSurfaceResult),
    command: command.liveGate.command,
    references: command.references,
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Wrote presentation hydrated visual QA evidence to ${relativePath(path)}.`);
  return result;
}

export function presentationHydratedVisualQaReport(command) {
  return {
    schemaVersion: command.schemaVersion,
    gate: command.gate,
    gateSource: command.gateSource,
    description: command.description,
    profile: command.profile,
    live: command.live,
    status: command.status,
    ...(command.skipReason ? { skipReason: command.skipReason } : {}),
    liveEnv: command.liveEnv,
    timeoutMs: command.timeoutMs,
    checks: command.checks,
    surfaces: command.surfaces,
    viewports: command.viewports,
    views: command.views,
    targets: command.targets,
    screenshotDir: command.screenshotDir,
    evidence: command.evidence,
    liveGate: command.liveGate,
    references: command.references,
  };
}

function presentationHydratedVisualQaGate(config, gateName) {
  const gates = isRecord(config.presentationHydratedVisualQaGates)
    ? config.presentationHydratedVisualQaGates
    : {};
  const gate = gates[gateName];
  if (!isRecord(gate)) {
    const available = Object.keys(gates).sort().join(", ");
    throw new Error(`Unknown presentation hydrated visual QA gate "${gateName}". Available: ${available}`);
  }
  const surfaces = stringArray(gate.surfaces);
  const viewports = normalizeViewports(gate.viewports);
  const views = normalizeViews(gate.views);
  const checks = stringArray(gate.checks);
  if (checks.length === 0) {
    throw new Error(`Presentation hydrated visual QA gate "${gateName}" must declare checks`);
  }
  return {
    name: gateName,
    profile: stringValue(gate.profile) ?? "workbench-host",
    description: stringValue(gate.description),
    liveEnv: stringValue(gate.liveEnv) ?? FALLBACK_LIVE_ENV,
    passedEnv: stringValue(gate.passedEnv) ?? `${FALLBACK_LIVE_ENV}_PASSED`,
    resultPath: stringValue(gate.resultPath),
    screenshotDir: stringValue(gate.screenshotDir),
    timeoutMs: positiveIntegerOrUndefined(gate.timeoutMs),
    workbenchSmokeGate: stringValue(gate.workbenchSmokeGate) ?? "presentation",
    checks,
    surfaces,
    viewports,
    views,
  };
}

function normalizeViewports(value) {
  const viewports = Array.isArray(value) ? value : DEFAULT_VIEWPORTS;
  const normalized = viewports.map((viewport) => ({
    id: requiredString(viewport?.id, "viewport.id"),
    width: positiveInteger(viewport?.width, "viewport.width"),
    height: positiveInteger(viewport?.height, "viewport.height"),
  }));
  if (normalized.length === 0) {
    throw new Error("Presentation hydrated visual QA requires at least one viewport");
  }
  return normalized;
}

function normalizeViews(value) {
  const views = Array.isArray(value) ? value : DEFAULT_VIEWS;
  const normalized = views.map((view) => ({
    id: requiredString(view?.id, "view.id"),
    label: requiredString(view?.label, "view.label"),
    navAriaLabel: requiredString(view?.navAriaLabel, "view.navAriaLabel"),
    selector: requiredString(view?.selector, "view.selector"),
    workspaceAriaLabel: requiredString(view?.workspaceAriaLabel, "view.workspaceAriaLabel"),
  }));
  if (normalized.length === 0) {
    throw new Error("Presentation hydrated visual QA requires at least one view");
  }
  return normalized;
}

async function runElectronQaRunner(payload, command) {
  const tempRoot = mkdtempSync(resolve(tmpdir(), "kirakira-hydrated-visual-qa-"));
  const payloadPath = resolve(tempRoot, `${payload.surface.surface}-payload.json`);
  const outputPath = resolve(tempRoot, `${payload.surface.surface}-result.json`);
  writeFileSync(payloadPath, `${JSON.stringify({ ...payload, outputPath }, null, 2)}\n`);
  const electronPath = resolveElectronPath();
  const child = spawnSync(electronPath, ["scripts/presentation-hydrated-visual-qa-runner.mjs", payloadPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: process.env.ELECTRON_ENABLE_LOGGING ?? "0",
    },
    stdio: "inherit",
    timeout: command.timeoutMs,
  });
  if (child.error) throw child.error;
  const result = readResult(outputPath);
  if (!isRecord(result)) {
    throw new Error(`Presentation hydrated visual QA runner did not write ${outputPath}`);
  }
  if ((child.status ?? 1) !== 0 || result.status !== "passed") {
    const failures = Array.isArray(result.failures) ? result.failures.join("; ") : "unknown";
    throw new Error(`Presentation hydrated visual QA runner failed for ${payload.surface.surface}: ${failures}`);
  }
  return result;
}

function resolveElectronPath() {
  const requireFromDesktop = createRequire(resolve(repoRoot, "apps", "desktop", "package.json"));
  const electronPath = requireFromDesktop("electron");
  if (typeof electronPath !== "string" || electronPath.length === 0) {
    throw new Error("Could not resolve Electron executable from @kirakira/desktop");
  }
  return electronPath;
}

function visualQaIdentity(command) {
  return {
    gate: command.gate,
    profile: command.profile,
    checks: command.checks,
    surfaces: command.surfaces,
    viewports: command.viewports.map((viewport) => viewport.id),
    views: command.views.map((view) => view.id),
  };
}

function visualQaResultMatches(result, expected) {
  if (!isRecord(result) || result.schemaVersion !== 1 || result.status !== "passed") return false;
  if (result.gate !== expected.gate || result.profile !== expected.profile) return false;
  if (!sameStringArray(result.checks, expected.checks)) return false;
  if (!sameStringArray(result.surfaces, expected.surfaces)) return false;
  const viewportIds = Array.isArray(result.viewports)
    ? result.viewports.map((viewport) => viewport.id)
    : [];
  const viewIds = Array.isArray(result.views)
    ? result.views.map((view) => view.id)
    : [];
  return sameStringArray(viewportIds, expected.viewports) && sameStringArray(viewIds, expected.views);
}

function relativeSurfaceResult(result) {
  return {
    ...result,
    viewports: (result.viewports ?? []).map((viewport) => ({
      ...viewport,
      screenshotPath: relativePath(viewport.screenshotPath),
    })),
  };
}

function liveRequested(options, env, gate) {
  return options.live === true || env[gate.liveEnv] === "1" || env.KIRAKIRA_LIVE_E2E === "1";
}

function resolveConfiguredPath(optionPath, configuredPath) {
  if (optionPath === null) return undefined;
  if (optionPath !== undefined) return resolve(optionPath);
  return resolve(repoRoot, configuredPath);
}

function readResult(path) {
  if (!path) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

function relativePath(path) {
  return typeof path === "string" ? relative(repoRoot, path).replaceAll("\\", "/") : path;
}

function readValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function requiredString(value, name) {
  const text = stringValue(value);
  if (!text) throw new Error(`${name} is required`);
  return text;
}

function stringValue(value) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? [...value]
    : [];
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function positiveIntegerOrUndefined(value) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sameStringArray(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

function printHelp() {
  return `Usage: node scripts/presentation-hydrated-visual-qa.mjs [options]

Options:
  --gate <name>            Visual QA gate from configs/runtime/profiles.json.
  --profile <name>         Runtime profile. Defaults to the selected gate profile.
  --dry-run                Print the profile-derived visual QA contract.
  --live                   Run workbench surfaces and Electron screenshot QA.
  --skip-infra             Reuse already-running Docker services.
  --skip-daemon            Reuse an already-running daemon.
  --timeout-ms <ms>        Per-surface timeout.
  --result <path>          Read/write evidence path.
  --write-result <path>    Write evidence to a custom path after a live pass.
  --screenshot-dir <path>  Directory for captured PNG evidence.
  --no-write-result        Do not write evidence after a live pass.
  --help                   Show this help.
`;
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const options = normalizePresentationHydratedVisualQaArgs(argv);
  if (options.help) {
    process.stdout.write(printHelp());
    return 0;
  }
  const command = buildPresentationHydratedVisualQaCommand(options, env);
  const report = presentationHydratedVisualQaReport(command);
  if (options.dryRun) {
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }
  if (!command.live) {
    if (command.status === "passed") {
      console.log("Presentation hydrated visual QA already has matching pass evidence.");
    } else {
      console.log(`Skipping presentation hydrated visual QA; ${command.skipReason}.`);
    }
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }
  const results = await runPresentationHydratedVisualQa(command, {
    installSignalHandlers: true,
  });
  if (options.writeResult !== false) {
    writePresentationHydratedVisualQaResult(command, results, command.resultPath);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}

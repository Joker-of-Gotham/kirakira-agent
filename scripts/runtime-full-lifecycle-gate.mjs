#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildRuntimeIntegrationGateCommand,
  runRuntimeIntegrationGate,
} from "./runtime-integration-gate.mjs";
import {
  buildRuntimeProfileProjection,
  loadRuntimeProfiles,
  resolveRuntimeProfile,
} from "./runtime-profile.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_GATE = "runtime-full-lifecycle";
const DEFAULT_TIMEOUT_MS = 240_000;
const FALLBACK_LIVE_ENV = "KIRAKIRA_RUNTIME_FULL_LIFECYCLE_LIVE";
const FALLBACK_RESULT_PATH = "docs/upgrade/gates/runtime-full-lifecycle-gate.json";
const DEFAULT_CHECKS = Object.freeze([
  "runtime-lifecycle:docker-compose-ready",
  "runtime-lifecycle:daemon-gateway",
  "runtime-lifecycle:web-renderer",
  "runtime-lifecycle:desktop-renderer",
  "runtime-lifecycle:electron-shell",
  "runtime-lifecycle:hydrated-visual-qa",
]);
const REFERENCES = Object.freeze([
  {
    title: "Docker Compose up",
    url: "https://docs.docker.com/reference/cli/docker/compose/up/",
  },
  {
    title: "Node.js child_process",
    url: "https://nodejs.org/api/child_process.html",
  },
  {
    title: "Electron BrowserWindow",
    url: "https://www.electronjs.org/docs/latest/api/browser-window",
  },
  {
    title: "MCP lifecycle",
    url: "https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle",
  },
]);

export function normalizeRuntimeFullLifecycleGateArgs(argv = []) {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const options = {
    gateName: DEFAULT_GATE,
    profileName: undefined,
    timeoutMs: undefined,
    resultPath: undefined,
    writeResult: true,
    dryRun: false,
    live: false,
    skipDockerPreflight: false,
    skipCompose: false,
    skipInfra: false,
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
    if (arg === "--no-write-result") {
      options.writeResult = false;
      continue;
    }
    if (arg === "--skip-docker-preflight") {
      options.skipDockerPreflight = true;
      continue;
    }
    if (arg === "--skip-compose") {
      options.skipCompose = true;
      continue;
    }
    if (arg === "--skip-infra") {
      options.skipInfra = true;
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
    throw new Error(`Unknown runtime full lifecycle gate argument: ${arg}`);
  }

  return options;
}

export function buildRuntimeFullLifecycleGateCommand(
  options = {},
  env = process.env,
  deps = {},
) {
  const config = deps.config ?? loadRuntimeProfiles();
  const gate = runtimeLifecycleGateConfig(config, options.gateName ?? DEFAULT_GATE);
  const profileName = options.profileName ?? gate.profile;
  const profile = resolveRuntimeProfile(profileName, config, {});
  const projection = buildRuntimeProfileProjection(profile, { config });
  const live = liveRequested(options, env, gate);
  const resultPath = resolveConfiguredPath(options.resultPath, gate.resultPath);
  const integration = buildRuntimeIntegrationGateCommand({
    gateName: gate.integrationGate,
    live,
    timeoutMs: options.timeoutMs ?? gate.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    skipCompose: options.skipCompose,
    skipInfra: options.skipInfra,
  }, env);
  const result = readResult(resultPath);
  const expected = lifecycleIdentity({
    gate: gate.name,
    profile: profileName,
    integrationGate: integration.gate,
    checks: gate.checks,
    lifecycleSteps: gate.lifecycleSteps,
    steps: integration.steps,
  });
  const resultMatches = lifecycleResultMatches(result, expected);
  const externallyPassed = env[gate.passedEnv] === "1" || resultMatches;
  const skipReason = externallyPassed
    ? undefined
    : live
      ? undefined
      : `live gate is opt-in; set ${gate.liveEnv}=1 or pass --live`;
  const composePlan = projection.fragments?.readiness?.compose;
  const command = {
    schemaVersion: 1,
    gate: gate.name,
    gateSource: "runtime-profile.runtimeLifecycleGates",
    description: gate.description,
    profile: profileName,
    live,
    status: externallyPassed ? "passed" : live ? "ready" : "skipped",
    ...(skipReason ? { skipReason } : {}),
    liveEnv: gate.liveEnv,
    timeoutMs: options.timeoutMs ?? gate.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    checks: gate.checks,
    lifecycleSteps: gate.lifecycleSteps,
    requiredPreflights: gate.requiredPreflights,
    integrationGate: integration.gate,
    integration,
    compose: composePlan
      ? {
          command: composePlan.command,
          args: composePlan.args,
          project: composePlan.project,
          files: composePlan.files,
          services: composePlan.services,
          wait: composePlan.wait,
        }
      : undefined,
    targets: collectStepTargets(integration.steps),
    evidence: {
      resultPath: relativePath(resultPath),
      ...(isRecord(result)
        ? {
            resultStatus: typeof result.status === "string" ? result.status : "unknown",
            resultRecordedAt: typeof result.recordedAt === "string" ? result.recordedAt : undefined,
            resultPassedAt: typeof result.passedAt === "string" ? result.passedAt : undefined,
            resultMatches,
            preflightStatus: result.preflight?.status,
          }
        : {
            resultStatus: "missing",
            resultMatches: false,
          }),
    },
    liveGate: {
      status: externallyPassed ? "passed" : live ? "pending" : "skipped",
      ...(skipReason ? { skipReason } : {}),
      command: `node scripts/runtime-full-lifecycle-gate.mjs --gate ${gate.name} --profile ${profileName} --live`,
      integrationCommand: integration.liveGate?.command,
      requiredPreflights: gate.requiredPreflights,
      lifecycleSteps: gate.lifecycleSteps,
      checks: gate.checks,
      targets: collectStepTargets(integration.steps),
    },
    references: gate.references,
  };
  Object.defineProperties(command, {
    resultPath: {
      value: resultPath,
      enumerable: false,
    },
    skipDockerPreflight: {
      value: options.skipDockerPreflight === true,
      enumerable: false,
    },
  });
  return command;
}

export async function runRuntimeFullLifecycleGate(command, options = {}) {
  const preflight = command.skipDockerPreflight
    ? skippedPreflight()
    : runDockerPreflight(command, options);
  if (preflight.status !== "passed" && preflight.status !== "skipped") {
    return {
      code: 1,
      preflight,
    };
  }
  const code = await runRuntimeIntegrationGate(command.integration, options);
  return {
    code,
    preflight,
  };
}

export function writeRuntimeFullLifecycleGateResult(
  command,
  run,
  path = command.resultPath,
) {
  if (!path) return undefined;
  const status = run.code === 0 ? "passed" : "blocked";
  const result = {
    schemaVersion: 1,
    gate: command.gate,
    profile: command.profile,
    integrationGate: command.integrationGate,
    status,
    recordedAt: new Date().toISOString(),
    ...(status === "passed" ? { passedAt: new Date().toISOString() } : {}),
    checks: command.checks,
    lifecycleSteps: command.lifecycleSteps,
    requiredPreflights: command.requiredPreflights,
    preflight: run.preflight,
    steps: command.integration.steps.map(stepResultIdentity),
    targets: command.targets,
    compose: command.compose,
    command: command.liveGate.command,
    references: command.references,
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Wrote runtime full lifecycle gate evidence to ${relativePath(path)}.`);
  return result;
}

export function runtimeFullLifecycleGateReport(command) {
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
    lifecycleSteps: command.lifecycleSteps,
    requiredPreflights: command.requiredPreflights,
    integrationGate: command.integrationGate,
    compose: command.compose,
    targets: command.targets,
    evidence: command.evidence,
    liveGate: command.liveGate,
    references: command.references,
  };
}

function runDockerPreflight(command, options = {}) {
  if (options.dockerPreflight) return options.dockerPreflight(command);
  const compose = runDockerPreflightCommand(["compose", "version"], command.timeoutMs);
  if (compose.status !== "passed") return compose;
  const daemon = runDockerPreflightCommand(["info"], command.timeoutMs);
  if (daemon.status !== "passed") return daemon;
  return {
    status: "passed",
    command: "docker compose version && docker info",
    detail: [compose.detail, daemon.detail].filter(Boolean).join("; "),
  };
}

function runDockerPreflightCommand(args, timeoutMs) {
  const result = spawnSync("docker", args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      COMPOSE_PROGRESS: process.env.COMPOSE_PROGRESS ?? "quiet",
    },
    encoding: "utf8",
    timeout: Math.min(timeoutMs, 30_000),
    shell: process.platform === "win32",
  });
  const label = `docker ${args.join(" ")}`;
  if (result.error) {
    return failedPreflight(label, result.error.message);
  }
  const code = result.status ?? 1;
  if (code !== 0) {
    return failedPreflight(label, String(result.stderr || result.stdout || `${label} exited ${code}`));
  }
  return {
    status: "passed",
    command: label,
    detail: String(result.stdout || "").trim(),
  };
}

function failedPreflight(command, detail) {
  return {
    status: "failed",
    command,
    detail: String(detail).trim(),
  };
}

function skippedPreflight() {
  return {
    status: "skipped",
    command: "docker compose version",
    detail: "preflight skipped by --skip-docker-preflight",
  };
}

function runtimeLifecycleGateConfig(config, gateName) {
  const gates = isRecord(config.runtimeLifecycleGates) ? config.runtimeLifecycleGates : {};
  const gate = gates[gateName];
  if (!isRecord(gate)) {
    const available = Object.keys(gates).sort().join(", ");
    throw new Error(`Unknown runtime lifecycle gate "${gateName}". Available: ${available}`);
  }
  const checks = stringArray(gate.checks);
  return {
    name: gateName,
    description: stringValue(gate.description),
    profile: stringValue(gate.profile) ?? "workbench-host",
    integrationGate: stringValue(gate.integrationGate) ?? "upgrade",
    liveEnv: stringValue(gate.liveEnv) ?? FALLBACK_LIVE_ENV,
    passedEnv: stringValue(gate.passedEnv) ?? `${FALLBACK_LIVE_ENV}_PASSED`,
    resultPath: stringValue(gate.resultPath) ?? FALLBACK_RESULT_PATH,
    timeoutMs: positiveIntegerOrUndefined(gate.timeoutMs),
    requiredPreflights: stringArray(gate.requiredPreflights),
    lifecycleSteps: stringArray(gate.lifecycleSteps),
    checks: checks.length > 0 ? checks : [...DEFAULT_CHECKS],
    references: normalizeReferences(gate.references),
  };
}

function normalizeReferences(value) {
  const references = Array.isArray(value)
    ? value.filter((item) => isRecord(item) && stringValue(item.title) && stringValue(item.url))
    : [];
  return references.length > 0 ? references : [...REFERENCES];
}

function collectStepTargets(steps) {
  const targets = {};
  for (const step of steps) {
    if (!isRecord(step.targets)) continue;
    for (const [name, value] of Object.entries(step.targets)) {
      targets[name] = isRecord(value) && typeof value.target === "string" ? value.target : value;
    }
  }
  return targets;
}

function lifecycleIdentity(command) {
  return {
    gate: command.gate,
    profile: command.profile,
    integrationGate: command.integrationGate,
    checks: command.checks,
    lifecycleSteps: command.lifecycleSteps,
    steps: command.steps.map(stepResultIdentity),
  };
}

function lifecycleResultMatches(result, expected) {
  if (!isRecord(result) || result.schemaVersion !== 1 || result.status !== "passed") return false;
  if (
    result.gate !== expected.gate ||
    result.profile !== expected.profile ||
    result.integrationGate !== expected.integrationGate
  ) {
    return false;
  }
  if (!sameStringArray(result.checks, expected.checks)) return false;
  if (!sameStringArray(result.lifecycleSteps, expected.lifecycleSteps)) return false;
  if (!Array.isArray(result.steps) || result.steps.length !== expected.steps.length) return false;
  return expected.steps.every((step, index) => {
    const actual = result.steps[index];
    return isRecord(actual) &&
      actual.id === step.id &&
      actual.kind === step.kind &&
      actual.profile === step.profile &&
      actual.gate === step.gate &&
      sameStringArray(actual.checks, step.checks);
  });
}

function stepResultIdentity(step) {
  return {
    id: step.id,
    kind: step.kind,
    profile: step.profile,
    gate: step.gate,
    checks: step.checks,
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
  if (!path || !existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { schemaVersion: 1, status: "invalid", path: relativePath(path) };
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
  return `Usage: node scripts/runtime-full-lifecycle-gate.mjs [options]

Options:
  --gate <name>              Runtime lifecycle gate from configs/runtime/profiles.json.
  --profile <name>           Runtime profile. Defaults to the selected gate profile.
  --dry-run                  Print the profile-derived lifecycle contract.
  --live                     Run the full lifecycle gate.
  --skip-docker-preflight    Skip Docker Compose availability preflight.
  --skip-compose             Forward --skip-compose to child gates that support it.
  --skip-infra               Forward --skip-infra to workbench/presentation child gates.
  --timeout-ms <ms>          Child gate timeout.
  --result <path>            Read/write evidence path.
  --write-result <path>      Write evidence to a custom path after live execution.
  --no-write-result          Do not write evidence after live execution.
  --help                     Show this help.
`;
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const options = normalizeRuntimeFullLifecycleGateArgs(argv);
  if (options.help) {
    process.stdout.write(printHelp());
    return 0;
  }
  const command = buildRuntimeFullLifecycleGateCommand(options, env);
  const report = runtimeFullLifecycleGateReport(command);
  if (options.dryRun) {
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }
  if (!command.live) {
    if (command.status === "passed") {
      console.log("Runtime full lifecycle gate already has matching pass evidence.");
    } else {
      console.log(`Skipping runtime full lifecycle gate; ${command.skipReason}.`);
    }
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }
  const run = await runRuntimeFullLifecycleGate(command);
  if (options.writeResult !== false) {
    writeRuntimeFullLifecycleGateResult(command, run, command.resultPath);
  }
  return run.code;
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

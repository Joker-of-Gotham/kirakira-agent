#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildDeepResearchLiveAdaptersCommand } from "./deep-research-live-adapters.mjs";
import { buildWorkbenchSmokeGateCommand } from "./kirakira-workbench-smoke.mjs";
import { buildMemoryPersistenceSmokeCommand } from "./memory-persistence-smoke.mjs";
import { buildPresentationHydratedVisualQaCommand } from "./presentation-hydrated-visual-qa.mjs";
import { buildRuntimeDaemonCompositionSmokeCommand } from "./runtime-daemon-composition-smoke.mjs";
import {
  runtimeGateEntryEnv,
  runtimeGateIdentity,
  runtimeGateResultMatches,
  runtimeGateStepExecutionStatus,
  runtimeGateStepIdentity,
} from "./runtime-gate-contracts.mjs";
import { loadRuntimeProfiles } from "./runtime-profile.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_GATE = "upgrade";
const DEFAULT_TIMEOUT_MS = 180_000;
const FALLBACK_LIVE_ENV = "KIRAKIRA_RUNTIME_INTEGRATION_GATE_LIVE";

const GATE_BUILDERS = Object.freeze({
  "deep-research-live-adapters": buildDeepResearchStep,
  "memory-persistence": buildMemoryPersistenceStep,
  "presentation-hydrated-visual-qa": buildPresentationHydratedVisualQaStep,
  "runtime-daemon-composition": buildRuntimeDaemonCompositionStep,
  "workbench-smoke": buildWorkbenchSmokeStep,
});

export function normalizeRuntimeIntegrationGateArgs(argv = []) {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const options = {
    gateName: DEFAULT_GATE,
    dryRun: false,
    live: false,
    skipCompose: false,
    skipInfra: false,
    timeoutMs: undefined,
    resultPath: undefined,
    writeResult: true,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--gate") {
      options.gateName = readValue(args, index, "--gate");
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      options.timeoutMs = positiveInteger(readValue(args, index, "--timeout-ms"), "--timeout-ms");
      index += 1;
      continue;
    }
    if (arg === "--result") {
      options.resultPath = resolve(readValue(args, index, "--result"));
      index += 1;
      continue;
    }
    if (arg === "--write-result") {
      options.resultPath = resolve(readValue(args, index, "--write-result"));
      options.writeResult = true;
      index += 1;
      continue;
    }
    if (arg === "--no-write-result") {
      options.writeResult = false;
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
    throw new Error(`Unknown runtime integration gate argument: ${arg}`);
  }

  return options;
}

export function buildRuntimeIntegrationGateCommand(
  options = {},
  env = process.env,
  deps = {},
) {
  const config = deps.config ?? loadRuntimeProfiles();
  const adapters = deps.adapters ?? GATE_BUILDERS;
  const gate = integrationGateConfig(config, options.gateName ?? DEFAULT_GATE);
  const live = liveRequested(options, env, gate);
  const configuredResultPath = options.resultPath !== undefined
    ? options.resultPath
    : gate.resultPath;
  const resultPath = options.resultPath === null || configuredResultPath === undefined
    ? undefined
    : resolve(repoRoot, configuredResultPath);
  const steps = gate.gates.map((entry) => buildStep(entry, {
    live,
    timeoutMs: options.timeoutMs ?? gate.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    skipCompose: options.skipCompose,
    skipInfra: options.skipInfra,
    config,
  }, env, adapters));
  const result = readGateResult(resultPath);
  const expectedIdentity = runtimeGateIdentity({ gate: gate.name, steps });
  const resultMatches = runtimeGateResultMatches(result, expectedIdentity);
  const externallyPassed =
    env[gate.passedEnv] === "1" ||
    resultMatches ||
    steps.every((step) => step.status === "passed");
  const mismatches = steps.filter((step) => step.status === "mismatch");
  const skipReason = externallyPassed
      ? undefined
      : live
        ? undefined
      : `live gate is opt-in; set ${gate.liveEnv}=1 or pass --live`;

  return {
    schemaVersion: 1,
    gate: gate.name,
    gateSource: "runtime-profile.integrationGates",
    description: gate.description,
    live,
    status: mismatches.length > 0
      ? "failed"
      : externallyPassed
        ? "passed"
        : live
          ? "ready"
          : "skipped",
    ...(skipReason ? { skipReason } : {}),
    liveEnv: gate.liveEnv,
    timeoutMs: options.timeoutMs ?? gate.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    evidence: {
      ...(resultPath ? { resultPath: relativeEvidencePath(resultPath) } : {}),
      ...(isRecord(result)
        ? {
            resultStatus: typeof result.status === "string" ? result.status : "unknown",
            resultPassedAt: typeof result.passedAt === "string" ? result.passedAt : undefined,
            resultMatches,
          }
        : resultPath
          ? { resultStatus: "missing", resultMatches: false }
          : {}),
      childGatesPassed: steps.every((step) => step.status === "passed"),
    },
    checks: uniqueStrings(steps.flatMap((step) => step.checks)),
    steps,
    liveGate: {
      status: mismatches.length > 0
        ? "failed"
        : externallyPassed
          ? "passed"
          : live
            ? "pending"
            : "skipped",
      ...(skipReason ? { skipReason } : {}),
      command: `node scripts/runtime-integration-gate.mjs --gate ${gate.name} --live`,
      steps: steps.map((step) => ({
        id: step.id,
        kind: step.kind,
        profile: step.profile,
        command: step.command,
        status: step.status,
      })),
    },
    references: [
      {
        title: "Docker Compose up",
        url: "https://docs.docker.com/reference/cli/docker/compose/up/",
      },
      {
        title: "Docker Compose pre-defined environment variables",
        url: "https://docs.docker.com/compose/how-tos/environment-variables/envvars/",
      },
      {
        title: "Electron security",
        url: "https://www.electronjs.org/docs/latest/tutorial/security",
      },
      {
        title: "Electron context isolation",
        url: "https://www.electronjs.org/docs/latest/tutorial/context-isolation",
      },
    ],
  };
}

export function writeRuntimeIntegrationGateResult(command, path) {
  if (!path) return undefined;
  const result = {
    schemaVersion: 1,
    gate: command.gate,
    status: "passed",
    passedAt: new Date().toISOString(),
    checks: command.checks,
    steps: command.steps.map(runtimeGateStepIdentity),
    command: command.liveGate.command,
    references: command.references,
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Wrote runtime integration gate evidence to ${relativeEvidencePath(path)}.`);
  return result;
}

export function runtimeIntegrationGateReport(command) {
  return {
    schemaVersion: command.schemaVersion,
    gate: command.gate,
    gateSource: command.gateSource,
    description: command.description,
    live: command.live,
    status: command.status,
    ...(command.skipReason ? { skipReason: command.skipReason } : {}),
    liveEnv: command.liveEnv,
    timeoutMs: command.timeoutMs,
    checks: command.checks,
    evidence: command.evidence,
    liveGate: command.liveGate,
    steps: command.steps,
    references: command.references,
  };
}

export async function runRuntimeIntegrationGate(command, options = {}) {
  for (const step of command.steps) {
    const code = runChecked(step.commandArgs, {
      env: {
        ...process.env,
        ...step.env,
      },
      timeoutMs: command.timeoutMs,
      runner: options.runner,
    });
    const cleanupCode = runStepCleanups(step, {
      env: {
        ...process.env,
        ...step.env,
      },
      timeoutMs: command.timeoutMs,
      runner: options.runner,
    });
    if (code !== 0) return code;
    if (cleanupCode !== 0) return cleanupCode;
  }
  return 0;
}

function buildStep(entry, options, env, adapters) {
  if (!isRecord(entry)) {
    throw new Error("Integration gate entries must be objects");
  }
  const kind = stringValue(entry.kind);
  const builder = kind ? adapters[kind] : undefined;
  if (!builder) {
    throw new Error(`Unknown runtime integration gate kind: ${kind ?? "missing"}`);
  }
  const command = builder(entry, options, env);
  const step = stepSummary(entry, command, kind);
  const cleanupCommands = normalizeStepCleanup(entry.cleanup, command.command);
  if (cleanupCommands.length > 0) {
    step.cleanup = cleanupCommands.map(({ display, required }) => ({ display, required }));
  }
  Object.defineProperties(step, {
    commandArgs: {
      value: command.commandArgs,
      enumerable: false,
    },
    env: {
      value: command.env,
      enumerable: false,
    },
    cleanupCommands: {
      value: cleanupCommands.map(({ command: cleanupCommand, args, required }) => ({
        commandArgs: [cleanupCommand, args],
        required,
      })),
      enumerable: false,
    },
  });
  return step;
}

function buildDeepResearchStep(entry, options, env) {
  const profile = requiredString(entry.profile, "deep-research-live-adapters.profile");
  const gateName = stringValue(entry.gate) ?? "deep-research:live-adapters";
  const childEnv = runtimeGateEntryEnv(entry);
  const command = buildDeepResearchLiveAdaptersCommand({
    gateName,
    profileName: profile,
    live: options.live,
    timeoutMs: options.timeoutMs,
    config: options.config,
  }, { ...env, ...childEnv });
  return {
    command,
    commandArgs: [
      process.execPath,
      [
        "scripts/deep-research-live-adapters.mjs",
        "--gate",
        gateName,
        "--profile",
        profile,
        "--timeout-ms",
        String(options.timeoutMs),
        "--live",
      ],
    ],
    env: {
      ...childEnv,
      KIRAKIRA_RUNTIME_PROFILE: profile,
    },
  };
}

function buildMemoryPersistenceStep(entry, options, env) {
  const profile = requiredString(entry.profile, "memory-persistence.profile");
  const skipCompose = entry.skipCompose === true || options.skipCompose === true;
  const childEnv = runtimeGateEntryEnv(entry);
  const command = buildMemoryPersistenceSmokeCommand({
    profileName: profile,
    live: options.live,
    timeoutMs: options.timeoutMs,
    skipCompose,
  }, { ...env, ...childEnv });
  return {
    command,
    commandArgs: [
      process.execPath,
      [
        "scripts/memory-persistence-smoke.mjs",
        "--profile",
        profile,
        "--timeout-ms",
        String(options.timeoutMs),
        ...(skipCompose ? ["--skip-compose"] : []),
        "--live",
      ],
    ],
    env: {
      ...childEnv,
      KIRAKIRA_RUNTIME_PROFILE: profile,
    },
  };
}

function buildRuntimeDaemonCompositionStep(entry, options, env) {
  const profile = requiredString(entry.profile, "runtime-daemon-composition.profile");
  const gateName = stringValue(entry.gate) ?? "runtime-daemon:composition-smoke";
  const childEnv = runtimeGateEntryEnv(entry);
  const command = buildRuntimeDaemonCompositionSmokeCommand({
    gateName,
    profileName: profile,
    live: options.live,
    timeoutMs: options.timeoutMs,
  }, { ...env, ...childEnv });
  return {
    command,
    commandArgs: [
      process.execPath,
      [
        "scripts/runtime-daemon-composition-smoke.mjs",
        "--gate",
        gateName,
        "--profile",
        profile,
        "--timeout-ms",
        String(options.timeoutMs),
        "--live",
      ],
    ],
    env: {
      ...childEnv,
      KIRAKIRA_RUNTIME_PROFILE: profile,
    },
  };
}

function buildPresentationHydratedVisualQaStep(entry, options, env) {
  const profile = requiredString(entry.profile, "presentation-hydrated-visual-qa.profile");
  const gateName = requiredString(entry.gate, "presentation-hydrated-visual-qa.gate");
  const skipInfra = entry.skipInfra === true || options.skipInfra === true;
  const skipDaemon = entry.skipDaemon === true;
  const childEnv = runtimeGateEntryEnv(entry);
  const command = buildPresentationHydratedVisualQaCommand({
    gateName,
    profileName: profile,
    live: options.live,
    timeoutMs: options.timeoutMs,
    skipInfra,
    skipDaemon,
  }, { ...env, ...childEnv });
  return {
    command,
    commandArgs: [
      process.execPath,
      [
        "scripts/presentation-hydrated-visual-qa.mjs",
        "--gate",
        gateName,
        "--profile",
        profile,
        "--timeout-ms",
        String(options.timeoutMs),
        ...(skipInfra ? ["--skip-infra"] : []),
        ...(skipDaemon ? ["--skip-daemon"] : []),
        "--live",
      ],
    ],
    env: {
      ...childEnv,
      KIRAKIRA_RUNTIME_PROFILE: profile,
    },
  };
}

function buildWorkbenchSmokeStep(entry, options, env) {
  const profile = requiredString(entry.profile, "workbench-smoke.profile");
  const gateName = requiredString(entry.gate, "workbench-smoke.gate");
  const skipInfra = entry.skipInfra === true || options.skipInfra === true;
  const childEnv = runtimeGateEntryEnv(entry);
  const command = buildWorkbenchSmokeGateCommand({
    profileName: profile,
    gateName,
    live: options.live,
    timeoutMs: options.timeoutMs,
    skipInfra,
  }, { ...env, ...childEnv });
  return {
    command,
    commandArgs: [
      process.execPath,
      [
        "scripts/kirakira-workbench-smoke.mjs",
        "--profile",
        profile,
        "--gate",
        gateName,
        "--timeout-ms",
        String(options.timeoutMs),
        ...(skipInfra ? ["--skip-infra"] : []),
        "--live",
      ],
    ],
    env: {
      ...childEnv,
      KIRAKIRA_RUNTIME_PROFILE: profile,
    },
  };
}

function stepSummary(entry, built, kind) {
  const command = built.command;
  const evidence = command.evidence ?? {};
  const status = runtimeGateStepExecutionStatus(command);
  return {
    id: stringValue(entry.id) ?? command.gate,
    kind,
    profile: commandProfileName(command),
    gate: commandGateName(command),
    status,
    live: command.live,
    checks: stringArray(command.checks),
    evidence,
    command: built.commandArgs ? displayCommand(built.commandArgs) : command.liveGate?.command,
    targets: command.targets,
    requires: command.liveGate?.requires,
    tests: command.liveGate?.tests ?? command.unitContract?.tests,
  };
}

function commandProfileName(command) {
  if (typeof command.profile === "string") return command.profile;
  if (isRecord(command.profile) && typeof command.profile.name === "string") {
    return command.profile.name;
  }
  if (isRecord(command.plan) && typeof command.plan.profile === "string") {
    return command.plan.profile;
  }
  return "unknown";
}

function commandGateName(command) {
  if (typeof command.gate === "string") return command.gate;
  if (isRecord(command.gate) && typeof command.gate.name === "string") {
    return command.gate.name;
  }
  return "unknown";
}

function integrationGateConfig(config, gateName) {
  const gates = isRecord(config.integrationGates) ? config.integrationGates : {};
  const gate = gates[gateName];
  if (!isRecord(gate)) {
    const available = Object.keys(gates).sort().join(", ");
    throw new Error(`Unknown runtime integration gate "${gateName}". Available: ${available}`);
  }
  const entries = Array.isArray(gate.gates) ? gate.gates : [];
  if (entries.length === 0) {
    throw new Error(`Runtime integration gate "${gateName}" must declare gates`);
  }
  return {
    name: gateName,
    description: stringValue(gate.description),
    liveEnv: stringValue(gate.liveEnv) ?? FALLBACK_LIVE_ENV,
    passedEnv: stringValue(gate.passedEnv) ?? `${FALLBACK_LIVE_ENV}_PASSED`,
    resultPath: stringValue(gate.resultPath),
    timeoutMs: positiveIntegerOrUndefined(gate.timeoutMs),
    gates: entries,
  };
}

function liveRequested(options, env, gate) {
  return (
    options.live === true ||
    env[gate.liveEnv] === "1" ||
    env.KIRAKIRA_LIVE_E2E === "1"
  );
}

function runChecked(commandArgs, options) {
  const [command, args] = commandArgs;
  if (options.runner) {
    return options.runner(command, args, options);
  }
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: options.env,
    stdio: "inherit",
    timeout: options.timeoutMs,
  });
  if (result.error) {
    console.error(`Failed to run ${displayCommand(commandArgs)}: ${result.error.message}`);
    return 1;
  }
  if (result.signal) {
    console.error(`Command ${displayCommand(commandArgs)} exited from signal ${result.signal}.`);
    return 1;
  }
  return result.status ?? 1;
}

function runStepCleanups(step, options) {
  let failureCode = 0;
  for (const cleanup of step.cleanupCommands ?? []) {
    const code = runChecked(cleanup.commandArgs, options);
    if (code !== 0 && cleanup.required !== false && failureCode === 0) {
      failureCode = code;
    }
  }
  return failureCode;
}

function normalizeStepCleanup(value, command) {
  const entries = Array.isArray(value) ? value : isRecord(value) ? [value] : [];
  return entries.map((entry) => normalizeCleanupEntry(entry, command)).filter(Boolean);
}

function normalizeCleanupEntry(entry, command) {
  if (!isRecord(entry)) return undefined;
  const kind = stringValue(entry.kind);
  if (kind !== "compose-down") {
    throw new Error(`Unknown runtime integration cleanup kind: ${kind ?? "missing"}`);
  }
  const compose = command.liveGate?.compose;
  if (!isRecord(compose)) {
    if (command.liveGate?.skipCompose === true) return undefined;
    throw new Error(`Cleanup kind "${kind}" requires a child gate compose plan.`);
  }
  const cleanupCommand = stringValue(compose.command) ?? "docker";
  const args = composeDownArgs(compose, entry);
  return {
    command: cleanupCommand,
    args,
    display: [cleanupCommand, ...args].join(" "),
    required: entry.required !== false,
  };
}

function composeDownArgs(compose, cleanup) {
  const args = stringArray(compose.args);
  const upIndex = args.indexOf("up");
  if (upIndex < 0) {
    throw new Error("compose-down cleanup requires compose args containing an up command.");
  }
  return [
    ...args.slice(0, upIndex),
    "down",
    ...(cleanup.removeVolumes === true ? ["-v"] : []),
    ...(cleanup.removeOrphans === false ? [] : ["--remove-orphans"]),
  ];
}

function displayCommand([command, args]) {
  const label = command === process.execPath ? "node" : command;
  return [label, ...args].join(" ");
}

function readGateResult(path) {
  if (!path || !existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { schemaVersion: 1, status: "invalid", path: relativeEvidencePath(path) };
  }
}

function relativeEvidencePath(path) {
  return relative(repoRoot, path).replaceAll("\\", "/");
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
  if (!text) throw new Error(`Runtime integration gate requires ${name}`);
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

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))];
}

function printHelp() {
  return `Usage: node scripts/runtime-integration-gate.mjs [options]

Options:
  --gate <name>            Integration gate from configs/runtime/profiles.json. Defaults to upgrade.
  --dry-run                Print the profile-gated integration contract only.
  --live                   Run child gates. Without this, existing child evidence is summarized only.
  --skip-compose           Pass through to memory persistence gate for already-running services.
  --skip-infra             Pass through to workbench gate for already-running infrastructure.
  --timeout-ms <ms>        Per-child-gate timeout.
  --result <path>          Read/write aggregate evidence. Defaults to the profile gate resultPath.
  --write-result <path>    Write aggregate evidence to a custom path after a live pass.
  --no-write-result        Do not write aggregate evidence after a live pass.
  --help                   Show this help.
`;
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const options = normalizeRuntimeIntegrationGateArgs(argv);
  if (options.help) {
    process.stdout.write(printHelp());
    return 0;
  }
  const command = buildRuntimeIntegrationGateCommand(options, env);
  const report = runtimeIntegrationGateReport(command);
  if (options.dryRun) {
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }
  if (!command.live) {
    if (command.status === "passed") {
      console.log("Runtime integration gate already has matching child pass evidence.");
    } else {
      console.log(`Skipping runtime integration gate; ${command.skipReason}.`);
    }
    console.log(JSON.stringify(report, null, 2));
    return command.status === "failed" ? 1 : 0;
  }
  const code = await runRuntimeIntegrationGate(command);
  if (code !== 0) return code;
  if (options.writeResult !== false) {
    const resultPath = options.resultPath === null
      ? undefined
      : resolve(repoRoot, options.resultPath ?? command.evidence.resultPath ?? "");
    writeRuntimeIntegrationGateResult(command, resultPath);
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

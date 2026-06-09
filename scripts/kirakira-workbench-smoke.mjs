#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ensureEnvFile, ensureMcpConfig } from "./kirakira-common.mjs";
import {
  buildWorkbenchSmokePlan,
  profileFromOptions,
  readinessPlanForCheckNames,
  runWorkbenchSmokePlan,
} from "./kirakira-workbench.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SMOKE_TIMEOUT_MS = 120_000;
const DEFAULT_SMOKE_INTERVAL_MS = 1_000;
const DEFAULT_SMOKE_PROBE_TIMEOUT_MS = 2_000;

function readValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function normalizeSmokeArgs(argv) {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const options = {
    profileName: undefined,
    surface: undefined,
    gateName: undefined,
    skipInfra: false,
    skipDaemon: false,
    dryRun: false,
    live: false,
    timeoutMs: undefined,
    intervalMs: undefined,
    probeTimeoutMs: undefined,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--profile") {
      options.profileName = readValue(args, index, "--profile");
      index += 1;
      continue;
    }
    if (arg === "--surface") {
      options.surface = readValue(args, index, "--surface");
      index += 1;
      continue;
    }
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
    if (arg === "--interval-ms") {
      options.intervalMs = positiveInteger(readValue(args, index, "--interval-ms"), "--interval-ms");
      index += 1;
      continue;
    }
    if (arg === "--probe-timeout-ms") {
      options.probeTimeoutMs = positiveInteger(
        readValue(args, index, "--probe-timeout-ms"),
        "--probe-timeout-ms",
      );
      index += 1;
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
    if (arg.startsWith("--")) {
      throw new Error(`Unknown workbench smoke argument: ${arg}`);
    }
    if (options.surface === undefined) {
      options.surface = arg;
      continue;
    }
    throw new Error(`Unknown workbench smoke argument: ${arg}`);
  }

  if (options.gateName !== undefined && options.surface !== undefined) {
    throw new Error("--gate cannot be combined with --surface or a positional surface");
  }

  return options;
}

function liveRequested(options, env, gate = undefined) {
  return (
    options.live ||
    env.KIRAKIRA_LIVE_E2E === "1" ||
    env.KIRAKIRA_WORKBENCH_SMOKE_LIVE === "1" ||
    (typeof gate?.liveEnv === "string" && env[gate.liveEnv] === "1")
  );
}

function readinessTargetSummary(check) {
  return Object.fromEntries(
    Object.entries({
      type: check.type,
      target: check.target,
      endpoint: check.endpoint,
      responseSchema: check.responseSchema,
    }).filter(([, value]) => value !== undefined),
  );
}

export function buildWorkbenchSmokeTargets(readinessPlan) {
  return Object.fromEntries(
    (readinessPlan.checks ?? []).map((check) => [
      check.name,
      readinessTargetSummary(check),
    ]),
  );
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))];
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function resolveWorkbenchSmokeGate(profile, gateName = undefined) {
  const gates = isRecord(profile.workbench?.smokeGates) ? profile.workbench.smokeGates : {};
  const selectedName = gateName ?? profile.workbench?.defaultSmokeGate;
  if (typeof selectedName !== "string" || selectedName.length === 0) {
    const available = Object.keys(gates).sort().join(", ");
    throw new Error(`Workbench profile "${profile.name}" has no default smoke gate. Available: ${available}`);
  }
  const gate = gates[selectedName];
  if (!isRecord(gate)) {
    const available = Object.keys(gates).sort().join(", ");
    throw new Error(`Unknown workbench smoke gate "${selectedName}". Available gates: ${available}`);
  }
  const surfaces = uniqueStrings(Array.isArray(gate.surfaces) ? gate.surfaces : []);
  if (surfaces.length === 0) {
    throw new Error(`Workbench smoke gate "${selectedName}" must declare at least one surface`);
  }
  return {
    name: selectedName,
    source: "runtime-profile.workbench.smokeGates",
    surfaces,
    ...(typeof gate.description === "string" ? { description: gate.description } : {}),
    ...(typeof gate.liveEnv === "string" ? { liveEnv: gate.liveEnv } : {}),
  };
}

export function buildWorkbenchSmokeCommand(options = {}, env = process.env) {
  const profile = profileFromOptions(options, env);
  const plan = buildWorkbenchSmokePlan(profile, options.surface, {
    skipInfra: options.skipInfra,
    skipDaemon: options.skipDaemon,
  });
  const readinessPlan = readinessPlanForCheckNames(plan.readiness, plan.smoke?.checks ?? []);
  return {
    live: liveRequested(options, env),
    profile,
    plan,
    readinessPlan,
    checks: readinessPlan.checks.map((check) => check.name),
    targets: buildWorkbenchSmokeTargets(readinessPlan),
    readiness: {
      timeoutMs: options.timeoutMs ?? DEFAULT_SMOKE_TIMEOUT_MS,
      intervalMs: options.intervalMs ?? DEFAULT_SMOKE_INTERVAL_MS,
      probeTimeoutMs: options.probeTimeoutMs ?? DEFAULT_SMOKE_PROBE_TIMEOUT_MS,
    },
  };
}

export function buildWorkbenchSmokeGateCommand(options = {}, env = process.env) {
  const profile = profileFromOptions(options, env);
  const gate = resolveWorkbenchSmokeGate(profile, options.gateName);
  const surfaces = gate.surfaces.map((surface) =>
    buildWorkbenchSmokeCommand(
      {
        ...options,
        profileName: profile.name,
        surface,
        gateName: undefined,
      },
      env,
    ),
  );
  return {
    live: liveRequested(options, env, gate),
    profile,
    gate,
    surfaces,
    checks: uniqueStrings(surfaces.flatMap((surface) => surface.checks)),
    targets: Object.assign({}, ...surfaces.map((surface) => surface.targets)),
    readiness: {
      timeoutMs: options.timeoutMs ?? DEFAULT_SMOKE_TIMEOUT_MS,
      intervalMs: options.intervalMs ?? DEFAULT_SMOKE_INTERVAL_MS,
      probeTimeoutMs: options.probeTimeoutMs ?? DEFAULT_SMOKE_PROBE_TIMEOUT_MS,
    },
  };
}

export async function runWorkbenchSmoke(smokeCommand, options = {}) {
  await runWorkbenchSmokePlan(smokeCommand.plan, {
    supervisor: options.supervisor,
    processes: options.processes,
    installSignalHandlers: options.installSignalHandlers,
    runChecked: options.runChecked,
    runForeground: options.runForeground,
    waitForReadiness: options.waitForReadiness,
    readiness: smokeCommand.readiness,
  });
}

export async function runWorkbenchSmokeGate(smokeGateCommand, options = {}) {
  for (const smokeCommand of smokeGateCommand.surfaces) {
    await runWorkbenchSmoke(smokeCommand, options);
  }
}

function surfaceSmokeReport(smokePlan) {
  return {
    surface: smokePlan.plan.surface,
    checks: smokePlan.checks,
    targets: smokePlan.targets,
    stepOverrides: smokePlan.plan.smoke?.stepOverrides ?? [],
    readinessPlan: smokePlan.readinessPlan,
    steps: smokePlan.plan.steps.map((step) => ({
      name: step.name,
      mode: step.mode,
      command: step.command,
      args: step.args,
      waitFor: step.waitFor,
    })),
  };
}

function smokeReport(smokePlan) {
  if (smokePlan.gate) {
    return {
      profile: smokePlan.profile.name,
      gate: smokePlan.gate.name,
      gateSource: smokePlan.gate.source,
      live: smokePlan.live,
      checks: smokePlan.checks,
      targets: smokePlan.targets,
      readiness: smokePlan.readiness,
      surfaces: smokePlan.surfaces.map(surfaceSmokeReport),
    };
  }

  return {
    profile: smokePlan.plan.profile,
    surface: smokePlan.plan.surface,
    live: smokePlan.live,
    checks: smokePlan.checks,
    targets: smokePlan.targets,
    stepOverrides: smokePlan.plan.smoke?.stepOverrides ?? [],
    readiness: smokePlan.readiness,
    readinessPlan: smokePlan.readinessPlan,
    steps: smokePlan.plan.steps.map((step) => ({
      name: step.name,
      mode: step.mode,
      command: step.command,
      args: step.args,
      waitFor: step.waitFor,
    })),
  };
}

async function main(argv) {
  const options = normalizeSmokeArgs(argv);
  const smokePlan = options.gateName
    ? buildWorkbenchSmokeGateCommand(options)
    : buildWorkbenchSmokeCommand(options);
  const report = smokeReport(smokePlan);

  if (options.dryRun) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (!smokePlan.live) {
    console.log("Skipping live workbench smoke; set KIRAKIRA_LIVE_E2E=1 or pass --live to start services.");
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  process.env.KIRAKIRA_RUNTIME_PROFILE = smokePlan.profile.name;
  ensureEnvFile(repoRoot);
  ensureMcpConfig(repoRoot, smokePlan.profile);
  if (smokePlan.gate) {
    await runWorkbenchSmokeGate(smokePlan, { installSignalHandlers: true });
  } else {
    await runWorkbenchSmoke(smokePlan, { installSignalHandlers: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

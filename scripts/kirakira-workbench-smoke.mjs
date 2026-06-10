#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
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
const DEFAULT_RESULT_PATH = resolve(
  repoRoot,
  "docs",
  "upgrade",
  "gates",
  "workbench-presentation-smoke.json",
);
const LOCAL_TARGET_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
const DEFAULT_PORT_BY_PROTOCOL = Object.freeze({
  "http:": 80,
  "https:": 443,
  "ws:": 80,
  "wss:": 443,
});

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
    resultPath: DEFAULT_RESULT_PATH,
    writeResult: true,
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

function relativeEvidencePath(path) {
  return path.replaceAll("\\", "/").replace(`${repoRoot.replaceAll("\\", "/")}/`, "");
}

function readSmokeResult(path) {
  if (!path || !existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { schemaVersion: 1, status: "invalid", path: relativeEvidencePath(path) };
  }
}

function sameStringArray(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

function surfaceNames(smokeCommand) {
  return smokeCommand.gate
    ? smokeCommand.surfaces.map((surface) => surface.plan.surface)
    : [smokeCommand.plan.surface];
}

function smokeEvidenceIdentity(smokeCommand) {
  return {
    gate: smokeCommand.gate ? smokeCommand.gate.name : `workbench:${smokeCommand.plan.surface}`,
    profile: smokeCommand.gate ? smokeCommand.profile.name : smokeCommand.plan.profile,
    checks: smokeCommand.checks,
    surfaces: surfaceNames(smokeCommand),
  };
}

function smokeResultMatches(result, expected) {
  return Boolean(
    isRecord(result) &&
      result.schemaVersion === 1 &&
      result.status === "passed" &&
      result.gate === expected.gate &&
      result.profile === expected.profile &&
      sameStringArray(result.checks, expected.checks) &&
      sameStringArray(result.surfaces, expected.surfaces),
  );
}

function liveEnvForSmoke(smokeCommand) {
  return smokeCommand.gate?.liveEnv ?? "KIRAKIRA_WORKBENCH_SMOKE_LIVE";
}

function applySmokeEvidence(smokeCommand, options) {
  const resultPath = options.resultPath === null ? undefined : (options.resultPath ?? DEFAULT_RESULT_PATH);
  const result = readSmokeResult(resultPath);
  const expectedResult = smokeEvidenceIdentity(smokeCommand);
  const resultPassed = smokeResultMatches(result, expectedResult);
  const skipReason = resultPassed
    ? undefined
    : smokeCommand.live
      ? undefined
      : `live gate is opt-in; set ${liveEnvForSmoke(smokeCommand)}=1 or pass --live`;

  return {
    ...smokeCommand,
    schemaVersion: 1,
    status: resultPassed ? "passed" : smokeCommand.live ? "ready" : "skipped",
    ...(skipReason ? { skipReason } : {}),
    evidence: {
      ...(resultPath ? { resultPath: relativeEvidencePath(resultPath) } : {}),
      ...(isRecord(result)
        ? {
            resultStatus: typeof result.status === "string" ? result.status : "unknown",
            resultPassedAt: typeof result.passedAt === "string" ? result.passedAt : undefined,
            resultMatches: resultPassed,
          }
        : {}),
    },
    liveGate: {
      status: resultPassed ? "passed" : smokeCommand.live ? "pending" : "skipped",
      ...(skipReason ? { skipReason } : {}),
      command: smokeCommand.gate
        ? `node scripts/kirakira-workbench-smoke.mjs --profile ${expectedResult.profile} --gate ${expectedResult.gate} --live`
        : `node scripts/kirakira-workbench-smoke.mjs --profile ${expectedResult.profile} --surface ${smokeCommand.plan.surface} --live`,
      checks: expectedResult.checks,
      surfaces: expectedResult.surfaces,
      targets: smokeCommand.targets,
      timeoutMs: smokeCommand.readiness.timeoutMs,
    },
  };
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

function ownsDaemonTargets(plan) {
  return plan.steps.some((step) => step.name === "daemon");
}

function ownsPresentationTargets(plan) {
  const surface = plan.surface;
  if (typeof surface !== "string" || surface.length === 0) return false;
  return plan.steps.some((step) =>
    step.name === surface || step.name === `${surface}-renderer` || step.name.startsWith(`${surface}-`),
  );
}

export function ownedWorkbenchSmokeTargetNames(smokeCommand) {
  const plan = smokeCommand.plan;
  if (!plan) return [];
  const owned = [];
  for (const checkName of smokeCommand.checks ?? []) {
    if (checkName.startsWith("daemon:") && ownsDaemonTargets(plan)) {
      owned.push(checkName);
      continue;
    }
    if (checkName === `presentation:${plan.surface}` && ownsPresentationTargets(plan)) {
      owned.push(checkName);
    }
  }
  return uniqueStrings(owned);
}

function localTcpTarget(checkName, target) {
  if (!isRecord(target) || typeof target.target !== "string") return undefined;
  let url;
  try {
    url = new URL(target.target);
  } catch {
    return undefined;
  }
  const defaultPort = DEFAULT_PORT_BY_PROTOCOL[url.protocol];
  const port = url.port ? Number(url.port) : defaultPort;
  if (!Number.isInteger(port) || port < 1) return undefined;
  if (!LOCAL_TARGET_HOSTS.has(url.hostname)) return undefined;
  return {
    checkName,
    target: target.target,
    host: url.hostname,
    port,
    key: `${url.hostname}:${port}`,
  };
}

export function ownedWorkbenchSmokeTcpTargets(smokeCommand) {
  const targets = [];
  const seen = new Set();
  for (const checkName of ownedWorkbenchSmokeTargetNames(smokeCommand)) {
    const target = localTcpTarget(checkName, smokeCommand.targets?.[checkName]);
    if (!target || seen.has(target.key)) continue;
    seen.add(target.key);
    targets.push(target);
  }
  return targets;
}

function probeTcpPortAvailable(target) {
  return new Promise((resolveProbe) => {
    const server = createServer();
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolveProbe({
        ...target,
        ...result,
      });
    };
    server.once("error", (error) => {
      finish({
        available: false,
        code: error?.code,
        detail: error instanceof Error ? error.message : String(error),
      });
    });
    server.once("listening", () => {
      server.close(() => {
        finish({ available: true });
      });
    });
    server.listen({ host: target.host, port: target.port, exclusive: true });
  });
}

export async function assertWorkbenchSmokeTargetsAvailable(smokeCommand, options = {}) {
  const probe = options.probe ?? probeTcpPortAvailable;
  const targets = ownedWorkbenchSmokeTcpTargets(smokeCommand);
  const results = await Promise.all(targets.map((target) => probe(target)));
  const occupied = results.filter((result) => result.available === false);
  if (occupied.length === 0) return results;
  const detail = occupied
    .map((result) =>
      `${result.checkName} ${result.target} on ${result.host}:${result.port}${result.code ? ` (${result.code})` : ""}`,
    )
    .join("; ");
  throw new Error(
    `Workbench smoke target ports are already in use: ${detail}. Stop the stale Kirakira process or choose a runtime profile/env port override before running the live gate.`,
  );
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
  return applySmokeEvidence({
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
  }, options);
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
  return applySmokeEvidence({
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
  }, options);
}

export async function runWorkbenchSmoke(smokeCommand, options = {}) {
  if (smokeCommand.live && options.portPreflight !== false) {
    await assertWorkbenchSmokeTargetsAvailable(smokeCommand, {
      probe: options.portProbe,
    });
  }
  await runWorkbenchSmokePlan(smokeCommand.plan, {
    supervisor: options.supervisor,
    processes: options.processes,
    installSignalHandlers: options.installSignalHandlers,
    runChecked: options.runChecked,
    runForeground: options.runForeground,
    waitForReadiness: options.waitForReadiness,
    afterReady: options.afterReady,
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
      schemaVersion: smokePlan.schemaVersion,
      profile: smokePlan.profile.name,
      gate: smokePlan.gate.name,
      gateSource: smokePlan.gate.source,
      live: smokePlan.live,
      status: smokePlan.status,
      ...(smokePlan.skipReason ? { skipReason: smokePlan.skipReason } : {}),
      checks: smokePlan.checks,
      targets: smokePlan.targets,
      evidence: smokePlan.evidence,
      liveGate: smokePlan.liveGate,
      readiness: smokePlan.readiness,
      surfaces: smokePlan.surfaces.map(surfaceSmokeReport),
    };
  }

  return {
    schemaVersion: smokePlan.schemaVersion,
    profile: smokePlan.plan.profile,
    surface: smokePlan.plan.surface,
    live: smokePlan.live,
    status: smokePlan.status,
    ...(smokePlan.skipReason ? { skipReason: smokePlan.skipReason } : {}),
    checks: smokePlan.checks,
    targets: smokePlan.targets,
    evidence: smokePlan.evidence,
    liveGate: smokePlan.liveGate,
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

export function writeWorkbenchSmokeResult(smokePlan, path = DEFAULT_RESULT_PATH) {
  if (!path) return undefined;
  const identity = smokeEvidenceIdentity(smokePlan);
  const result = {
    schemaVersion: 1,
    gate: identity.gate,
    profile: identity.profile,
    status: "passed",
    passedAt: new Date().toISOString(),
    checks: identity.checks,
    surfaces: identity.surfaces,
    targets: smokePlan.targets,
    command: smokePlan.gate
      ? `node scripts/kirakira-workbench-smoke.mjs --profile ${identity.profile} --gate ${identity.gate} --live`
      : `node scripts/kirakira-workbench-smoke.mjs --profile ${identity.profile} --surface ${identity.surfaces[0]} --live`,
    readiness: smokePlan.readiness,
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Wrote live workbench smoke evidence to ${relativeEvidencePath(path)}.`);
  return result;
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
    if (smokePlan.status === "passed") {
      console.log("Live workbench smoke already has matching pass evidence.");
    } else {
      console.log(`Skipping live workbench smoke; ${smokePlan.skipReason}.`);
    }
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
  if (options.writeResult !== false) {
    writeWorkbenchSmokeResult(smokePlan, options.resultPath ?? DEFAULT_RESULT_PATH);
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

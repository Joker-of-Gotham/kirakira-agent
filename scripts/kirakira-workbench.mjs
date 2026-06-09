#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ensureEnvFile, ensureMcpConfig } from "./kirakira-common.mjs";
import { evaluateRuntimeReadinessPlan } from "./runtime-doctor.mjs";
import {
  buildRuntimeReadinessPlan,
  loadRuntimeProfiles,
  renderComposeArgs,
  renderRuntimeEnv,
  runtimeProfileEnv,
  resolveRuntimeProfile,
} from "./runtime-profile.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_WORKBENCH_PROFILE = "workbench-host";
const DEFAULT_WAIT_TIMEOUT_MS = 30_000;
const DEFAULT_WAIT_INTERVAL_MS = 750;
const DEFAULT_PROBE_TIMEOUT_MS = 1_500;
const DEFAULT_STOP_GRACE_MS = 7_000;

function pnpmCommand() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function normalizeArgs(argv) {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const options = {
    surface: undefined,
    dryRun: false,
    smoke: false,
    skipInfra: false,
    skipDaemon: false,
    profileName: undefined,
    timeoutMs: undefined,
    intervalMs: undefined,
    probeTimeoutMs: undefined,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--smoke") {
      options.smoke = true;
      continue;
    }
    if (arg === "--live") {
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
    if (arg === "--profile") {
      if (!args[index + 1] || args[index + 1].startsWith("--")) {
        throw new Error("--profile requires a profile name");
      }
      options.profileName = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--surface") {
      if (!args[index + 1] || args[index + 1].startsWith("--")) {
        throw new Error("--surface requires a surface name");
      }
      if (options.surface !== undefined) {
        throw new Error("Workbench surface was provided more than once");
      }
      options.surface = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      options.timeoutMs = parsePositiveIntegerOption(args[index + 1], "--timeout-ms");
      index += 1;
      continue;
    }
    if (arg === "--interval-ms") {
      options.intervalMs = parsePositiveIntegerOption(args[index + 1], "--interval-ms");
      index += 1;
      continue;
    }
    if (arg === "--probe-timeout-ms") {
      options.probeTimeoutMs = parsePositiveIntegerOption(args[index + 1], "--probe-timeout-ms");
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown workbench argument: ${arg}`);
    }
    if (options.surface === undefined) {
      options.surface = arg;
      continue;
    }
    throw new Error(`Unknown workbench argument: ${arg}`);
  }
  return options;
}

function parsePositiveIntegerOption(value, name) {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error(`${name} requires a positive integer`);
  }
  return numberValue;
}

export function profileFromOptions(options, env = process.env) {
  const config = loadRuntimeProfiles();
  const profileName =
    options.profileName ?? env.KIRAKIRA_WORKBENCH_PROFILE ?? DEFAULT_WORKBENCH_PROFILE;
  return resolveRuntimeProfile(profileName, config, runtimeProfileEnv(env, {
    dropRootOverrides: true,
  }));
}

function pnpmStep(name, packageName, script, env, mode = "foreground") {
  return {
    name,
    mode,
    command: pnpmCommand(),
    args: ["--filter", packageName, script],
    env,
  };
}

function workbenchSurfaces(profile) {
  return profile.workbench?.surfaces ?? {};
}

function resolveSurface(profile, requestedSurface) {
  const surfaces = workbenchSurfaces(profile);
  const surface = requestedSurface ?? profile.workbench?.defaultSurface;
  if (!surface) {
    const available = Object.keys(surfaces).sort().join(", ");
    throw new Error(`Workbench profile "${profile.name}" has no default surface. Available: ${available}`);
  }
  if (!Array.isArray(surfaces[surface])) {
    const available = Object.keys(surfaces).sort().join(", ");
    throw new Error(`Unknown workbench surface "${surface}". Available surfaces: ${available}`);
  }
  return { name: surface, steps: surfaces[surface] };
}

function resolvePackageStep(profile, step, env, options) {
  const packageKey = step.package;
  const spec = profile.workbench?.packages?.[packageKey];
  if (!spec?.package || !spec?.script) {
    throw new Error(`Workbench package step "${packageKey}" is not defined in profile "${profile.name}"`);
  }
  const rendered = pnpmStep(step.name ?? packageKey, spec.package, spec.script, env, step.mode ?? "foreground");
  const waitFor = normalizeWaitFor(step.waitFor, step.name ?? packageKey, options);
  return waitFor.length > 0 ? { ...rendered, waitFor } : rendered;
}

function renderWorkbenchStep(profile, step, env, options) {
  if (step.skipWhen && options[step.skipWhen]) return undefined;
  if (step.package) return resolvePackageStep(profile, step, env, options);
  if (step.command) {
    const rendered = {
      name: step.name ?? step.command,
      mode: step.mode ?? "foreground",
      command: step.command,
      args: Array.isArray(step.args) ? step.args : [],
      env: { ...env, ...(step.env ?? {}) },
    };
    const waitFor = normalizeWaitFor(step.waitFor, step.name ?? step.command, options);
    return waitFor.length > 0 ? { ...rendered, waitFor } : rendered;
  }
  throw new Error(`Invalid workbench step in profile "${profile.name}"`);
}

function normalizeWaitFor(waitFor, stepName, options = {}) {
  if (waitFor === undefined) return [];
  if (!Array.isArray(waitFor)) {
    throw new Error(`Workbench step "${stepName}" waitFor must be an array`);
  }
  const checks = [];
  for (const item of waitFor) {
    if (typeof item === "string") {
      if (item.length > 0) checks.push(item);
      continue;
    }
    if (item && typeof item === "object" && !Array.isArray(item)) {
      if (item.skipWhen && options[item.skipWhen]) continue;
      if (typeof item.check !== "string" || item.check.length === 0) {
        throw new Error(`Workbench step "${stepName}" waitFor entry requires a check name`);
      }
      checks.push(item.check);
      continue;
    }
    throw new Error(`Workbench step "${stepName}" waitFor entries must be strings or check records`);
  }
  return [...new Set(checks)];
}

export function buildWorkbenchPlan(profile, surface, options = {}) {
  const env = renderRuntimeEnv(profile);
  const steps = [];
  const composeArgs = renderComposeArgs(profile);
  const infraServices = profile.workbench?.infraServices ?? [];
  const selectedSurface = resolveSurface(profile, surface);
  const readiness = buildRuntimeReadinessPlan(profile, {
    services: options.skipInfra ? [] : infraServices,
  });

  if (!options.skipInfra && composeArgs.length > 0 && infraServices.length > 0) {
    steps.push({
      name: "infra",
      mode: "run",
      command: "docker",
      args: ["compose", ...composeArgs, "up", "-d", "--wait", ...infraServices],
      env,
    });
  }

  for (const step of selectedSurface.steps) {
    const rendered = renderWorkbenchStep(profile, step, env, options);
    if (rendered) steps.push(rendered);
  }

  return {
    profile: profile.name,
    surface: selectedSurface.name,
    env,
    readiness,
    steps,
  };
}

function uniqueCheckNames(checks) {
  return [...new Set(checks.filter((check) => typeof check === "string" && check.length > 0))];
}

function readinessHasCheck(readiness, checkName) {
  return (readiness.checks ?? []).some((check) => check.name === checkName);
}

function derivedSmokeChecks(plan) {
  const checks = [];
  for (const step of plan.steps) {
    checks.push(...(step.waitFor ?? []));
  }
  const presentationCheck = `presentation:${plan.surface}`;
  if (readinessHasCheck(plan.readiness, presentationCheck)) {
    checks.push(presentationCheck);
  }
  if (plan.surface === "daemon") {
    for (const check of ["daemon:socket", "daemon:browser-gateway"]) {
      if (readinessHasCheck(plan.readiness, check)) checks.push(check);
    }
  }
  return uniqueCheckNames(checks);
}

function resolveSmokeChecks(profile, plan, options = {}) {
  const configured = profile.workbench?.smokeChecks?.[plan.surface];
  const checks = configured === undefined
    ? derivedSmokeChecks(plan)
    : normalizeWaitFor(configured, `smoke surface "${plan.surface}"`, options);
  if (checks.length === 0) {
    throw new Error(`Workbench smoke surface "${plan.surface}" has no readiness checks`);
  }
  readinessPlanForCheckNames(plan.readiness, checks);
  return uniqueCheckNames(checks);
}

export function buildWorkbenchSmokePlan(profile, surface, options = {}) {
  const plan = buildWorkbenchPlan(profile, surface, options);
  const checks = resolveSmokeChecks(profile, plan, options);
  return {
    ...plan,
    smoke: {
      checks,
    },
    steps: plan.steps.map((step) =>
      step.mode === "foreground" ? { ...step, mode: "background" } : step,
    ),
  };
}

function runChecked(step) {
  const result = spawnSync(step.command, step.args, {
    cwd: repoRoot,
    env: { ...process.env, ...step.env, COMPOSE_PROGRESS: process.env.COMPOSE_PROGRESS ?? "quiet" },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    throw new Error(`Workbench step "${step.name}" exited with code ${result.status ?? 1}`);
  }
}

function spawnStep(step) {
  return spawn(step.command, step.args, {
    cwd: repoRoot,
    env: { ...process.env, ...step.env },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

function killProcessTree(child) {
  if (!child || child.killed) return;
  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      shell: false,
    });
    return;
  }
  try {
    child.kill("SIGTERM");
  } catch {
    // Ignore teardown races.
  }
}

function requestGracefulStop(child) {
  if (!child || child.killed) return;
  try {
    child.kill("SIGTERM");
  } catch {
    // Ignore teardown races.
  }
}

function requestForceStop(child) {
  if (!child || child.killed) return;
  if (process.platform === "win32") {
    killProcessTree(child);
    return;
  }
  try {
    child.kill("SIGKILL");
  } catch {
    // Ignore teardown races.
  }
}

function waitForClose(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
}

export class WorkbenchProcessSupervisor {
  #children = [];
  #spawn;
  #forceStop;
  #gracefulStop;
  #sleep;
  #stopGraceMs;
  #failure;
  #resolveFailure;
  #failurePromise;

  constructor(options = {}) {
    this.#spawn = options.spawn ?? spawnStep;
    this.#gracefulStop = options.gracefulStop ?? requestGracefulStop;
    this.#forceStop = options.forceStop ?? requestForceStop;
    this.#sleep = options.sleep ?? delay;
    this.#stopGraceMs = options.stopGraceMs ?? DEFAULT_STOP_GRACE_MS;
    this.#failurePromise = new Promise((resolve) => {
      this.#resolveFailure = resolve;
    });
  }

  spawnBackground(step) {
    const child = this.#spawn(step);
    const record = {
      name: step.name,
      child,
      stopping: false,
      failure: undefined,
    };
    child.once("error", (error) => {
      this.#recordFailure(record, error instanceof Error ? error : new Error(String(error)));
    });
    child.once("close", (code, signal) => {
      if (!record.stopping) {
        this.#recordFailure(
          record,
          new Error(
            `Background step "${step.name}" exited early${signal ? ` via ${signal}` : ` with code ${code}`}`,
          ),
        );
      }
    });
    this.#children.push(record);
    return child;
  }

  #recordFailure(record, error) {
    record.failure = error;
    if (!this.#failure) {
      this.#failure = error;
      this.#resolveFailure(error);
    }
  }

  assertHealthy() {
    const failed = this.#children.find((record) => record.failure);
    if (failed?.failure) throw failed.failure;
  }

  waitForFailure() {
    return this.#failure ? Promise.resolve(this.#failure) : this.#failurePromise;
  }

  async stopAll() {
    const waits = [];
    for (const record of [...this.#children].reverse()) {
      record.stopping = true;
      waits.push(this.#stopRecord(record));
    }
    await Promise.allSettled(waits);
  }

  async #stopRecord(record) {
    const child = record.child;
    if (!child || child.killed || (child.exitCode !== null && child.exitCode !== undefined)) return;
    if (process.platform === "win32") {
      this.#forceStop(child);
      return;
    }
    const closed = waitForClose(child).then(() => true, () => true);
    this.#gracefulStop(child);
    const timedOut = this.#sleep(this.#stopGraceMs).then(() => false);
    if (!(await Promise.race([closed, timedOut]))) {
      this.#forceStop(child);
      await Promise.race([closed, this.#sleep(250)]);
    }
  }
}

export function readinessPlanForCheckNames(readiness, checkNames) {
  const wanted = new Set(checkNames ?? []);
  const checks = (readiness.checks ?? []).filter((check) => wanted.has(check.name));
  const found = new Set(checks.map((check) => check.name));
  const missing = [...wanted].filter((name) => !found.has(name));
  if (missing.length > 0) {
    throw new Error(`Readiness checks not found: ${missing.join(", ")}`);
  }
  return {
    ...readiness,
    checks,
  };
}

function reportReady(report) {
  return report.ok && (report.checks ?? []).every((check) =>
    check.status === "ok" || (check.required === false && check.status === "warn"),
  );
}

function resolveMilliseconds(optionValue, envValue, fallback, name, { allowZero = false } = {}) {
  const rawValue = optionValue ?? envValue;
  if (rawValue === undefined || rawValue === "") return fallback;
  const value = Number(rawValue);
  const minimum = allowZero ? 0 : 1;
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be ${allowZero ? "a non-negative" : "a positive"} integer`);
  }
  return value;
}

export async function waitForReadinessChecks(readiness, checkNames, options = {}) {
  const checks = [...new Set(checkNames ?? [])];
  if (checks.length === 0) return undefined;
  const selectedPlan = readinessPlanForCheckNames(readiness, checks);
  const env = options.env ?? process.env;
  const timeoutMs = resolveMilliseconds(
    options.timeoutMs,
    env.KIRAKIRA_WORKBENCH_WAIT_TIMEOUT_MS,
    DEFAULT_WAIT_TIMEOUT_MS,
    "KIRAKIRA_WORKBENCH_WAIT_TIMEOUT_MS",
    { allowZero: true },
  );
  const intervalMs = resolveMilliseconds(
    options.intervalMs,
    env.KIRAKIRA_WORKBENCH_WAIT_INTERVAL_MS,
    DEFAULT_WAIT_INTERVAL_MS,
    "KIRAKIRA_WORKBENCH_WAIT_INTERVAL_MS",
  );
  const probeTimeoutMs = resolveMilliseconds(
    options.probeTimeoutMs,
    env.KIRAKIRA_WORKBENCH_PROBE_TIMEOUT_MS,
    DEFAULT_PROBE_TIMEOUT_MS,
    "KIRAKIRA_WORKBENCH_PROBE_TIMEOUT_MS",
  );
  const evaluate = options.evaluate ?? evaluateRuntimeReadinessPlan;
  const sleep = options.sleep ?? delay;
  const now = options.now ?? Date.now;
  const started = now();
  let latestReport;
  for (;;) {
    latestReport = await evaluate(selectedPlan, {
      timeoutMs: probeTimeoutMs,
      fetcher: options.fetcher,
      transport: options.transport,
    });
    if (reportReady(latestReport)) return latestReport;
    const elapsedMs = now() - started;
    if (elapsedMs >= timeoutMs) break;
    await sleep(Math.min(intervalMs, timeoutMs - elapsedMs));
  }
  const detail = (latestReport?.checks ?? [])
    .filter((check) => check.status !== "ok")
    .map((check) => `${check.name}: ${check.status}${check.detail ? ` (${check.detail})` : ""}`)
    .join("; ");
  throw new Error(`Timed out waiting for readiness checks: ${checks.join(", ")}${detail ? `; ${detail}` : ""}`);
}

async function runForeground(step) {
  const child = spawnStep(step);
  const { code, signal } = await waitForClose(child);
  if (code !== 0 || signal) {
    throw new Error(`Workbench step "${step.name}" exited${signal ? ` via ${signal}` : ` with code ${code}`}`);
  }
}

async function raceBackgroundFailure(supervisor, task) {
  return Promise.race([
    task,
    supervisor.waitForFailure().then((error) => {
      throw error;
    }),
  ]);
}

export async function runWorkbenchPlan(plan, options = {}) {
  const supervisor = options.supervisor ?? new WorkbenchProcessSupervisor(options.processes);
  const waitForChecks = options.waitForReadiness ?? waitForReadinessChecks;
  const runForegroundStep = options.runForeground ?? runForeground;
  const runBlockingStep = options.runChecked ?? runChecked;
  const removeSignalHandlers = options.installSignalHandlers
    ? installSignalHandlers(supervisor)
    : () => {};
  try {
    for (const step of plan.steps) {
      supervisor.assertHealthy();
      if (step.waitFor?.length) {
        await raceBackgroundFailure(
          supervisor,
          waitForChecks(plan.readiness, step.waitFor, options.readiness),
        );
      }
      if (step.mode === "background") {
        supervisor.spawnBackground(step);
        continue;
      }
      if (step.mode === "foreground") {
        await raceBackgroundFailure(supervisor, runForegroundStep(step));
        continue;
      }
      runBlockingStep(step);
    }
  } finally {
    removeSignalHandlers();
    await supervisor.stopAll();
  }
}

export async function runWorkbenchSmokePlan(plan, options = {}) {
  const supervisor = options.supervisor ?? new WorkbenchProcessSupervisor(options.processes);
  const waitForChecks = options.waitForReadiness ?? waitForReadinessChecks;
  const runBlockingStep = options.runChecked ?? runChecked;
  const smokeChecks = plan.smoke?.checks ?? [];
  if (smokeChecks.length === 0) {
    throw new Error(`Workbench smoke plan "${plan.profile}/${plan.surface}" has no readiness checks`);
  }
  const removeSignalHandlers = options.installSignalHandlers
    ? installSignalHandlers(supervisor)
    : () => {};
  try {
    for (const step of plan.steps) {
      supervisor.assertHealthy();
      if (step.waitFor?.length) {
        await raceBackgroundFailure(
          supervisor,
          waitForChecks(plan.readiness, step.waitFor, options.readiness),
        );
      }
      if (step.mode === "run") {
        runBlockingStep(step);
        continue;
      }
      supervisor.spawnBackground(step);
    }
    await raceBackgroundFailure(
      supervisor,
      waitForChecks(plan.readiness, smokeChecks, options.readiness),
    );
  } finally {
    removeSignalHandlers();
    await supervisor.stopAll();
  }
}

function installSignalHandlers(supervisor) {
  const handlers = [
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ].map(([signal, exitCode]) => {
    const handler = () => {
      void supervisor.stopAll().finally(() => {
        process.exit(exitCode);
      });
    };
    process.once(signal, handler);
    return [signal, handler];
  });
  return () => {
    for (const [signal, handler] of handlers) {
      process.off(signal, handler);
    }
  };
}

async function main(argv) {
  const options = normalizeArgs(argv);
  const profile = profileFromOptions(options);
  const plan = options.smoke
    ? buildWorkbenchSmokePlan(profile, options.surface, options)
    : buildWorkbenchPlan(profile, options.surface, options);

  if (options.dryRun) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  process.env.KIRAKIRA_RUNTIME_PROFILE = profile.name;
  ensureEnvFile(repoRoot);
  ensureMcpConfig(repoRoot, profile);

  const readiness = {
    timeoutMs: options.timeoutMs,
    intervalMs: options.intervalMs,
    probeTimeoutMs: options.probeTimeoutMs,
  };
  const runner = options.smoke ? runWorkbenchSmokePlan : runWorkbenchPlan;
  await runner(plan, { installSignalHandlers: true, readiness });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

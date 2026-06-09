#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildMemoryStackPlan,
  buildRuntimeReadinessPlan,
  loadRuntimeProfiles,
  renderRuntimeEnv,
  resolveRuntimeProfile,
} from "./runtime-profile.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PROFILE = "test-host";
const LIVE_ENV = "KIRAKIRA_MEMORY_PERSISTENCE_SMOKE_LIVE";
const PASSED_ENV = "KIRAKIRA_MEMORY_PERSISTENCE_SMOKE_PASSED";
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_UNIT_TESTS = Object.freeze([
  "test/unit/runtime-daemon/memory-runtime-deps.test.ts",
  "test/unit/runtime/memory-test-host-env.test.ts",
]);
const DEFAULT_LIVE_TESTS = Object.freeze([
  "test/integration/memory/checkpoint-restore.test.ts",
  "test/integration/memory/retain-to-recall.test.ts",
]);
const DEFAULT_GATE_CHECKS = Object.freeze([
  "memory-store:checkpoint",
  "memory-store:retain-reflect",
]);

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

export function normalizeMemoryPersistenceSmokeArgs(argv = []) {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const options = {
    profileName: DEFAULT_PROFILE,
    dryRun: false,
    live: false,
    skipCompose: false,
    timeoutMs: undefined,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--profile") {
      options.profileName = readValue(args, index, "--profile");
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      options.timeoutMs = positiveInteger(readValue(args, index, "--timeout-ms"), "--timeout-ms");
      index += 1;
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
    if (arg === "--skip-compose") {
      options.skipCompose = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      return { ...options, help: true };
    }
    throw new Error(`Unknown memory persistence smoke argument: ${arg}`);
  }

  return options;
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringArray(value, fallback) {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? [...value]
    : [...fallback];
}

function profilePersistenceGate(profile) {
  const gate = isRecord(profile.memory?.persistenceGate) ? profile.memory.persistenceGate : {};
  return {
    name: typeof gate.name === "string" ? gate.name : "memory-store:persistence",
    liveEnv: typeof gate.liveEnv === "string" ? gate.liveEnv : LIVE_ENV,
    passedEnv: typeof gate.passedEnv === "string" ? gate.passedEnv : PASSED_ENV,
    unitTests: stringArray(gate.unitTests, DEFAULT_UNIT_TESTS),
    liveTests: stringArray(gate.liveTests, DEFAULT_LIVE_TESTS),
    checks: stringArray(gate.checks, DEFAULT_GATE_CHECKS),
  };
}

function liveRequested(options, env, gate) {
  return options.live || env[gate.liveEnv] === "1" || env.KIRAKIRA_LIVE_E2E === "1";
}

function commandFor(name) {
  return process.platform === "win32" && name === "pnpm" ? "pnpm.cmd" : name;
}

function readinessTargetSummary(check) {
  return Object.fromEntries(
    Object.entries({
      type: check.type,
      service: check.service,
      composeService: check.composeService,
      target: check.target,
      required: check.required,
    }).filter(([, value]) => value !== undefined),
  );
}

function commandPlan(command, args) {
  return {
    command,
    args,
    display: [command, ...args].join(" "),
  };
}

export function buildMemoryPersistenceSmokeCommand(options = {}, env = process.env) {
  const config = loadRuntimeProfiles();
  const profile = resolveRuntimeProfile(options.profileName ?? DEFAULT_PROFILE, config, env);
  const gate = profilePersistenceGate(profile);
  const readinessPlan = buildRuntimeReadinessPlan(profile, { config });
  const memoryStack = buildMemoryStackPlan(profile, { config });
  const live = liveRequested(options, env, gate);
  const externallyPassed = env[gate.passedEnv] === "1";
  const compose = options.skipCompose ? undefined : memoryStack.compose;
  const skipReason = externallyPassed
    ? undefined
    : live
      ? undefined
      : `live gate is opt-in; set ${gate.liveEnv}=1 or pass --live`;
  const unitArgs = ["vitest", "run", ...gate.unitTests];
  const liveArgs = ["vitest", "run", ...gate.liveTests];

  return {
    schemaVersion: 1,
    gate: gate.name,
    profile: profile.name,
    live,
    status: externallyPassed ? "passed" : live ? "ready" : "skipped",
    ...(skipReason ? { skipReason } : {}),
    checks: gate.checks,
    readinessPlan: {
      compose,
      checks: memoryStack.checks,
    },
    targets: Object.fromEntries(
      (memoryStack.checks ?? []).map((check) => [check.name, readinessTargetSummary(check)]),
    ),
    unitContract: {
      status: "planned",
      tests: gate.unitTests,
      command: commandPlan("pnpm", unitArgs),
    },
    liveGate: {
      status: externallyPassed ? "passed" : live ? "pending" : "skipped",
      ...(skipReason ? { skipReason } : {}),
      tests: gate.liveTests,
      command: commandPlan("pnpm", liveArgs),
      compose,
      skipCompose: options.skipCompose === true,
      env: {
        KIRAKIRA_RUNTIME_PROFILE: profile.name,
        KIRAKIRA_FORCE_INTEGRATION: "1",
      },
      requires: [
        ...(compose ? ["docker compose"] : []),
        ...((memoryStack.services ?? []).map((service) => service.name)),
      ],
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    },
    profileEnv: {
      KIRAKIRA_RUNTIME_PROFILE: profile.name,
    },
    readiness: readinessPlan,
  };
}

function dockerAvailable() {
  const result = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10_000,
  });
  return result.status === 0;
}

function runChecked(command, args, options) {
  const result = spawnSync(commandFor(command), args, {
    cwd: repoRoot,
    env: options.env,
    stdio: "inherit",
    timeout: options.timeoutMs,
  });
  return result.status ?? 1;
}

function printHelp() {
  return `Usage: node scripts/memory-persistence-smoke.mjs [options]

Options:
  --profile <name>         Runtime profile to inspect. Defaults to test-host.
  --dry-run                Print the profile-gated smoke contract only.
  --live                   Start/reuse the memory stack and run live persistence tests.
  --skip-compose           Do not start Docker Compose; use already-running local services.
  --timeout-ms <ms>        Per-command timeout for live test execution.
  --help                   Show this help.
`;
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const options = normalizeMemoryPersistenceSmokeArgs(argv);
  if (options.help) {
    process.stdout.write(printHelp());
    return 0;
  }
  const smoke = buildMemoryPersistenceSmokeCommand(options, env);
  if (options.dryRun) {
    console.log(JSON.stringify(smoke, null, 2));
    return 0;
  }
  if (!smoke.live) {
    console.log(`Skipping live memory persistence smoke; ${smoke.skipReason}.`);
    console.log(JSON.stringify(smoke, null, 2));
    return 0;
  }

  const runtimeEnv = {
    ...env,
    ...renderRuntimeEnv(resolveRuntimeProfile(smoke.profile, loadRuntimeProfiles(), env)),
    KIRAKIRA_RUNTIME_PROFILE: smoke.profile,
    KIRAKIRA_FORCE_INTEGRATION: "1",
  };

  if (smoke.liveGate.compose) {
    if (!dockerAvailable()) {
      console.log("Skipping live memory persistence smoke; Docker CLI or daemon is unavailable.");
      console.log(JSON.stringify({ ...smoke, status: "skipped", skipReason: "docker unavailable" }, null, 2));
      return 0;
    }
    const composeCode = runChecked(
      "docker",
      smoke.liveGate.compose.args,
      { env: runtimeEnv, timeoutMs: smoke.liveGate.timeoutMs },
    );
    if (composeCode !== 0) return composeCode;
  }

  const unitCode = runChecked(
    smoke.unitContract.command.command,
    smoke.unitContract.command.args,
    { env: runtimeEnv, timeoutMs: smoke.liveGate.timeoutMs },
  );
  if (unitCode !== 0) return unitCode;

  return runChecked(
    smoke.liveGate.command.command,
    smoke.liveGate.command.args,
    { env: runtimeEnv, timeoutMs: smoke.liveGate.timeoutMs },
  );
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

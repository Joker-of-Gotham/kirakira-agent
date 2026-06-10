#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  loadRuntimeProfiles,
  resolveRuntimeProfile,
} from "./runtime-profile.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_GATE = "runtime-daemon:composition-smoke";
const DEFAULT_PROFILE = "workbench-host";
const GATE_PROFILE_ENV = "KIRAKIRA_RUNTIME_DAEMON_COMPOSITION_PROFILE";
const GATE_NAME_ENV = "KIRAKIRA_RUNTIME_DAEMON_COMPOSITION_GATE";
const LIVE_ENV = "KIRAKIRA_RUNTIME_DAEMON_COMPOSITION_SMOKE_LIVE";
const PASSED_ENV = "KIRAKIRA_RUNTIME_DAEMON_COMPOSITION_SMOKE_PASSED";
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_RESULT_PATH = resolve(
  repoRoot,
  "docs",
  "upgrade",
  "gates",
  "runtime-daemon-composition-smoke.json",
);
const DEFAULT_TESTS = Object.freeze([
  "test/smoke/runtime-daemon/composition-smoke.test.ts",
]);
const DEFAULT_CHECKS = Object.freeze([
  "runtime-daemon:kernelbridge-single-run",
  "runtime-daemon:subagent-topology-events",
  "runtime-daemon:deep-research-mcp-source",
  "runtime-daemon:mcp-policy-trust-audit-otel",
  "runtime-daemon:memory-recall-events",
  "runtime-daemon:checkpoint-persistence",
  "runtime-daemon:profile-readiness-manifest",
]);

export function normalizeRuntimeDaemonCompositionSmokeArgs(argv = []) {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const options = {
    gateName: undefined,
    profileName: undefined,
    dryRun: false,
    live: false,
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
    throw new Error(`Unknown runtime daemon composition smoke argument: ${arg}`);
  }

  return options;
}

export function buildRuntimeDaemonCompositionSmokeCommand(
  options = {},
  env = process.env,
  deps = {},
) {
  const config = deps.config ?? loadRuntimeProfiles();
  const gateName = options.gateName ?? env[GATE_NAME_ENV] ?? DEFAULT_GATE;
  const gate = daemonCompositionGateConfig(config, gateName);
  const profileName = options.profileName ?? env[GATE_PROFILE_ENV] ?? gate.profile ?? DEFAULT_PROFILE;
  const profile = resolveRuntimeProfile(profileName, config, env);
  const tests = gate.tests.length > 0 ? gate.tests : [...DEFAULT_TESTS];
  const checks = gate.checks.length > 0 ? gate.checks : [...DEFAULT_CHECKS];
  const timeoutMs = options.timeoutMs ?? gate.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const resultPath = options.resultPath === null
    ? undefined
    : options.resultPath ?? resolve(repoRoot, gate.resultPath ?? relativeEvidencePath(DEFAULT_RESULT_PATH));
  const result = readSmokeResult(resultPath);
  const expectedResult = {
    gate: gate.name,
    profile: profile.name,
    checks,
    tests,
  };
  const resultPassed = smokeResultMatches(result, expectedResult);
  const externallyPassed = env[gate.passedEnv] === "1" || resultPassed;
  const live = options.live === true || env[gate.liveEnv] === "1" || env.KIRAKIRA_LIVE_E2E === "1";
  const skipReason = externallyPassed
    ? undefined
    : live
      ? undefined
      : `live gate is opt-in; set ${gate.liveEnv}=1 or pass --live`;
  const testArgs = ["vitest", "run", ...tests];

  return {
    schemaVersion: 1,
    gate: gate.name,
    profile: profile.name,
    gateSource: "runtime-profile.daemonCompositionGates",
    description: gate.description,
    live,
    status: externallyPassed ? "passed" : live ? "ready" : "skipped",
    ...(skipReason ? { skipReason } : {}),
    checks,
    evidence: {
      ...(resultPath ? { resultPath: relativeEvidencePath(resultPath) } : {}),
      ...(isRecord(result)
        ? {
            resultStatus: typeof result.status === "string" ? result.status : "unknown",
            resultPassedAt: typeof result.passedAt === "string" ? result.passedAt : undefined,
            resultMatches: resultPassed,
          }
        : resultPath
          ? { resultStatus: "missing", resultMatches: false }
          : {}),
    },
    profileContract: {
      profile: profile.name,
      mode: profile.mode,
      orchestration: {
        defaultRole: profile.orchestration?.topology?.defaultRole,
        handoffMode: profile.orchestration?.topology?.mode,
        roles: Array.isArray(profile.orchestration?.topology?.roles)
          ? profile.orchestration.topology.roles.map((role) => role.id).filter(Boolean)
          : [],
      },
      deepResearchMcpTargets: Object.keys(profile.deepResearch?.mcp?.targets ?? {}),
      mcpServerRefs: profile.mcp?.serverRefs ?? [],
    },
    unitContract: {
      status: "planned",
      tests,
      command: commandPlan("pnpm", testArgs),
    },
    liveGate: {
      status: externallyPassed ? "passed" : live ? "pending" : "skipped",
      ...(skipReason ? { skipReason } : {}),
      tests,
      command: commandPlan("pnpm", testArgs),
      env: {
        KIRAKIRA_RUNTIME_PROFILE: profile.name,
      },
      timeoutMs,
    },
    references: [
      {
        title: "MCP Tools 2025-11-25",
        url: "https://modelcontextprotocol.io/specification/2025-11-25/server/tools",
      },
      {
        title: "OpenTelemetry MCP semantic conventions",
        url: "https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/",
      },
      {
        title: "Docker Compose up",
        url: "https://docs.docker.com/reference/cli/docker/compose/up/",
      },
    ],
  };
}

export function writeRuntimeDaemonCompositionSmokeResult(command, path) {
  if (!path) return undefined;
  const result = {
    schemaVersion: 1,
    gate: command.gate,
    profile: command.profile,
    status: "passed",
    passedAt: new Date().toISOString(),
    checks: command.checks,
    tests: command.liveGate.tests,
    command: command.liveGate.command.display,
    references: command.references,
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Wrote runtime daemon composition smoke evidence to ${relativeEvidencePath(path)}.`);
  return result;
}

export function runtimeDaemonCompositionSmokeReport(command) {
  return {
    schemaVersion: command.schemaVersion,
    gate: command.gate,
    profile: command.profile,
    gateSource: command.gateSource,
    description: command.description,
    live: command.live,
    status: command.status,
    ...(command.skipReason ? { skipReason: command.skipReason } : {}),
    checks: command.checks,
    evidence: command.evidence,
    profileContract: command.profileContract,
    unitContract: command.unitContract,
    liveGate: command.liveGate,
    references: command.references,
  };
}

export function runRuntimeDaemonCompositionSmoke(command, options = {}) {
  const invocation = commandInvocation(
    command.liveGate.command.command,
    command.liveGate.command.args,
  );
  const result = spawnSyncWithRunner(invocation, {
    env: {
      ...process.env,
      ...command.liveGate.env,
    },
    timeoutMs: command.liveGate.timeoutMs,
    runner: options.runner,
  });
  return result;
}

function daemonCompositionGateConfig(config, gateName) {
  const gates = isRecord(config.daemonCompositionGates)
    ? config.daemonCompositionGates
    : {};
  const gate = gates[gateName];
  if (!isRecord(gate)) {
    const available = Object.keys(gates).sort().join(", ");
    throw new Error(`Unknown runtime daemon composition gate "${gateName}". Available: ${available}`);
  }
  return {
    name: gateName,
    description: stringValue(gate.description),
    profile: stringValue(gate.profile),
    liveEnv: stringValue(gate.liveEnv) ?? LIVE_ENV,
    passedEnv: stringValue(gate.passedEnv) ?? PASSED_ENV,
    resultPath: stringValue(gate.resultPath),
    timeoutMs: positiveIntegerOrUndefined(gate.timeoutMs),
    checks: stringArray(gate.checks),
    tests: stringArray(gate.tests),
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
      sameStringArray(result.tests, expected.tests),
  );
}

function commandPlan(command, args) {
  return {
    command,
    args,
    display: [command, ...args].join(" "),
  };
}

function commandFor(name) {
  return process.platform === "win32" && name === "pnpm" ? "pnpm.cmd" : name;
}

function quoteCmdArg(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_@./:\\-]+$/u.test(text)) return text;
  return `"${text.replaceAll('"', '\\"')}"`;
}

function commandInvocation(command, args) {
  const executable = commandFor(command);
  if (process.platform === "win32" && executable.endsWith(".cmd")) {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", [executable, ...args.map(quoteCmdArg)].join(" ")],
      display: [executable, ...args].join(" "),
    };
  }
  return { command: executable, args, display: [executable, ...args].join(" ") };
}

function spawnSyncWithRunner(invocation, options) {
  if (options.runner) {
    return options.runner(invocation.command, invocation.args, options);
  }
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: repoRoot,
    env: options.env,
    stdio: "inherit",
    timeout: options.timeoutMs,
  });
  if (result.error) {
    console.error(`Failed to run ${invocation.display}: ${result.error.message}`);
    return 1;
  }
  if (result.signal) {
    console.error(`Command ${invocation.display} exited from signal ${result.signal}.`);
    return 1;
  }
  return result.status ?? 1;
}

function readSmokeResult(path) {
  if (!path || !existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { schemaVersion: 1, status: "invalid", path: relativeEvidencePath(path) };
  }
}

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

function positiveIntegerOrUndefined(value) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function stringValue(value) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? [...value]
    : [];
}

function sameStringArray(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

function relativeEvidencePath(path) {
  return relative(repoRoot, path).replaceAll("\\", "/");
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function printHelp() {
  return `Usage: node scripts/runtime-daemon-composition-smoke.mjs [options]

Options:
  --gate <name>            Composition gate from configs/runtime/profiles.json.
  --profile <name>         Runtime profile. Defaults to the configured gate profile.
  --dry-run                Print the profile-gated smoke contract only.
  --live                   Run the smoke test. Without this, existing evidence is summarized only.
  --timeout-ms <ms>        Smoke test timeout.
  --result <path>          Read/write evidence. Defaults to the configured resultPath.
  --write-result <path>    Write evidence to a custom path after a live pass.
  --no-write-result        Do not write evidence after a live pass.
  --help                   Show this help.
`;
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const options = normalizeRuntimeDaemonCompositionSmokeArgs(argv);
  if (options.help) {
    process.stdout.write(printHelp());
    return 0;
  }
  const command = buildRuntimeDaemonCompositionSmokeCommand(options, env);
  const report = runtimeDaemonCompositionSmokeReport(command);
  if (options.dryRun) {
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }
  if (!command.live) {
    if (command.status === "passed") {
      console.log("Runtime daemon composition smoke already has matching pass evidence.");
    } else {
      console.log(`Skipping runtime daemon composition smoke; ${command.skipReason}.`);
    }
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }
  const code = runRuntimeDaemonCompositionSmoke(command);
  if (code !== 0) return code;
  if (options.writeResult !== false) {
    const resultPath = options.resultPath === null
      ? undefined
      : resolve(repoRoot, options.resultPath ?? command.evidence.resultPath ?? "");
    writeRuntimeDaemonCompositionSmokeResult(command, resultPath);
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

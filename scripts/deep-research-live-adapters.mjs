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
const DEFAULT_PROFILE = "workbench-host";
const GATE_PROFILE_ENV = "KIRAKIRA_DEEP_RESEARCH_GATE_PROFILE";
const LIVE_ENV = "KIRAKIRA_DEEP_RESEARCH_LIVE_ADAPTERS";
const PASSED_ENV = "KIRAKIRA_DEEP_RESEARCH_LIVE_ADAPTERS_PASSED";
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_RESULT_PATH = resolve(
  repoRoot,
  "docs",
  "upgrade",
  "gates",
  "deep-research-live-adapters.json",
);
const REQUIRED_SUITES = Object.freeze(["file", "web", "mcp"]);
const UNIT_TESTS = Object.freeze([
  "test/unit/deep-research/file.test.ts",
  "test/unit/deep-research/web.test.ts",
  "test/unit/deep-research/mcp.test.ts",
  "test/unit/runtime-daemon/deep-research-mcp-source.test.ts",
]);
const LIVE_TESTS = Object.freeze([
  "test/smoke/deep-research/live-adapters-smoke.test.ts",
]);
const CHECKS = Object.freeze([
  "deep-research:file-source",
  "deep-research:web-source",
  "deep-research:mcp-runtime-source",
  "deep-research:mcp-live-transports",
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

export function normalizeDeepResearchLiveAdaptersArgs(argv = []) {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const options = {
    profileName: undefined,
    dryRun: false,
    live: false,
    timeoutMs: undefined,
    resultPath: DEFAULT_RESULT_PATH,
    writeResult: true,
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
    throw new Error(`Unknown deep research live adapter argument: ${arg}`);
  }

  return options;
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

function relativeEvidencePath(path) {
  return relative(repoRoot, path).replaceAll("\\", "/");
}

function readSmokeResult(path) {
  if (!path || !existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { schemaVersion: 1, status: "invalid", path: relativeEvidencePath(path) };
  }
}

function smokeResultMatches(result, expected) {
  return Boolean(
    isRecord(result) &&
      result.schemaVersion === 1 &&
      result.status === "passed" &&
      result.gate === expected.gate &&
      result.profile === expected.profile &&
      sameStringArray(result.requiredSuites, expected.requiredSuites) &&
      sameStringArray(result.checks, expected.checks) &&
      sameStringArray(result.unitTests, expected.unitTests) &&
      sameStringArray(result.liveTests, expected.liveTests),
  );
}

function commandPlan(command, args) {
  return {
    command,
    args,
    display: [command, ...args].join(" "),
  };
}

export function buildDeepResearchLiveAdaptersCommand(options = {}, env = process.env) {
  const profileName = options.profileName ?? env[GATE_PROFILE_ENV] ?? DEFAULT_PROFILE;
  const profile = resolveRuntimeProfile(
    profileName,
    loadRuntimeProfiles(),
    env,
  );
  const resultPath = options.resultPath === null
    ? undefined
    : (options.resultPath ?? DEFAULT_RESULT_PATH);
  const result = readSmokeResult(resultPath);
  const expectedResult = {
    gate: "deep-research:live-adapters",
    profile: profile.name,
    requiredSuites: [...REQUIRED_SUITES],
    checks: [...CHECKS],
    unitTests: [...UNIT_TESTS],
    liveTests: [...LIVE_TESTS],
  };
  const resultPassed = smokeResultMatches(result, expectedResult);
  const externallyPassed = env[PASSED_ENV] === "1" || resultPassed;
  const live = options.live || env[LIVE_ENV] === "1" || env.KIRAKIRA_LIVE_E2E === "1";
  const skipReason = externallyPassed
    ? undefined
    : live
      ? undefined
      : `live gate is opt-in; set ${LIVE_ENV}=1 or pass --live`;
  const unitArgs = ["vitest", "run", ...UNIT_TESTS];
  const liveArgs = ["vitest", "run", ...LIVE_TESTS];

  return {
    schemaVersion: 1,
    gate: "deep-research:live-adapters",
    profile: profile.name,
    live,
    status: externallyPassed ? "passed" : live ? "ready" : "skipped",
    ...(skipReason ? { skipReason } : {}),
    requiredSuites: [...REQUIRED_SUITES],
    checks: [...CHECKS],
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
    unitContract: {
      status: "planned",
      tests: [...UNIT_TESTS],
      command: commandPlan("pnpm", unitArgs),
    },
    liveGate: {
      status: externallyPassed ? "passed" : live ? "pending" : "skipped",
      ...(skipReason ? { skipReason } : {}),
      tests: [...LIVE_TESTS],
      command: commandPlan("pnpm", liveArgs),
      env: {
        KIRAKIRA_RUNTIME_PROFILE: profile.name,
      },
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
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
    ],
  };
}

function commandFor(name) {
  return process.platform === "win32" && name === "pnpm" ? "pnpm.cmd" : name;
}

function quoteCmdArg(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:\\-]+$/u.test(text)) return text;
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

function runChecked(command, args, options) {
  const invocation = commandInvocation(command, args);
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

function writeSmokeResult(smoke, path) {
  if (!path) return;
  const result = {
    schemaVersion: 1,
    gate: smoke.gate,
    profile: smoke.profile,
    status: "passed",
    passedAt: new Date().toISOString(),
    requiredSuites: smoke.requiredSuites,
    checks: smoke.checks,
    unitTests: smoke.unitContract.tests,
    liveTests: smoke.liveGate.tests,
    command: `node scripts/deep-research-live-adapters.mjs --profile ${smoke.profile} --live`,
    references: smoke.references,
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Wrote deep research live adapter evidence to ${relativeEvidencePath(path)}.`);
}

function printHelp() {
  return `Usage: node scripts/deep-research-live-adapters.mjs [options]

Options:
  --profile <name>         Runtime profile label for gate evidence.
                           Defaults to ${GATE_PROFILE_ENV}, then workbench-host.
  --dry-run                Print the profile-gated smoke contract only.
  --live                   Run unit and live MCP adapter tests.
  --timeout-ms <ms>        Per-command timeout for test execution.
  --result <path>          Read/write a smoke evidence file. Defaults to docs/upgrade/gates/deep-research-live-adapters.json.
  --write-result <path>    Write live pass evidence to a custom path.
  --no-write-result        Do not write evidence after a live pass.
  --help                   Show this help.
`;
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const options = normalizeDeepResearchLiveAdaptersArgs(argv);
  if (options.help) {
    process.stdout.write(printHelp());
    return 0;
  }
  const smoke = buildDeepResearchLiveAdaptersCommand(options, env);
  if (options.dryRun) {
    console.log(JSON.stringify(smoke, null, 2));
    return 0;
  }
  if (!smoke.live) {
    if (smoke.status === "passed") {
      console.log("Deep research live adapter gate already has matching pass evidence.");
    } else {
      console.log(`Skipping deep research live adapter gate; ${smoke.skipReason}.`);
    }
    console.log(JSON.stringify(smoke, null, 2));
    return 0;
  }

  const runtimeEnv = {
    ...env,
    KIRAKIRA_RUNTIME_PROFILE: smoke.profile,
  };
  const unitCode = runChecked(
    smoke.unitContract.command.command,
    smoke.unitContract.command.args,
    { env: runtimeEnv, timeoutMs: smoke.liveGate.timeoutMs },
  );
  if (unitCode !== 0) return unitCode;

  const liveCode = runChecked(
    smoke.liveGate.command.command,
    smoke.liveGate.command.args,
    { env: runtimeEnv, timeoutMs: smoke.liveGate.timeoutMs },
  );
  if (liveCode !== 0) return liveCode;

  if (options.writeResult !== false) {
    writeSmokeResult(smoke, options.resultPath ?? DEFAULT_RESULT_PATH);
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

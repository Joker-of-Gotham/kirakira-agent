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
const DEFAULT_GATE = "deep-research:live-adapters";
const DEFAULT_PROFILE = "workbench-host";
const GATE_NAME_ENV = "KIRAKIRA_DEEP_RESEARCH_GATE";
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
    gateName: undefined,
    profileName: undefined,
    dryRun: false,
    live: false,
    timeoutMs: undefined,
    resultPath: DEFAULT_RESULT_PATH,
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

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredString(value, name) {
  const text = stringValue(value);
  if (!text) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return text;
}

function stringArray(value, name) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array`);
  }
  return value.map((item, index) => requiredString(item, `${name}[${index}]`));
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))];
}

function deepResearchGateConfig(config, gateName) {
  const gates = isRecord(config?.deepResearchLiveAdapterGates)
    ? config.deepResearchLiveAdapterGates
    : {};
  const gate = gates[gateName];
  if (!isRecord(gate)) {
    throw new Error(`Unknown deep research live adapter gate: ${gateName}`);
  }
  const suites = normalizeDeepResearchSuites(gate.suites);
  return {
    name: gateName,
    description: stringValue(gate.description),
    profile: stringValue(gate.profile),
    liveEnv: stringValue(gate.liveEnv) ?? LIVE_ENV,
    passedEnv: stringValue(gate.passedEnv) ?? PASSED_ENV,
    resultPath: stringValue(gate.resultPath) ?? relativeEvidencePath(DEFAULT_RESULT_PATH),
    timeoutMs: gate.timeoutMs === undefined
      ? DEFAULT_TIMEOUT_MS
      : positiveInteger(gate.timeoutMs, `deepResearchLiveAdapterGates.${gateName}.timeoutMs`),
    suites,
    requiredSuites: suites.map((suite) => suite.id),
    checks: uniqueStrings(suites.flatMap((suite) => suite.checks)),
    unitTests: uniqueStrings(suites.flatMap((suite) => suite.unitTests)),
    liveTests: uniqueStrings(suites.flatMap((suite) => suite.liveTests)),
    references: normalizeReferences(gate.references),
  };
}

function normalizeDeepResearchSuites(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("deep research live adapter gate suites must be a non-empty array");
  }
  return value.map((suite, index) => {
    if (!isRecord(suite)) {
      throw new Error(`deep research live adapter suite ${index} must be an object`);
    }
    return {
      id: requiredString(suite.id, `deepResearchLiveAdapterGates.suites[${index}].id`),
      source: requiredString(suite.source, `deepResearchLiveAdapterGates.suites[${index}].source`),
      checks: stringArray(suite.checks, `deepResearchLiveAdapterGates.suites[${index}].checks`),
      unitTests: stringArray(suite.unitTests, `deepResearchLiveAdapterGates.suites[${index}].unitTests`),
      liveTests: stringArray(suite.liveTests, `deepResearchLiveAdapterGates.suites[${index}].liveTests`),
    };
  });
}

function normalizeReferences(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error("deep research live adapter gate references must be an array");
  }
  return value.map((reference, index) => {
    if (!isRecord(reference)) {
      throw new Error(`deep research live adapter reference ${index} must be an object`);
    }
    return {
      title: requiredString(reference.title, `deepResearchLiveAdapterGates.references[${index}].title`),
      url: requiredString(reference.url, `deepResearchLiveAdapterGates.references[${index}].url`),
    };
  });
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
  const gateName = options.gateName ?? env[GATE_NAME_ENV] ?? DEFAULT_GATE;
  const config = options.config ?? loadRuntimeProfiles();
  const gate = deepResearchGateConfig(config, gateName);
  const profileName = options.profileName ?? env[GATE_PROFILE_ENV] ?? gate.profile ?? DEFAULT_PROFILE;
  const profile = resolveRuntimeProfile(
    profileName,
    config,
    env,
  );
  const configuredResultPath = options.resultPath !== undefined
    ? options.resultPath
    : gate.resultPath;
  const resultPath = options.resultPath === null || configuredResultPath === undefined
    ? undefined
    : resolve(repoRoot, configuredResultPath);
  const result = readSmokeResult(resultPath);
  const expectedResult = {
    gate: gate.name,
    profile: profile.name,
    requiredSuites: gate.requiredSuites,
    checks: gate.checks,
    unitTests: gate.unitTests,
    liveTests: gate.liveTests,
  };
  const resultPassed = smokeResultMatches(result, expectedResult);
  const externallyPassed = env[gate.passedEnv] === "1" || resultPassed;
  const live = options.live || env[gate.liveEnv] === "1" || env.KIRAKIRA_LIVE_E2E === "1";
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
    gateSource: "runtime-profile.deepResearchLiveAdapterGates",
    description: gate.description,
    profile: profile.name,
    live,
    status: externallyPassed ? "passed" : live ? "ready" : "skipped",
    ...(skipReason ? { skipReason } : {}),
    liveEnv: gate.liveEnv,
    requiredSuites: gate.requiredSuites,
    checks: gate.checks,
    suites: gate.suites,
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
      tests: gate.unitTests,
      command: commandPlan("pnpm", unitArgs),
    },
    liveGate: {
      status: externallyPassed ? "passed" : live ? "pending" : "skipped",
      ...(skipReason ? { skipReason } : {}),
      tests: gate.liveTests,
      command: commandPlan("pnpm", liveArgs),
      env: {
        KIRAKIRA_RUNTIME_PROFILE: profile.name,
      },
      timeoutMs: options.timeoutMs ?? gate.timeoutMs,
    },
    references: gate.references,
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
    gateSource: smoke.gateSource,
    profile: smoke.profile,
    status: "passed",
    passedAt: new Date().toISOString(),
    requiredSuites: smoke.requiredSuites,
    checks: smoke.checks,
    suites: smoke.suites,
    unitTests: smoke.unitContract.tests,
    liveTests: smoke.liveGate.tests,
    command: `node scripts/deep-research-live-adapters.mjs --gate ${smoke.gate} --profile ${smoke.profile} --live`,
    references: smoke.references,
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Wrote deep research live adapter evidence to ${relativeEvidencePath(path)}.`);
}

function printHelp() {
  return `Usage: node scripts/deep-research-live-adapters.mjs [options]

Options:
  --gate <name>            Deep research live adapter gate name.
                           Defaults to ${GATE_NAME_ENV}, then ${DEFAULT_GATE}.
  --profile <name>         Runtime profile label for gate evidence.
                           Defaults to ${GATE_PROFILE_ENV}, then the gate profile.
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
    const writePath = options.resultPath !== undefined
      ? options.resultPath
      : smoke.evidence?.resultPath
        ? resolve(repoRoot, smoke.evidence.resultPath)
        : undefined;
    writeSmokeResult(smoke, writePath);
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

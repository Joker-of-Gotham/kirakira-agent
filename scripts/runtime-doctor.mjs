#!/usr/bin/env node
import { lstat } from "node:fs/promises";
import { createConnection } from "node:net";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import {
  buildRuntimeReadinessPlan,
  loadRuntimeProfiles,
  RUNTIME_READINESS_CHECK_TYPES,
  RUNTIME_READINESS_HEALTH_SCHEMAS,
  runtimeReadinessHealthSchema,
  runtimeTopologyIssues,
  resolveRuntimeProfile,
} from "./runtime-profile.mjs";

const DEFAULT_TIMEOUT_MS = 1_500;

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function elapsedSince(start) {
  return Math.max(0, Math.round(performance.now() - start));
}

function statusForFailure(check) {
  return check.required === false ? "warn" : "fail";
}

function redactedDetail(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/\/\/[^:/\s]+:[^@\s]+@/gu, "//<redacted>@")
    .replace(/\b(token|password|api_key|apikey|authorization)=([^&#\s]+)/giu, "$1=<redacted>");
}

function parseTargetUrl(target) {
  if (typeof target !== "string" || target.length === 0) return undefined;
  try {
    return new URL(target);
  } catch {
    return undefined;
  }
}

function isLoopbackHost(hostname) {
  const value = hostname.toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1" || value === "[::1]";
}

function isRuntimeEndpointParts(value) {
  return isRecord(value)
    && ["http", "https", "ws", "wss"].includes(value.protocol)
    && typeof value.host === "string"
    && Number.isInteger(value.port)
    && typeof value.path === "string"
    && typeof value.url === "string"
    && typeof value.origin === "string";
}

function isRuntimeBrowserGatewayHealth(value) {
  return isRecord(value)
    && value.schemaVersion === 1
    && value.ok === true
    && value.transport === "browser-gateway"
    && isRuntimeEndpointParts(value.endpoint)
    && typeof value.tokenRequired === "boolean";
}

const HTTP_HEALTH_RESPONSE_CONTRACTS = Object.freeze({
  [RUNTIME_READINESS_HEALTH_SCHEMAS.browserGateway]: Object.freeze({
    validate: isRuntimeBrowserGatewayHealth,
    invalidDetail: "Runtime gateway health response is invalid",
  }),
});

function hostReachableFromProfile(plan, url) {
  if (plan.mode !== "container") return true;
  return isLoopbackHost(url.hostname);
}

function portFromUrl(url) {
  if (url.port) return Number(url.port);
  if (url.protocol === "http:") return 80;
  if (url.protocol === "https:") return 443;
  return undefined;
}

function resultFor(check, status, start, detail) {
  return {
    name: check.name,
    type: check.type,
    source: check.source,
    target: check.target,
    required: check.required !== false,
    status,
    durationMs: elapsedSince(start),
    ...(detail ? { detail } : {}),
  };
}

async function defaultHttpProbe(url, timeoutMs, fetcher = globalThis.fetch, context = {}) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const healthContract = HTTP_HEALTH_RESPONSE_CONTRACTS[runtimeReadinessHealthSchema(context.check)];
  if (healthContract) {
    const payload = await response.json();
    if (!healthContract.validate(payload)) {
      throw new Error(healthContract.invalidDetail);
    }
  }
}

async function defaultSocketProbe(path, timeoutMs) {
  if (!path.startsWith("\\\\") && !path.startsWith("//")) {
    const stat = await lstat(path);
    if (!stat.isSocket()) {
      throw new Error("Path exists but is not a socket");
    }
  }
  await new Promise((resolve, reject) => {
    const socket = createConnection(path);
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };
    socket.setTimeout(timeoutMs, () => finish(new Error("Socket probe timed out")));
    socket.once("connect", () => finish());
    socket.once("error", finish);
  });
}

async function defaultTcpProbe(url, timeoutMs) {
  const port = portFromUrl(url);
  if (!Number.isInteger(port)) {
    throw new Error(`Target has no TCP port: ${url.protocol}`);
  }
  await new Promise((resolve, reject) => {
    const socket = createConnection({
      host: url.hostname,
      port,
    });
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };
    socket.setTimeout(timeoutMs, () => finish(new Error("TCP probe timed out")));
    socket.once("connect", () => finish());
    socket.once("error", finish);
  });
}

async function probeHttpCheck(plan, check, options) {
  const start = performance.now();
  if (options.probe === false) {
    return resultFor(check, "skipped", start, "Live probes disabled");
  }
  try {
    await (options.transport?.http ?? defaultHttpProbe)(
      check.target,
      options.timeoutMs,
      options.fetcher,
      { plan, check },
    );
    return resultFor(check, "ok", start);
  } catch (error) {
    return resultFor(check, statusForFailure(check), start, redactedDetail(error));
  }
}

async function probeSocketCheck(plan, check, options) {
  const start = performance.now();
  if (options.probe === false) {
    return resultFor(check, "skipped", start, "Live probes disabled");
  }
  try {
    await (options.transport?.socket ?? defaultSocketProbe)(
      check.target,
      options.timeoutMs,
      { plan, check },
    );
    return resultFor(check, "ok", start);
  } catch (error) {
    return resultFor(check, statusForFailure(check), start, redactedDetail(error));
  }
}

async function probeServiceCheck(plan, check, options) {
  const start = performance.now();
  if (options.probe === false) {
    return resultFor(check, "skipped", start, "Live probes disabled");
  }
  const url = parseTargetUrl(check.target);
  if (!url) {
    return resultFor(check, "skipped", start, "No probeable target");
  }
  if (!hostReachableFromProfile(plan, url)) {
    return resultFor(check, "skipped", start, "Target is internal to the selected profile");
  }
  try {
    await (options.transport?.tcp ?? defaultTcpProbe)(url, options.timeoutMs, { plan, check });
    return resultFor(check, "ok", start);
  } catch (error) {
    return resultFor(check, statusForFailure(check), start, redactedDetail(error));
  }
}

async function probeTopologyCheck(_plan, check, options) {
  const start = performance.now();
  if (options.probe === false) {
    return resultFor(check, "skipped", start, "Live probes disabled");
  }
  const issues = runtimeTopologyIssues(check.topology);
  if (issues.length === 0) return resultFor(check, "ok", start);
  return resultFor(check, statusForFailure(check), start, issues.join("; "));
}

async function probeUnknownCheck(_plan, check) {
  return resultFor(check, statusForFailure(check), performance.now(), "Unknown check type");
}

const READINESS_PROBE_BY_TYPE = Object.freeze({
  [RUNTIME_READINESS_CHECK_TYPES.http]: probeHttpCheck,
  [RUNTIME_READINESS_CHECK_TYPES.httpHealth]: probeHttpCheck,
  [RUNTIME_READINESS_CHECK_TYPES.socket]: probeSocketCheck,
  [RUNTIME_READINESS_CHECK_TYPES.composeService]: probeServiceCheck,
  [RUNTIME_READINESS_CHECK_TYPES.externalService]: probeServiceCheck,
  [RUNTIME_READINESS_CHECK_TYPES.orchestrationTopology]: probeTopologyCheck,
});

export async function evaluateRuntimeReadinessPlan(plan, options = {}) {
  const started = performance.now();
  const normalizedOptions = {
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    probe: options.probe !== false,
    fetcher: options.fetcher,
    transport: options.transport,
  };
  const checks = [];
  for (const check of plan.checks ?? []) {
    if (!isRecord(check)) continue;
    const probe = READINESS_PROBE_BY_TYPE[check.type] ?? probeUnknownCheck;
    checks.push(await probe(plan, check, normalizedOptions));
  }
  const failed = checks.filter((check) => check.status === "fail").length;
  const warned = checks.filter((check) => check.status === "warn").length;
  const skipped = checks.filter((check) => check.status === "skipped").length;
  return {
    schemaVersion: 1,
    profile: plan.profile,
    mode: plan.mode,
    ok: failed === 0,
    status: failed > 0 ? "fail" : warned > 0 ? "warn" : "ok",
    durationMs: elapsedSince(started),
    compose: plan.compose,
    summary: {
      total: checks.length,
      ok: checks.filter((check) => check.status === "ok").length,
      failed,
      warned,
      skipped,
    },
    checks,
  };
}

export async function runRuntimeDoctor(profileName = undefined, options = {}) {
  const config = options.config ?? loadRuntimeProfiles();
  const profile = resolveRuntimeProfile(profileName, config, options.env ?? process.env);
  const plan = options.plan ?? buildRuntimeReadinessPlan(profile, { config });
  return evaluateRuntimeReadinessPlan(plan, options);
}

function parseArgs(argv) {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const options = {
    profileName: undefined,
    json: false,
    probe: true,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--no-probe" || arg === "--plan-only") {
      options.probe = false;
      continue;
    }
    if (arg === "--profile") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--profile requires a profile name");
      options.profileName = value;
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error("--timeout-ms requires a positive integer");
      }
      options.timeoutMs = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown runtime doctor argument: ${arg}`);
    }
    if (options.profileName === undefined) {
      options.profileName = arg;
      continue;
    }
    throw new Error(`Unknown runtime doctor argument: ${arg}`);
  }
  return options;
}

function formatDoctorReport(report) {
  const lines = [
    `Kirakira runtime doctor: ${report.profile} (${report.status})`,
    `Checks: ${report.summary.ok} ok, ${report.summary.failed} failed, ${report.summary.warned} warnings, ${report.summary.skipped} skipped`,
  ];
  if (report.compose) {
    lines.push(`Compose readiness: ${report.compose.command} ${report.compose.args.join(" ")}`);
  }
  for (const check of report.checks) {
    const marker =
      check.status === "ok" ? "OK" : check.status === "skipped" ? "SKIP" : check.status.toUpperCase();
    lines.push(`  [${marker}] ${check.name}${check.detail ? ` - ${check.detail}` : ""}`);
  }
  return lines.join("\n");
}

async function main(argv) {
  const options = parseArgs(argv);
  const report = await runRuntimeDoctor(options.profileName, options);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatDoctorReport(report));
  }
  return report.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

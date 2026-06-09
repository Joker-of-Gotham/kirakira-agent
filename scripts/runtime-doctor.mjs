#!/usr/bin/env node
import { lstat } from "node:fs/promises";
import { createConnection } from "node:net";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import {
  buildRuntimeReadinessPlan,
  loadRuntimeProfiles,
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

const ORCHESTRATION_LANE_NAMES = new Set(["foreground", "queued", "background", "delegated"]);
const ORCHESTRATION_MODES = new Set(["tool", "supervisor", "swarm"]);
const ORCHESTRATION_CONTEXT_MODES = new Set(["isolated", "filtered", "inherit"]);

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
  if (context.check?.type === "http-health" && context.check?.name === "daemon:browser-gateway") {
    const payload = await response.json();
    if (!isRuntimeBrowserGatewayHealth(payload)) {
      throw new Error("Runtime gateway health response is invalid");
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

function topologyIssues(topology) {
  const issues = [];
  if (!isRecord(topology)) return ["Topology summary is missing"];
  const lanes = isRecord(topology.lanes) ? topology.lanes : {};
  for (const [lane, value] of Object.entries(lanes)) {
    if (!ORCHESTRATION_LANE_NAMES.has(lane)) {
      issues.push(`Unknown lane ${lane}`);
      continue;
    }
    if (
      isRecord(value) &&
      value.capacity !== undefined &&
      (!Number.isInteger(value.capacity) || value.capacity < 0)
    ) {
      issues.push(`Lane ${lane} capacity must be a non-negative integer`);
    }
  }
  if (topology.handoffMode !== undefined && !ORCHESTRATION_MODES.has(topology.handoffMode)) {
    issues.push(`Unknown handoff mode ${topology.handoffMode}`);
  }
  const roles = Array.isArray(topology.roles) ? topology.roles.filter(isRecord) : [];
  const roleIds = new Set();
  for (const role of roles) {
    if (typeof role.id !== "string" || role.id.length === 0) {
      issues.push("Role id must be a non-empty string");
      continue;
    }
    if (roleIds.has(role.id)) {
      issues.push(`Duplicate role ${role.id}`);
    }
    roleIds.add(role.id);
    if (role.lane !== undefined && !ORCHESTRATION_LANE_NAMES.has(role.lane)) {
      issues.push(`Role ${role.id} references unknown lane ${role.lane}`);
    }
    if (role.context !== undefined && !ORCHESTRATION_CONTEXT_MODES.has(role.context)) {
      issues.push(`Role ${role.id} has invalid context ${role.context}`);
    }
  }
  if (
    typeof topology.defaultRole === "string" &&
    roles.length > 0 &&
    !roleIds.has(topology.defaultRole)
  ) {
    issues.push(`Default role ${topology.defaultRole} is not declared`);
  }
  const handoffs = Array.isArray(topology.handoffs) ? topology.handoffs.filter(isRecord) : [];
  for (const handoff of handoffs) {
    if (typeof handoff.from !== "string" || !roleIds.has(handoff.from)) {
      issues.push(`Handoff references unknown source role ${String(handoff.from)}`);
    }
    if (typeof handoff.to !== "string" || !roleIds.has(handoff.to)) {
      issues.push(`Handoff references unknown target role ${String(handoff.to)}`);
    }
    if (handoff.mode !== undefined && !ORCHESTRATION_MODES.has(handoff.mode)) {
      issues.push(`Handoff ${String(handoff.from)} -> ${String(handoff.to)} has invalid mode ${handoff.mode}`);
    }
  }
  return issues;
}

async function probeTopologyCheck(check, options) {
  const start = performance.now();
  if (options.probe === false) {
    return resultFor(check, "skipped", start, "Live probes disabled");
  }
  const issues = topologyIssues(check.topology);
  if (issues.length === 0) return resultFor(check, "ok", start);
  return resultFor(check, statusForFailure(check), start, issues.join("; "));
}

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
    if (check.type === "http" || check.type === "http-health") {
      checks.push(await probeHttpCheck(plan, check, normalizedOptions));
      continue;
    }
    if (check.type === "socket") {
      checks.push(await probeSocketCheck(plan, check, normalizedOptions));
      continue;
    }
    if (check.type === "compose-service" || check.type === "external-service") {
      checks.push(await probeServiceCheck(plan, check, normalizedOptions));
      continue;
    }
    if (check.type === "orchestration-topology") {
      checks.push(await probeTopologyCheck(check, normalizedOptions));
      continue;
    }
    checks.push(resultFor(check, statusForFailure(check), performance.now(), "Unknown check type"));
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

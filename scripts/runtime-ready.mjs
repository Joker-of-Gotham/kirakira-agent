#!/usr/bin/env node
import { pathToFileURL } from "node:url";

import {
  buildRuntimeProfileProjection,
  loadRuntimeProfiles,
  resolveRuntimeProfile,
} from "./runtime-profile.mjs";

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function count(value) {
  return Array.isArray(value) ? value.length : 0;
}

function startupSurfaceSummaries(startup) {
  if (!isRecord(startup?.surfaces)) return [];
  return Object.entries(startup.surfaces)
    .filter(([surface, plan]) => typeof surface === "string" && isRecord(plan))
    .map(([surface, plan]) => {
      const steps = Array.isArray(plan.steps) ? plan.steps : [];
      const readinessChecks = Array.isArray(plan.readiness?.checks) ? plan.readiness.checks : [];
      return {
        surface,
        steps: steps.length,
        stepNames: steps
          .map((step) => step?.name)
          .filter((name) => typeof name === "string" && name.length > 0),
        readinessChecks: readinessChecks.length,
      };
    });
}

export function buildRuntimeReadyReport(profileName = undefined, options = {}) {
  const config = options.config ?? loadRuntimeProfiles();
  const profile = resolveRuntimeProfile(profileName, config, options.env ?? process.env);
  const projection = options.projection ?? buildRuntimeProfileProjection(profile, { config });
  const readiness = projection.fragments?.readiness ?? {};
  const mcpConfig = projection.fragments?.mcpConfig ?? {};
  const startup = projection.fragments?.startup ?? {};
  const mcp = projection.mcp ?? {};
  const startupSurfaces = startupSurfaceSummaries(startup);
  const topLevelStartupSteps = count(startup.steps);
  const surfaceStartupSteps = startupSurfaces.reduce((total, surface) => total + surface.steps, 0);

  return {
    schemaVersion: 1,
    profile: projection.profile,
    mode: projection.mode,
    source: "runtime-profile-projection",
    planOnly: true,
    probes: {
      enabled: false,
      reason: "runtime:ready renders profile readiness without opening sockets, HTTP endpoints, or Docker processes",
    },
    mcp: {
      source: "runtime-profile-projection",
      localOverlay: false,
      serverRefs: mcp.serverRefs ?? mcpConfig.serverRefs ?? [],
      roots: mcp.roots ?? mcpConfig.roots ?? {},
      servers: mcp.servers ?? [],
    },
    compose: readiness.compose,
    readiness,
    startup,
    startupSurfaces,
    summary: {
      readinessChecks: count(readiness.checks),
      mcpServers: count(mcp.servers),
      startupSteps: topLevelStartupSteps + surfaceStartupSteps,
      topLevelStartupSteps,
      startupSurfaces: startupSurfaces.length,
      surfaceStartupSteps,
      composeServices: count(readiness.compose?.services),
    },
  };
}

function parseArgs(argv) {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const options = {
    profileName: undefined,
    json: false,
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
    if (arg === "--profile") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--profile requires a profile name");
      options.profileName = value;
      index += 1;
      continue;
    }
    if (arg === "--no-probe" || arg === "--plan-only") {
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown runtime ready argument: ${arg}`);
    }
    if (options.profileName === undefined) {
      options.profileName = arg;
      continue;
    }
    throw new Error(`Unknown runtime ready argument: ${arg}`);
  }
  return options;
}

function formatRuntimeReadyReport(report) {
  const lines = [
    `Kirakira runtime ready plan: ${report.profile} (${report.mode})`,
    "Plan only: no live probes, process startup, Docker execution, or local MCP overlay",
    `Readiness checks: ${report.summary.readinessChecks}`,
    `MCP servers: ${report.summary.mcpServers} from ${report.mcp.source}`,
    `Startup surfaces: ${report.startupSurfaces.length > 0
      ? report.startupSurfaces.map((surface) => `${surface.surface}(${surface.steps})`).join(", ")
      : "none"}`,
  ];
  if (isRecord(report.compose)) {
    lines.push(`Compose plan: ${report.compose.command} ${report.compose.args.join(" ")}`);
  }
  for (const check of report.readiness.checks ?? []) {
    lines.push(`  [PLAN] ${check.name}${check.target ? ` -> ${check.target}` : ""}`);
  }
  return lines.join("\n");
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const report = buildRuntimeReadyReport(options.profileName);
  console.log(options.json ? JSON.stringify(report, null, 2) : formatRuntimeReadyReport(report));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

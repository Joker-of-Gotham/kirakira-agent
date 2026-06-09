import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildRuntimeReadyReport } from "../../../scripts/runtime-ready.mjs";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");

describe("runtime ready plan", () => {
  it("renders profile-owned readiness without live probe statuses", () => {
    const report = buildRuntimeReadyReport("workbench-host", { env: {} });

    expect(report).toMatchObject({
      schemaVersion: 1,
      profile: "workbench-host",
      mode: "hybrid",
      source: "runtime-profile-projection",
      planOnly: true,
      probes: {
        enabled: false,
      },
      mcp: {
        source: "runtime-profile-projection",
        localOverlay: false,
      },
    });
    expect(report.readiness.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "daemon:browser-gateway",
        "presentation:web",
        "presentation:desktop",
      ]),
    );
    expect(JSON.stringify(report.readiness.checks)).not.toMatch(/"status":"(ok|fail|warn|skipped)"/u);
    expect(JSON.stringify(report)).not.toContain("5173");
  });

  it("keeps compose as a plan and never an executed result", () => {
    const report = buildRuntimeReadyReport("test-host", { env: {} });

    expect(report.compose).toMatchObject({
      command: "docker",
      args: expect.arrayContaining(["compose", "up", "-d", "--wait"]),
    });
    expect(report.summary.composeServices).toBeGreaterThan(0);
    expect(report.probes.reason).toContain("without opening sockets");
    expect(JSON.stringify(report)).not.toContain("durationMs");
  });

  it("uses the profile MCP projection without local config overlay", () => {
    const report = buildRuntimeReadyReport("workbench-host", { env: {} });

    expect(report.mcp.localOverlay).toBe(false);
    expect(report.mcp.serverRefs).toContain("@default");
    expect(report.mcp.servers.map((server) => server.name)).toEqual(
      expect.arrayContaining(["filesystem-core", "filesystem-artifact"]),
    );
  });

  it("keeps the script independent from live probes and local MCP overlays", () => {
    const source = readFileSync(resolve(repoRoot, "scripts/runtime-ready.mjs"), "utf8");
    const forbiddenTokens = [
      "runtime-doctor.mjs",
      "runtime-mcp-config",
      "evaluateRuntimeReadinessPlan",
      "node:net",
      "node:child_process",
      "createConnection",
      "spawn(",
      "fetch(",
    ];

    for (const token of forbiddenTokens) {
      expect(source).not.toContain(token);
    }
  });
});

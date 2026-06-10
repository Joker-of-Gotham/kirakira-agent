import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import {
  buildRuntimeIntegrationGateCommand,
  normalizeRuntimeIntegrationGateArgs,
  runRuntimeIntegrationGate,
  writeRuntimeIntegrationGateResult,
} from "../../../scripts/runtime-integration-gate.mjs";

describe("runtime integration gate", () => {
  it("parses the profile-owned integration command shape", () => {
    expect(
      normalizeRuntimeIntegrationGateArgs([
        "--gate",
        "upgrade",
        "--live",
        "--skip-compose",
        "--skip-infra",
        "--timeout-ms",
        "120000",
      ]),
    ).toMatchObject({
      gateName: "upgrade",
      live: true,
      skipCompose: true,
      skipInfra: true,
      timeoutMs: 120_000,
    });
  });

  it("builds the upgrade gate from runtime profile configuration", () => {
    const command = buildRuntimeIntegrationGateCommand(
      { gateName: "upgrade", resultPath: null },
      {},
    );

    expect(command.gate).toBe("upgrade");
    expect(command.gateSource).toBe("runtime-profile.integrationGates");
    expect(command.status).toBe("passed");
    expect(command.live).toBe(false);
    expect(command.steps.map((step) => [step.id, step.kind, step.profile])).toEqual([
      ["deep-research:live-adapters", "deep-research-live-adapters", "workbench-host"],
      ["memory-store:persistence", "memory-persistence", "test-host"],
      ["runtime-daemon:composition-smoke", "runtime-daemon-composition", "workbench-host"],
      ["workbench:presentation", "workbench-smoke", "workbench-host"],
    ]);
    expect(command.checks).toEqual(
      expect.arrayContaining([
        "deep-research:mcp-kernel-research-events",
        "memory-store:checkpoint",
        "runtime-daemon:kernelbridge-single-run",
        "runtime-daemon:mcp-policy-trust-audit-otel",
        "daemon:browser-gateway",
        "presentation:web",
        "presentation:desktop",
      ]),
    );
    expect(JSON.stringify(command)).not.toContain("5173");
  });

  it("uses the integration live env opt-in and forwards live child commands", () => {
    const command = buildRuntimeIntegrationGateCommand(
      { gateName: "upgrade", resultPath: null, timeoutMs: 12_000 },
      { KIRAKIRA_RUNTIME_INTEGRATION_GATE_LIVE: "1" },
    );

    expect(command.live).toBe(true);
    expect(command.liveGate.command).toBe(
      "node scripts/runtime-integration-gate.mjs --gate upgrade --live",
    );
    expect(command.steps.map((step) => step.command)).toEqual([
      "node scripts/deep-research-live-adapters.mjs --profile workbench-host --timeout-ms 12000 --live",
      "node scripts/memory-persistence-smoke.mjs --profile test-host --timeout-ms 12000 --live",
      "node scripts/runtime-daemon-composition-smoke.mjs --gate runtime-daemon:composition-smoke --profile workbench-host --timeout-ms 12000 --live",
      "node scripts/kirakira-workbench-smoke.mjs --profile workbench-host --gate presentation --timeout-ms 12000 --live",
    ]);
  });

  it("writes and trusts aggregate evidence without losing child gate identities", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "kirakira-runtime-integration-"));
    const resultPath = join(tempRoot, "runtime-integration-gate.json");
    try {
      const command = buildRuntimeIntegrationGateCommand({
        gateName: "upgrade",
        resultPath,
      }, {});
      const result = writeRuntimeIntegrationGateResult(command, resultPath);
      const replay = buildRuntimeIntegrationGateCommand({
        gateName: "upgrade",
        resultPath,
      }, {});

      expect(result).toMatchObject({
        schemaVersion: 1,
        gate: "upgrade",
        status: "passed",
        steps: [
          expect.objectContaining({ id: "deep-research:live-adapters" }),
          expect.objectContaining({ id: "memory-store:persistence" }),
          expect.objectContaining({ id: "runtime-daemon:composition-smoke" }),
          expect.objectContaining({ id: "workbench:presentation" }),
        ],
      });
      expect(replay.evidence).toMatchObject({
        resultStatus: "passed",
        resultMatches: true,
        childGatesPassed: true,
      });
      expect(replay.status).toBe("passed");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("runs live child gates sequentially through a bounded runner hook", async () => {
    const command = buildRuntimeIntegrationGateCommand(
      {
        gateName: "upgrade",
        live: true,
        resultPath: null,
        skipCompose: true,
        skipInfra: true,
      },
      {},
    );
    const calls: string[] = [];
    const code = await runRuntimeIntegrationGate(command, {
      runner: (executable: string, args: string[]) => {
        calls.push([executable.endsWith("node.exe") ? "node" : executable, ...args].join(" "));
        return 0;
      },
    });

    expect(code).toBe(0);
    expect(calls).toEqual([
      expect.stringContaining("scripts/deep-research-live-adapters.mjs --profile workbench-host"),
      expect.stringContaining("scripts/memory-persistence-smoke.mjs --profile test-host"),
      expect.stringContaining("scripts/runtime-daemon-composition-smoke.mjs --gate runtime-daemon:composition-smoke --profile workbench-host"),
      expect.stringContaining("scripts/kirakira-workbench-smoke.mjs --profile workbench-host --gate presentation"),
    ]);
    expect(calls[1]).toContain("--skip-compose");
    expect(calls[3]).toContain("--skip-infra");
  });

  it("supports injected gate adapters without changing the aggregate flow", () => {
    const command = buildRuntimeIntegrationGateCommand(
      {
        gateName: "custom",
        resultPath: null,
      },
      {},
      {
        config: {
          integrationGates: {
            custom: {
              gates: [
                {
                  id: "custom:gate",
                  kind: "custom-kind",
                  profile: "custom-profile",
                },
              ],
            },
          },
        },
        adapters: {
          "custom-kind": (entry: { id: string; profile: string }, options: { live: boolean }) => ({
            command: {
              gate: entry.id,
              profile: entry.profile,
              live: options.live,
              status: "passed",
              checks: ["custom:check"],
              evidence: {},
            },
            commandArgs: ["node", ["scripts/custom-gate.mjs", "--live"]],
            env: { KIRAKIRA_RUNTIME_PROFILE: entry.profile },
          }),
        },
      },
    );

    expect(command.status).toBe("passed");
    expect(command.steps).toEqual([
      expect.objectContaining({
        id: "custom:gate",
        kind: "custom-kind",
        profile: "custom-profile",
        gate: "custom:gate",
        checks: ["custom:check"],
      }),
    ]);
  });

  it("rejects unknown integration gates before running child commands", () => {
    expect(() =>
      buildRuntimeIntegrationGateCommand({ gateName: "missing", resultPath: null }, {}),
    ).toThrow(/Unknown runtime integration gate/u);
  });
});

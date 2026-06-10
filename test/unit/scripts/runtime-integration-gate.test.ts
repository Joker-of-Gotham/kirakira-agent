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
import { loadRuntimeProfiles } from "../../../scripts/runtime-profile.mjs";

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
      ["presentation:hydrated-visual-qa", "presentation-hydrated-visual-qa", "workbench-host"],
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
        "presentation:viewport-screenshots",
        "presentation:core-workbench-views",
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
      "node scripts/deep-research-live-adapters.mjs --gate deep-research:live-adapters --profile workbench-host --timeout-ms 12000 --live",
      "node scripts/memory-persistence-smoke.mjs --profile test-host --timeout-ms 12000 --live",
      "node scripts/runtime-daemon-composition-smoke.mjs --gate runtime-daemon:composition-smoke --profile workbench-host --timeout-ms 12000 --live",
      "node scripts/kirakira-workbench-smoke.mjs --profile workbench-host --gate presentation --timeout-ms 12000 --live",
      "node scripts/presentation-hydrated-visual-qa.mjs --gate presentation-hydrated-visual-qa --profile workbench-host --timeout-ms 12000 --skip-infra --skip-daemon --live",
    ]);
  });

  it("builds the slow full-lifecycle gate without renderer-only skips", () => {
    const command = buildRuntimeIntegrationGateCommand(
      { gateName: "full-lifecycle", resultPath: null, timeoutMs: 240_000 },
      {},
    );

    expect(command.gate).toBe("full-lifecycle");
    expect(command.steps.at(-1)).toMatchObject({
      id: "presentation:hydrated-visual-qa",
      kind: "presentation-hydrated-visual-qa",
      profile: "workbench-host",
      command: "node scripts/presentation-hydrated-visual-qa.mjs --gate presentation-hydrated-visual-qa-full-lifecycle --profile workbench-host --timeout-ms 240000 --live",
    });
    expect(command.steps.at(-1)?.command).not.toContain("--skip-infra");
    expect(command.steps.at(-1)?.command).not.toContain("--skip-daemon");
    expect(command.steps[1]?.cleanup).toEqual([
      {
        display: "docker compose -p kirakira-agent-test -f docker-compose.test.yml down --remove-orphans",
        required: true,
      },
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
          expect.objectContaining({ id: "presentation:hydrated-visual-qa" }),
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
      expect.stringContaining("scripts/deep-research-live-adapters.mjs --gate deep-research:live-adapters --profile workbench-host"),
      expect.stringContaining("scripts/memory-persistence-smoke.mjs --profile test-host"),
      expect.stringContaining("scripts/runtime-daemon-composition-smoke.mjs --gate runtime-daemon:composition-smoke --profile workbench-host"),
      expect.stringContaining("scripts/kirakira-workbench-smoke.mjs --profile workbench-host --gate presentation"),
      expect.stringContaining("scripts/presentation-hydrated-visual-qa.mjs --gate presentation-hydrated-visual-qa --profile workbench-host"),
    ]);
    expect(calls[1]).toContain("--skip-compose");
    expect(calls[3]).toContain("--skip-infra");
    expect(calls[4]).toContain("--skip-infra");
    expect(calls[4]).toContain("--skip-daemon");
  });

  it("runs full-lifecycle cleanup after compose-backed memory persistence", async () => {
    const command = buildRuntimeIntegrationGateCommand(
      {
        gateName: "full-lifecycle",
        live: true,
        resultPath: null,
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
    expect(calls[1]).toContain("scripts/memory-persistence-smoke.mjs --profile test-host");
    expect(calls[2]).toBe(
      "docker compose -p kirakira-agent-test -f docker-compose.test.yml down --remove-orphans",
    );
    expect(calls[3]).toContain("scripts/runtime-daemon-composition-smoke.mjs");
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

  it("passes injected profile config through to deep research child gates", () => {
    const config = {
      ...loadRuntimeProfiles(),
      deepResearchLiveAdapterGates: {
        "deep-research:custom-adapters": {
          profile: "workbench-host",
          liveEnv: "KIRAKIRA_CUSTOM_DEEP_RESEARCH_LIVE",
          passedEnv: "KIRAKIRA_CUSTOM_DEEP_RESEARCH_PASSED",
          resultPath: "docs/upgrade/gates/custom-deep-research-live-adapters.json",
          suites: [
            {
              id: "custom",
              source: "packages/deep-research/src/file.ts",
              checks: ["deep-research:custom-source"],
              unitTests: ["test/unit/deep-research/file.test.ts"],
              liveTests: ["test/smoke/deep-research/live-adapters-smoke.test.ts"],
            },
          ],
        },
      },
      integrationGates: {
        customDeepResearch: {
          gates: [
            {
              id: "deep-research:custom-adapters",
              kind: "deep-research-live-adapters",
              profile: "workbench-host",
              gate: "deep-research:custom-adapters",
            },
          ],
        },
      },
    };

    const command = buildRuntimeIntegrationGateCommand(
      { gateName: "customDeepResearch", resultPath: null },
      {},
      { config },
    );

    expect(command.checks).toEqual(["deep-research:custom-source"]);
    expect(command.steps[0]).toMatchObject({
      gate: "deep-research:custom-adapters",
      checks: ["deep-research:custom-source"],
      command: "node scripts/deep-research-live-adapters.mjs --gate deep-research:custom-adapters --profile workbench-host --timeout-ms 180000 --live",
      tests: ["test/smoke/deep-research/live-adapters-smoke.test.ts"],
    });
  });

  it("rejects unknown integration gates before running child commands", () => {
    expect(() =>
      buildRuntimeIntegrationGateCommand({ gateName: "missing", resultPath: null }, {}),
    ).toThrow(/Unknown runtime integration gate/u);
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import {
  buildRuntimeDaemonCompositionSmokeCommand,
  normalizeRuntimeDaemonCompositionSmokeArgs,
  runRuntimeDaemonCompositionSmoke,
  writeRuntimeDaemonCompositionSmokeResult,
} from "../../../scripts/runtime-daemon-composition-smoke.mjs";

describe("runtime daemon composition smoke gate", () => {
  it("parses the profile-owned composition command shape", () => {
    expect(
      normalizeRuntimeDaemonCompositionSmokeArgs([
        "--gate",
        "runtime-daemon:composition-smoke",
        "--profile",
        "workbench-host",
        "--live",
        "--timeout-ms",
        "120000",
      ]),
    ).toMatchObject({
      gateName: "runtime-daemon:composition-smoke",
      profileName: "workbench-host",
      live: true,
      timeoutMs: 120_000,
    });
  });

  it("builds the smoke contract from runtime profile configuration", () => {
    const command = buildRuntimeDaemonCompositionSmokeCommand({
      gateName: "runtime-daemon:composition-smoke",
      resultPath: null,
    }, {});

    expect(command).toMatchObject({
      gate: "runtime-daemon:composition-smoke",
      profile: "workbench-host",
      gateSource: "runtime-profile.daemonCompositionGates",
      live: false,
      status: "skipped",
    });
    expect(command.checks).toEqual([
      "runtime-daemon:kernelbridge-single-run",
      "runtime-daemon:subagent-topology-events",
      "runtime-daemon:deep-research-mcp-source",
      "runtime-daemon:mcp-policy-trust-audit-otel",
      "runtime-daemon:memory-recall-events",
      "runtime-daemon:checkpoint-persistence",
      "runtime-daemon:profile-readiness-manifest",
    ]);
    expect(command.liveGate.command.display).toBe(
      "pnpm vitest run test/smoke/runtime-daemon/composition-smoke.test.ts",
    );
    expect(JSON.stringify(command)).not.toContain("5173");
  });

  it("uses the gate live env opt-in", () => {
    const command = buildRuntimeDaemonCompositionSmokeCommand(
      {
        gateName: "runtime-daemon:composition-smoke",
        resultPath: null,
      },
      { KIRAKIRA_RUNTIME_DAEMON_COMPOSITION_SMOKE_LIVE: "1" },
    );

    expect(command.live).toBe(true);
    expect(command.status).toBe("ready");
    expect(command.liveGate.status).toBe("pending");
  });

  it("writes and replays durable smoke evidence", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "kirakira-daemon-composition-"));
    const resultPath = join(tempRoot, "runtime-daemon-composition-smoke.json");
    try {
      const command = buildRuntimeDaemonCompositionSmokeCommand({
        gateName: "runtime-daemon:composition-smoke",
        resultPath,
      }, {});
      const result = writeRuntimeDaemonCompositionSmokeResult(command, resultPath);
      const replay = buildRuntimeDaemonCompositionSmokeCommand({
        gateName: "runtime-daemon:composition-smoke",
        resultPath,
      }, {});

      expect(result).toMatchObject({
        schemaVersion: 1,
        gate: "runtime-daemon:composition-smoke",
        profile: "workbench-host",
        status: "passed",
      });
      expect(replay).toMatchObject({
        status: "passed",
        evidence: {
          resultStatus: "passed",
          resultMatches: true,
        },
      });
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("runs the smoke test through an injectable bounded runner", () => {
    const command = buildRuntimeDaemonCompositionSmokeCommand(
      {
        gateName: "runtime-daemon:composition-smoke",
        resultPath: null,
        live: true,
      },
      {},
    );
    const calls: string[] = [];
    const code = runRuntimeDaemonCompositionSmoke(command, {
      runner: (executable: string, args: string[]) => {
        calls.push([executable, ...args].join(" "));
        return 0;
      },
    });

    expect(code).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("vitest run test/smoke/runtime-daemon/composition-smoke.test.ts");
  });

  it("rejects unknown composition gates", () => {
    expect(() =>
      buildRuntimeDaemonCompositionSmokeCommand({ gateName: "missing", resultPath: null }, {}),
    ).toThrow(/Unknown runtime daemon composition gate/u);
  });
});

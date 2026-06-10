import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import {
  buildRuntimeFullLifecycleGateCommand,
  normalizeRuntimeFullLifecycleGateArgs,
  runRuntimeFullLifecycleGate,
  writeRuntimeFullLifecycleGateResult,
} from "../../../scripts/runtime-full-lifecycle-gate.mjs";

describe("runtime full lifecycle gate", () => {
  it("parses the profile-owned full lifecycle command shape", () => {
    expect(
      normalizeRuntimeFullLifecycleGateArgs([
        "--gate",
        "runtime-full-lifecycle",
        "--profile",
        "workbench-host",
        "--timeout-ms",
        "240000",
        "--skip-docker-preflight",
        "--live",
      ]),
    ).toMatchObject({
      gateName: "runtime-full-lifecycle",
      profileName: "workbench-host",
      timeoutMs: 240_000,
      skipDockerPreflight: true,
      live: true,
    });
  });

  it("builds a skipped lifecycle contract from runtime profile configuration", () => {
    const command = buildRuntimeFullLifecycleGateCommand(
      { gateName: "runtime-full-lifecycle", resultPath: null },
      {},
    );

    expect(command).toMatchObject({
      gate: "runtime-full-lifecycle",
      gateSource: "runtime-profile.runtimeLifecycleGates",
      profile: "workbench-host",
      live: false,
      status: "skipped",
      integrationGate: "full-lifecycle",
      requiredPreflights: ["docker compose"],
      lifecycleSteps: expect.arrayContaining([
        "docker-compose:up-wait",
        "workbench:web-gateway",
        "workbench:desktop-electron",
        "presentation:hydrated-visual-qa",
      ]),
      checks: expect.arrayContaining([
        "runtime-lifecycle:docker-compose-ready",
        "runtime-lifecycle:hydrated-visual-qa",
      ]),
    });
    expect(command.compose?.args).toEqual(expect.arrayContaining(["up", "--wait"]));
    expect(command.targets).toMatchObject({
      "daemon:browser-gateway": "http://127.0.0.1:17373/healthz",
      "presentation:web": "http://127.0.0.1:5183/",
      "presentation:desktop": "http://127.0.0.1:5174/",
    });
    expect(command.integration.steps.at(-1)?.command).toBe(
      "node scripts/presentation-hydrated-visual-qa.mjs --gate presentation-hydrated-visual-qa --profile workbench-host --timeout-ms 240000 --live",
    );
    expect(JSON.stringify(command)).not.toContain("5173");
  });

  it("writes blocked Docker preflight evidence without treating it as a pass", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "kirakira-full-lifecycle-blocked-"));
    const resultPath = join(tempRoot, "runtime-full-lifecycle-gate.json");
    try {
      const command = buildRuntimeFullLifecycleGateCommand(
        {
          gateName: "runtime-full-lifecycle",
          resultPath,
        },
        {},
      );
      const result = writeRuntimeFullLifecycleGateResult(command, {
        code: 1,
        preflight: {
          status: "failed",
          command: "docker compose version",
          detail: "Docker Desktop is not running",
        },
      }, resultPath);
      const replay = buildRuntimeFullLifecycleGateCommand(
        {
          gateName: "runtime-full-lifecycle",
          resultPath,
        },
        {},
      );

      expect(result).toMatchObject({
        gate: "runtime-full-lifecycle",
        profile: "workbench-host",
        status: "blocked",
        preflight: {
          status: "failed",
        },
      });
      expect(replay.status).toBe("skipped");
      expect(replay.evidence).toMatchObject({
        resultStatus: "blocked",
        resultMatches: false,
        preflightStatus: "failed",
      });
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("writes and replays pass evidence with lifecycle step identity", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "kirakira-full-lifecycle-pass-"));
    const resultPath = join(tempRoot, "runtime-full-lifecycle-gate.json");
    try {
      const command = buildRuntimeFullLifecycleGateCommand(
        {
          gateName: "runtime-full-lifecycle",
          resultPath,
        },
        {},
      );
      writeRuntimeFullLifecycleGateResult(command, {
        code: 0,
        preflight: {
          status: "passed",
          command: "docker compose version",
          detail: "Docker Compose version v2.0.0",
        },
      }, resultPath);
      const replay = buildRuntimeFullLifecycleGateCommand(
        {
          gateName: "runtime-full-lifecycle",
          resultPath,
        },
        {},
      );

      expect(replay.status).toBe("passed");
      expect(replay.evidence).toMatchObject({
        resultStatus: "passed",
        resultMatches: true,
        preflightStatus: "passed",
      });
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("stops before child gates when Docker preflight fails", async () => {
    const command = buildRuntimeFullLifecycleGateCommand(
      {
        gateName: "runtime-full-lifecycle",
        live: true,
        resultPath: null,
      },
      {},
    );
    const calls: string[] = [];
    const run = await runRuntimeFullLifecycleGate(command, {
      dockerPreflight: () => ({
        status: "failed",
        command: "docker compose version",
        detail: "Docker Desktop is not running",
      }),
      runner: (executable: string, args: string[]) => {
        calls.push([executable, ...args].join(" "));
        return 0;
      },
    });

    expect(run.code).toBe(1);
    expect(run.preflight.status).toBe("failed");
    expect(calls).toEqual([]);
  });
});

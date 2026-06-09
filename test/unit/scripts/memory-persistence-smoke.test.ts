import { describe, expect, it } from "vitest";

import {
  buildMemoryPersistenceSmokeCommand,
  normalizeMemoryPersistenceSmokeArgs,
} from "../../../scripts/memory-persistence-smoke.mjs";

describe("memory persistence smoke gate", () => {
  it("parses the opt-in live command shape", () => {
    expect(
      normalizeMemoryPersistenceSmokeArgs([
        "--profile",
        "test-host",
        "--live",
        "--skip-compose",
        "--timeout-ms",
        "120000",
      ]),
    ).toMatchObject({
      profileName: "test-host",
      live: true,
      skipCompose: true,
      timeoutMs: 120_000,
    });
  });

  it("builds a profile-gated plan without live mode by default", () => {
    const smoke = buildMemoryPersistenceSmokeCommand({ profileName: "test-host" }, {});

    expect(smoke.profile).toBe("test-host");
    expect(smoke.live).toBe(false);
    expect(smoke.status).toBe("skipped");
    expect(smoke.gate).toBe("memory-store:persistence");
    expect(smoke.checks).toEqual([
      "memory-store:checkpoint",
      "memory-store:retain-reflect",
    ]);
    expect(smoke.unitContract.tests).toEqual([
      "test/unit/runtime-daemon/memory-runtime-deps.test.ts",
      "test/unit/runtime/memory-test-host-env.test.ts",
    ]);
    expect(smoke.liveGate.tests).toEqual([
      "test/integration/memory/checkpoint-restore.test.ts",
      "test/integration/memory/retain-to-recall.test.ts",
    ]);
    expect(smoke.liveGate.status).toBe("skipped");
    expect(smoke.liveGate.compose?.args).toEqual([
      "compose",
      "-f",
      "docker-compose.test.yml",
      "up",
      "-d",
      "--wait",
      "postgres",
      "redis",
      "qdrant",
      "neo4j",
      "minio",
    ]);
    expect(smoke.targets["service:postgres"]).toMatchObject({
      type: "compose-service",
      service: "postgres",
      target: "postgres://127.0.0.1:5432/kirakira_test",
    });
    expect(JSON.stringify(smoke)).not.toContain("5173");
    expect(JSON.stringify(smoke)).not.toContain("kirakira_test:kirakira_test");
  });

  it("can mark the live gate externally passed for readiness reports", () => {
    const smoke = buildMemoryPersistenceSmokeCommand(
      { profileName: "test-host" },
      { KIRAKIRA_MEMORY_PERSISTENCE_SMOKE_PASSED: "1" },
    );

    expect(smoke.status).toBe("passed");
    expect(smoke.liveGate.status).toBe("passed");
  });
});

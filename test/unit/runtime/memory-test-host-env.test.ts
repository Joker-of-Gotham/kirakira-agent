import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadRuntimeProfiles,
  resolveRuntimeProfile,
} from "../../../scripts/runtime-profile.mjs";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");

describe("memory integration test host defaults", () => {
  it("keeps helper defaults aligned with the test-host profile", () => {
    const profile = resolveRuntimeProfile("test-host", loadRuntimeProfiles(), {});

    expect(profile.services?.postgres).toBe(
      "postgres://kirakira_test:kirakira_test@127.0.0.1:5432/kirakira_test",
    );
    expect(profile.services?.redis).toBe("redis://127.0.0.1:6379");
    expect(profile.services?.qdrant).toBe("http://127.0.0.1:6333");
    expect(profile.services?.neo4j).toBe("bolt://127.0.0.1:7687");
    expect(profile.services?.minio).toBe("http://127.0.0.1:9000");

    const memoryEnv = readFileSync(resolve(repoRoot, "test/helpers/memory-env.ts"), "utf8");
    expect(memoryEnv).not.toContain("@postgres:");
    expect(memoryEnv).not.toContain("@qdrant");
    expect(memoryEnv).not.toContain("@neo4j");
    expect(memoryEnv).not.toContain("@minio");
    expect(memoryEnv).toContain("127.0.0.1");
  });
});

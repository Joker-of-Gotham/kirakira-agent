import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadRuntimeProfiles,
  renderRuntimeEnv,
  resolveRuntimeProfile,
} from "../../../scripts/runtime-profile.mjs";

const ENV_KEYS = [
  "DATABASE_URL",
  "REDIS_URL",
  "QDRANT_URL",
  "NEO4J_URI",
  "S3_ENDPOINT",
  "S3_ENDPOINT_URL",
  "KIRAKIRA_NEO4J_USER",
  "KIRAKIRA_NEO4J_PASSWORD",
  "TEST_PG_URL",
  "TEST_REDIS_URL",
  "TEST_QDRANT_URL",
  "TEST_QDRANT_HOST",
  "TEST_QDRANT_PORT",
  "TEST_NEO4J_URI",
  "TEST_NEO4J_USER",
  "TEST_NEO4J_PASSWORD",
  "TEST_MINIO_ENDPOINT",
] as const;

const ORIGINAL_ENV = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const original = ORIGINAL_ENV.get(key);
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
}

async function loadMemoryEnv(env: Record<string, string | undefined> = {}) {
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) process.env[key] = value;
  }
  vi.resetModules();
  return import("../../helpers/memory-env.ts");
}

function endpointPort(value: string | undefined): number {
  expect(value).toBeTypeOf("string");
  return Number(new URL(value as string).port);
}

afterEach(() => {
  restoreEnv();
  vi.resetModules();
});

describe("memory integration test host defaults", () => {
  it("keeps helper fallback defaults aligned with the test-host profile", async () => {
    const profile = resolveRuntimeProfile("test-host", loadRuntimeProfiles(), {});
    const memoryEnv = await loadMemoryEnv();

    expect(profile.services?.postgres).toBe(
      "postgres://kirakira_test:kirakira_test@127.0.0.1:5432/kirakira_test",
    );
    expect(profile.services?.redis).toBe("redis://127.0.0.1:6379");
    expect(profile.services?.qdrant).toBe("http://127.0.0.1:6333");
    expect(profile.services?.neo4j).toBe("bolt://127.0.0.1:7687");
    expect(profile.services?.minio).toBe("http://127.0.0.1:9000");

    expect(memoryEnv.TEST_PG_URL).toBe(profile.services?.postgres);
    expect(memoryEnv.TEST_REDIS_URL).toBe(profile.services?.redis);
    expect(memoryEnv.TEST_QDRANT_HOST).toBe("127.0.0.1");
    expect(memoryEnv.TEST_QDRANT_PORT).toBe(endpointPort(profile.services?.qdrant));
    expect(memoryEnv.TEST_NEO4J_URI).toBe(profile.services?.neo4j);
    expect(memoryEnv.TEST_MINIO_ENDPOINT).toBe(profile.services?.minio);
  });

  it("prefers runtime profile env values over fallback defaults", async () => {
    const config = loadRuntimeProfiles();
    const profile = resolveRuntimeProfile("test-host", config, {
      KIRAKIRA_POSTGRES_PORT: "15432",
      KIRAKIRA_REDIS_PORT: "16379",
      KIRAKIRA_QDRANT_HTTP_PORT: "16333",
      KIRAKIRA_NEO4J_BOLT_PORT: "17687",
      KIRAKIRA_MINIO_API_PORT: "19000",
      KIRAKIRA_NEO4J_USER: "neo4j-runtime",
      KIRAKIRA_NEO4J_PASSWORD: "neo4j-secret",
    });
    const runtimeEnv = renderRuntimeEnv(profile);
    const memoryEnv = await loadMemoryEnv(runtimeEnv);

    expect(memoryEnv.TEST_PG_URL).toBe(profile.services?.postgres);
    expect(memoryEnv.TEST_REDIS_URL).toBe(profile.services?.redis);
    expect(memoryEnv.TEST_QDRANT_HOST).toBe("127.0.0.1");
    expect(memoryEnv.TEST_QDRANT_PORT).toBe(16333);
    expect(memoryEnv.TEST_NEO4J_URI).toBe(profile.services?.neo4j);
    expect(memoryEnv.TEST_NEO4J_USER).toBe(runtimeEnv.KIRAKIRA_NEO4J_USER);
    expect(memoryEnv.TEST_NEO4J_PASSWORD).toBe(runtimeEnv.KIRAKIRA_NEO4J_PASSWORD);
    expect(memoryEnv.TEST_MINIO_ENDPOINT).toBe(profile.services?.minio);
  });

  it("keeps explicit TEST overrides above runtime profile env", async () => {
    const profile = resolveRuntimeProfile("test-host", loadRuntimeProfiles(), {
      KIRAKIRA_REDIS_PORT: "16379",
      KIRAKIRA_QDRANT_HTTP_PORT: "16333",
    });
    const memoryEnv = await loadMemoryEnv({
      ...renderRuntimeEnv(profile),
      TEST_REDIS_URL: "redis://127.0.0.1:26379",
      TEST_QDRANT_HOST: "qdrant.override",
      TEST_QDRANT_PORT: "26333",
    });

    expect(memoryEnv.TEST_REDIS_URL).toBe("redis://127.0.0.1:26379");
    expect(memoryEnv.TEST_QDRANT_HOST).toBe("qdrant.override");
    expect(memoryEnv.TEST_QDRANT_PORT).toBe(26333);
  });
});

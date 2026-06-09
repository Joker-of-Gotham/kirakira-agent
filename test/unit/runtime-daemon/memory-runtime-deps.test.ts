import { describe, expect, it } from "vitest";
import type { MemoryBundle, RecallRequest, RetrievalTrace } from "../../../packages/memory-core/src/index.js";
import {
  createDaemonMemoryDependencies,
  memoryServiceConfigFromEnv,
  shouldCreateDaemonMemoryDependencies,
  type DaemonMemoryEnv,
} from "../../../packages/runtime-daemon/src/bridge/memory-runtime-deps.js";

const trace: RetrievalTrace = {
  traceId: "trace-memory-runtime",
  queryId: "query-memory-runtime",
  normalizedQuery: "runtime memory",
  routePlan: ["vector"],
  routes: [],
  fusionScores: [],
  rerankScores: [],
  budgetLevel: "L3",
  totalDurationMs: 0,
  createdAt: "2026-06-09T00:00:00.000Z",
};

const bundle: MemoryBundle = {
  id: "bundle-memory-runtime",
  queryId: "query-memory-runtime",
  context: {
    levels: {
      l0: { abstract: "memory runtime bundle", tokenCount: 4 },
    },
  },
  trace,
  recordIds: [],
  totalTokens: 4,
};

function env(overrides: DaemonMemoryEnv = {}): DaemonMemoryEnv {
  return {
    DATABASE_URL: "postgres://runtime:runtime@postgres:5432/runtime",
    REDIS_URL: "redis://redis:6379/0",
    QDRANT_URL: "http://qdrant:6333",
    NEO4J_URI: "bolt://neo4j:7687",
    KIRAKIRA_NEO4J_USER: "neo4j-runtime",
    KIRAKIRA_NEO4J_PASSWORD: "neo4j-secret",
    S3_ENDPOINT: "http://minio:9000",
    S3_ACCESS_KEY_ID: "minio-access",
    S3_SECRET_ACCESS_KEY: "minio-secret",
    ...overrides,
  };
}

describe("daemon memory runtime dependencies", () => {
  it("maps runtime service env into MemoryServiceConfig", () => {
    const config = memoryServiceConfigFromEnv(env());

    expect(config.postgres).toMatchObject({
      host: "postgres",
      port: 5432,
      database: "runtime",
      username: "runtime",
      password: "runtime",
    });
    expect(config.redis).toEqual({ url: "redis://redis:6379/0" });
    expect(config.vector).toMatchObject({
      backend: "qdrant",
      host: "qdrant",
      port: 6333,
    });
    expect(config.graph).toMatchObject({
      backend: "neo4j",
      uri: "bolt://neo4j:7687",
      username: "neo4j-runtime",
      password: "neo4j-secret",
    });
    expect(config.blob).toMatchObject({
      bucket: "kirakira-memory",
      endpoint: "http://minio:9000",
      forcePathStyle: true,
      credentials: {
        accessKeyId: "minio-access",
        secretAccessKey: "minio-secret",
      },
    });
  });

  it("lets memory-specific env override shared runtime env", () => {
    const config = memoryServiceConfigFromEnv(
      env({
        KIRAKIRA_MEMORY_POSTGRES_DSN: "postgres://memory:secret@memory-pg:15432/memory",
        KIRAKIRA_MEMORY_REDIS_URL: "redis://memory-redis:26379/1",
        KIRAKIRA_MEMORY_QDRANT_URL: "http://memory-qdrant:7333",
        KIRAKIRA_MEMORY_NEO4J_URI: "bolt://memory-neo4j:17687",
        KIRAKIRA_MEMORY_NEO4J_USER: "memory-user",
        KIRAKIRA_MEMORY_NEO4J_PASSWORD: "memory-password",
        KIRAKIRA_MEMORY_S3_ENDPOINT_URL: "http://memory-minio:19000",
        KIRAKIRA_MEMORY_S3_BUCKET: "memory-bucket",
      }),
    );

    expect(config.postgres).toMatchObject({
      host: "memory-pg",
      port: 15432,
      database: "memory",
      username: "memory",
      password: "secret",
    });
    expect(config.redis).toEqual({ url: "redis://memory-redis:26379/1" });
    expect(config.vector).toMatchObject({ host: "memory-qdrant", port: 7333 });
    expect(config.graph).toMatchObject({
      uri: "bolt://memory-neo4j:17687",
      username: "memory-user",
      password: "memory-password",
    });
    expect(config.blob).toMatchObject({
      bucket: "memory-bucket",
      endpoint: "http://memory-minio:19000",
    });
  });

  it("enables default memory only when deep research, profile services, and env agree", () => {
    const resolvedConfig = {
      agentToml: {
        workspace_name: "workspace",
        deep_research: { enabled: true },
      },
      runtimeState: {
        default_profile: "workbench-host",
        profiles: [
          {
            name: "workbench-host",
            mode: "host",
            services: [
              { name: "postgres" },
              { name: "redis" },
              { name: "minio" },
            ],
          },
        ],
      },
    } as const;

    expect(
      shouldCreateDaemonMemoryDependencies({
        workspaceRoot: "C:/workspace",
        env: env(),
        resolvedConfig,
        runtimeProfileName: "workbench-host",
      }),
    ).toBe(true);
    expect(
      shouldCreateDaemonMemoryDependencies({
        workspaceRoot: "C:/workspace",
        env: env({ KIRAKIRA_MEMORY_ENABLED: "0" }),
        resolvedConfig,
        runtimeProfileName: "workbench-host",
      }),
    ).toBe(false);
  });

  it("constructs the production service lazily on first recall", async () => {
    const recallCalls: RecallRequest[] = [];
    let factoryCalls = 0;
    let closed = false;
    const deps = createDaemonMemoryDependencies({
      workspaceRoot: "C:/workspace",
      env: env({ KIRAKIRA_MEMORY_ENABLED: "1" }),
      serviceFactory() {
        factoryCalls += 1;
        return {
          async recall(request) {
            recallCalls.push(request);
            return bundle;
          },
          async explainRetrieval() {
            return trace;
          },
          async close() {
            closed = true;
          },
        };
      },
    });

    expect(factoryCalls).toBe(0);
    await deps.researchSource?.service.recall({
      tenantId: "tenant",
      workspaceId: "workspace",
      query: "runtime memory",
    });
    expect(factoryCalls).toBe(1);
    expect(recallCalls).toHaveLength(1);
    await deps.close();
    expect(closed).toBe(true);
  });
});

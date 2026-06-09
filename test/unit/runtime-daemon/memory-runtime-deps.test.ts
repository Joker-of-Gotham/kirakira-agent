import { describe, expect, it } from "vitest";
import type {
  ResolvedConfig,
  ResolvedRuntimeMemoryState,
} from "../../../packages/core/src/index.js";
import type { MemoryBundle, RecallRequest, RetrievalTrace } from "../../../packages/memory-core/src/index.js";
import {
  createDaemonMemoryDependencies,
  memoryPostgresConfigFromEnv,
  memoryServiceConfigFromEnv,
  shouldCreateDaemonMemoryCheckpointRepository,
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

  it("uses resolved memory profile aliases and defaults before generic fallbacks", async () => {
    let capturedConfig: ReturnType<typeof memoryServiceConfigFromEnv> | undefined;
    const resolvedConfig = {
      agentToml: {
        workspace_name: "profiled-memory-workspace",
        deep_research: { enabled: true },
      },
      runtimeState: {
        default_profile: "profiled",
        profiles: [
          {
            name: "profiled",
            mode: "host",
            workspace_root: "C:/workspace",
            memory: {
              enabled: true,
              services: [
                { name: "postgres", url_env: "PROFILE_DATABASE_URL" },
                { name: "redis", url_env: "PROFILE_REDIS_URL" },
                { name: "qdrant", url_env: "PROFILE_QDRANT_URL" },
                { name: "neo4j", url_env: "PROFILE_NEO4J_URI" },
                { name: "minio", url_env: "PROFILE_S3_ENDPOINT" },
              ],
              vector: {
                backend: "qdrant",
                url_env: "PROFILE_QDRANT_URL",
                api_key_env: "PROFILE_QDRANT_API_KEY",
              },
              graph: {
                backend: "neo4j",
                uri_env: "PROFILE_NEO4J_URI",
                username_env: "PROFILE_NEO4J_USER",
                password_env: "PROFILE_NEO4J_PASSWORD",
              },
              blob: {
                backend: "s3",
                endpoint_env: "PROFILE_S3_ENDPOINT",
                bucket: "profile-memory",
                region: "ap-southeast-1",
                access_key_id_env: "PROFILE_S3_ACCESS_KEY_ID",
                secret_access_key_env: "PROFILE_S3_SECRET_ACCESS_KEY",
              },
              embedding: {
                model: "profile-embedding",
                api_key_env: "PROFILE_EMBEDDING_API_KEY",
                base_url_env: "PROFILE_EMBEDDING_BASE_URL",
              },
              recall: {
                token_budget: 2048,
                limit: 5,
                level: "L2",
              },
            },
          },
        ],
      },
    } as Pick<ResolvedConfig, "agentToml" | "runtimeState">;
    const deps = createDaemonMemoryDependencies({
      workspaceRoot: "C:/workspace",
      resolvedConfig,
      runtimeProfileName: "profiled",
      env: {
        DATABASE_URL: "postgres://generic:generic@localhost:5432/generic",
        REDIS_URL: "redis://localhost:6379/0",
        QDRANT_URL: "http://localhost:6333",
        NEO4J_URI: "bolt://localhost:7687",
        KIRAKIRA_NEO4J_USER: "generic-neo4j",
        KIRAKIRA_NEO4J_PASSWORD: "generic-password",
        PROFILE_DATABASE_URL: "postgres://profile:secret@profile-pg:15432/profile",
        PROFILE_REDIS_URL: "redis://profile-redis:16379/2",
        PROFILE_QDRANT_URL: "http://profile-qdrant:7333",
        PROFILE_QDRANT_API_KEY: "profile-qdrant-key",
        PROFILE_NEO4J_URI: "bolt://profile-neo4j:17687",
        PROFILE_NEO4J_USER: "profile-neo4j",
        PROFILE_NEO4J_PASSWORD: "profile-neo4j-secret",
        PROFILE_S3_ENDPOINT: "http://profile-minio:19000",
        PROFILE_S3_ACCESS_KEY_ID: "profile-access",
        PROFILE_S3_SECRET_ACCESS_KEY: "profile-secret",
        PROFILE_EMBEDDING_API_KEY: "profile-embedding-key",
        PROFILE_EMBEDDING_BASE_URL: "http://profile-embeddings",
      },
      serviceFactory(config) {
        capturedConfig = config;
        return {
          async recall() {
            return bundle;
          },
          async explainRetrieval() {
            return trace;
          },
        };
      },
    });

    await deps.researchSource?.service.recall({
      tenantId: "tenant",
      workspaceId: "workspace",
      query: "runtime memory",
    });

    expect(capturedConfig?.postgres).toMatchObject({
      host: "profile-pg",
      port: 15432,
      database: "profile",
      username: "profile",
      password: "secret",
    });
    expect(capturedConfig?.redis).toEqual({ url: "redis://profile-redis:16379/2" });
    expect(capturedConfig?.vector).toMatchObject({
      backend: "qdrant",
      host: "profile-qdrant",
      port: 7333,
      apiKey: "profile-qdrant-key",
    });
    expect(capturedConfig?.graph).toMatchObject({
      backend: "neo4j",
      uri: "bolt://profile-neo4j:17687",
      username: "profile-neo4j",
      password: "profile-neo4j-secret",
    });
    expect(capturedConfig?.blob).toMatchObject({
      bucket: "profile-memory",
      region: "ap-southeast-1",
      endpoint: "http://profile-minio:19000",
      credentials: {
        accessKeyId: "profile-access",
        secretAccessKey: "profile-secret",
      },
    });
    expect(capturedConfig?.embedding).toMatchObject({
      model: "profile-embedding",
      apiKey: "profile-embedding-key",
      baseUrl: "http://profile-embeddings",
    });
    expect(JSON.stringify(capturedConfig)).not.toContain("localhost");
    expect(capturedConfig?.recall).toMatchObject({
      defaultTokenBudget: 2048,
      defaultLevel: "L2",
    });
    expect(deps.researchSource).toMatchObject({
      tokenBudget: 2048,
      limit: 5,
      level: "L2",
    });
  });

  it("does not synthesize localhost defaults for declared resolved profile memory services", () => {
    const memory = {
      enabled: true,
      services: [
        { name: "postgres", url_env: "PROFILE_DATABASE_URL" },
        { name: "redis", url_env: "PROFILE_REDIS_URL" },
        { name: "qdrant", url_env: "PROFILE_QDRANT_URL" },
        { name: "neo4j", url_env: "PROFILE_NEO4J_URI" },
      ],
      vector: {
        backend: "qdrant",
        url_env: "PROFILE_QDRANT_URL",
      },
      graph: {
        backend: "neo4j",
        uri_env: "PROFILE_NEO4J_URI",
        username_env: "PROFILE_NEO4J_USER",
        password_env: "PROFILE_NEO4J_PASSWORD",
      },
    } satisfies ResolvedRuntimeMemoryState;

    expect(() => memoryServiceConfigFromEnv({}, memory)).toThrow(
      /Postgres DSN.*PROFILE_DATABASE_URL/,
    );
    expect(() =>
      memoryServiceConfigFromEnv(
        { PROFILE_DATABASE_URL: "postgres://profile:secret@profile-pg:15432/profile" },
        memory,
      ),
    ).toThrow(/Redis URL.*PROFILE_REDIS_URL/);
    expect(() =>
      memoryServiceConfigFromEnv(
        {
          PROFILE_DATABASE_URL: "postgres://profile:secret@profile-pg:15432/profile",
          PROFILE_REDIS_URL: "redis://profile-redis:16379/2",
        },
        memory,
      ),
    ).toThrow(/Neo4j URI.*PROFILE_NEO4J_URI/);
    expect(() =>
      memoryServiceConfigFromEnv(
        {
          PROFILE_DATABASE_URL: "postgres://profile:secret@profile-pg:15432/profile",
          PROFILE_REDIS_URL: "redis://profile-redis:16379/2",
          PROFILE_NEO4J_URI: "bolt://profile-neo4j:17687",
        },
        memory,
      ),
    ).toThrow(/Neo4j username.*PROFILE_NEO4J_USER/);
    expect(() =>
      memoryServiceConfigFromEnv(
        {
          PROFILE_DATABASE_URL: "postgres://profile:secret@profile-pg:15432/profile",
          PROFILE_REDIS_URL: "redis://profile-redis:16379/2",
          PROFILE_NEO4J_URI: "bolt://profile-neo4j:17687",
          PROFILE_NEO4J_USER: "profile-neo4j",
        },
        memory,
      ),
    ).toThrow(/Neo4j password.*PROFILE_NEO4J_PASSWORD/);
    expect(() =>
      memoryServiceConfigFromEnv(
        {
          PROFILE_DATABASE_URL: "postgres://profile:secret@profile-pg:15432/profile",
          PROFILE_REDIS_URL: "redis://profile-redis:16379/2",
          PROFILE_NEO4J_URI: "bolt://profile-neo4j:17687",
          PROFILE_NEO4J_USER: "profile-neo4j",
          PROFILE_NEO4J_PASSWORD: "profile-neo4j-secret",
        },
        memory,
      ),
    ).toThrow(/Qdrant URL or host.*PROFILE_QDRANT_URL/);

    const config = memoryServiceConfigFromEnv(
      {
        PROFILE_DATABASE_URL: "postgres://profile:secret@profile-pg:15432/profile",
        PROFILE_REDIS_URL: "redis://profile-redis:16379/2",
        PROFILE_QDRANT_URL: "http://profile-qdrant:7333",
        PROFILE_NEO4J_URI: "bolt://profile-neo4j:17687",
        PROFILE_NEO4J_USER: "profile-neo4j",
        PROFILE_NEO4J_PASSWORD: "profile-neo4j-secret",
      },
      memory,
    );

    expect(config).toMatchObject({
      postgres: { host: "profile-pg" },
      redis: { url: "redis://profile-redis:16379/2" },
      vector: { backend: "qdrant", host: "profile-qdrant", port: 7333 },
      graph: {
        backend: "neo4j",
        uri: "bolt://profile-neo4j:17687",
        username: "profile-neo4j",
        password: "profile-neo4j-secret",
      },
    });
    expect(JSON.stringify(config)).not.toContain("localhost");
  });

  it("selects a checkpoint repository from the resolved memory Postgres profile without enabling recall", async () => {
    let capturedConfig: ReturnType<typeof memoryServiceConfigFromEnv> | undefined;
    let closed = false;
    const resolvedConfig = {
      agentToml: {
        workspace_name: "checkpoint-workspace",
        deep_research: { enabled: false },
      },
      runtimeState: {
        default_profile: "profiled",
        profiles: [
          {
            name: "profiled",
            mode: "host",
            memory: {
              enabled: true,
              services: [{ name: "postgres", url_env: "PROFILE_DATABASE_URL" }],
            },
          },
        ],
      },
    } as Pick<ResolvedConfig, "agentToml" | "runtimeState">;

    expect(
      shouldCreateDaemonMemoryDependencies({
        workspaceRoot: "C:/workspace",
        resolvedConfig,
        runtimeProfileName: "profiled",
        env: {
          PROFILE_DATABASE_URL: "postgres://profile:secret@profile-pg:15432/profile",
        },
      }),
    ).toBe(false);
    expect(
      shouldCreateDaemonMemoryCheckpointRepository({
        workspaceRoot: "C:/workspace",
        resolvedConfig,
        runtimeProfileName: "profiled",
        env: {
          PROFILE_DATABASE_URL: "postgres://profile:secret@profile-pg:15432/profile",
        },
      }),
    ).toBe(true);

    const deps = createDaemonMemoryDependencies({
      workspaceRoot: "C:/workspace",
      resolvedConfig,
      runtimeProfileName: "profiled",
      env: {
        PROFILE_DATABASE_URL: "postgres://profile:secret@profile-pg:15432/profile",
      },
      checkpointRepositoryFactory(config) {
        capturedConfig = config;
        return {
          async save() {},
          async load() {
            return undefined;
          },
          async delete() {},
          async close() {
            closed = true;
          },
        };
      },
    });

    expect(deps.researchSource).toBeUndefined();
    expect(deps.checkpointRepository).toBeDefined();
    expect(capturedConfig?.postgres).toMatchObject({
      host: "profile-pg",
      port: 15432,
      database: "profile",
      username: "profile",
      password: "secret",
    });
    expect(memoryPostgresConfigFromEnv({})).toBeUndefined();
    await deps.close();
    expect(closed).toBe(true);
  });

  it("does not fall back to localhost for the default checkpoint repository", () => {
    const resolvedConfig = {
      agentToml: {
        workspace_name: "checkpoint-workspace",
        deep_research: { enabled: false },
      },
      runtimeState: {
        default_profile: "profiled",
        profiles: [
          {
            name: "profiled",
            mode: "host",
            memory: {
              enabled: true,
              services: [{ name: "postgres" }],
            },
          },
        ],
      },
    } as Pick<ResolvedConfig, "agentToml" | "runtimeState">;

    expect(
      shouldCreateDaemonMemoryCheckpointRepository({
        workspaceRoot: "C:/workspace",
        resolvedConfig,
        runtimeProfileName: "profiled",
        env: {},
      }),
    ).toBe(false);
    expect(
      shouldCreateDaemonMemoryCheckpointRepository({
        workspaceRoot: "C:/workspace",
        resolvedConfig,
        runtimeProfileName: "profiled",
        env: { KIRAKIRA_MEMORY_CHECKPOINTS_ENABLED: "1" },
      }),
    ).toBe(true);
    expect(() =>
      createDaemonMemoryDependencies({
        workspaceRoot: "C:/workspace",
        resolvedConfig,
        runtimeProfileName: "profiled",
        env: { KIRAKIRA_MEMORY_CHECKPOINTS_ENABLED: "1" },
      }),
    ).toThrow(/requires a Postgres DSN/);
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

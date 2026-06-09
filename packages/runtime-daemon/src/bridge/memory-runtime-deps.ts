import type { ResolvedConfig, ResolvedRuntimeMemoryState } from "@kirakira/core";
import type { MemoryRecallPort } from "@kirakira/deep-research";
import {
  MemoryServiceImpl,
  type MemoryServiceConfig,
} from "@kirakira/memory-service";

import type { DaemonMemoryResearchSourceOptions } from "./deep-research.js";
import { activeRuntimeProfile } from "./mcp-runtime-deps.js";

export type DaemonMemoryEnv = Record<string, string | undefined>;

export type DaemonMemoryService = MemoryRecallPort & {
  close?: () => Promise<void> | void;
};

export interface DaemonMemoryDependencyOptions {
  workspaceRoot: string;
  env?: DaemonMemoryEnv;
  resolvedConfig?: Pick<ResolvedConfig, "agentToml" | "runtimeState">;
  runtimeProfileName?: string;
  service?: DaemonMemoryService;
  serviceFactory?: (config: MemoryServiceConfig) => DaemonMemoryService;
}

export interface DaemonMemoryDependencies {
  researchSource?: DaemonMemoryResearchSourceOptions;
  config?: MemoryServiceConfig;
  close(): Promise<void>;
}

const MEMORY_SERVICE_NAMES = new Set(["postgres", "redis", "qdrant", "neo4j", "minio"]);
const MEMORY_CONTEXT_LEVELS = new Set(["L0", "L1", "L2", "L3"]);
const DEFAULT_MEMORY_LEVEL: NonNullable<DaemonMemoryResearchSourceOptions["level"]> = "L3";

function envFirst(env: DaemonMemoryEnv, ...keys: Array<string | undefined>): string | undefined {
  for (const key of keys) {
    if (!key) continue;
    const value = env[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function envFlag(env: DaemonMemoryEnv, key: string): boolean | undefined {
  const value = env[key]?.trim().toLowerCase();
  if (!value) return undefined;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return undefined;
}

function envNumber(env: DaemonMemoryEnv, ...keys: Array<string | undefined>): number | undefined {
  const value = envFirst(env, ...keys);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function memoryContextLevel(
  value: string | undefined,
): DaemonMemoryResearchSourceOptions["level"] | undefined {
  return value && MEMORY_CONTEXT_LEVELS.has(value)
    ? value as NonNullable<DaemonMemoryResearchSourceOptions["level"]>
    : undefined;
}

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function postgresConfigFromDsn(dsn: string): MemoryServiceConfig["postgres"] {
  const parsed = new URL(dsn);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, "")) || "kirakira";
  const sslmode = parsed.searchParams.get("sslmode");
  return {
    host: parsed.hostname,
    port: parsePort(parsed.port, parsed.protocol === "postgresql:" || parsed.protocol === "postgres:" ? 5432 : 5432),
    database,
    username: decodeURIComponent(parsed.username || "postgres"),
    password: decodeURIComponent(parsed.password || ""),
    ssl: sslmode === "require" ? true : false,
  };
}

function endpointHostPort(
  value: string | undefined,
  fallbackHost: string,
  fallbackPort: number,
): { host: string; port: number } {
  if (!value) return { host: fallbackHost, port: fallbackPort };
  const parsed = new URL(value);
  return {
    host: parsed.hostname || fallbackHost,
    port: parsed.port ? parsePort(parsed.port, fallbackPort) : fallbackPort,
  };
}

function activeRuntimeMemory(
  options: Pick<DaemonMemoryDependencyOptions, "resolvedConfig" | "runtimeProfileName">,
): ResolvedRuntimeMemoryState | undefined {
  return activeRuntimeProfile(options.resolvedConfig, options.runtimeProfileName)?.memory;
}

function memoryServiceEnv(
  memory: ResolvedRuntimeMemoryState | undefined,
  name: string,
): string | undefined {
  return memory?.services?.find((service) => service.name === name)?.url_env;
}

function memoryProfileHasBackingServices(
  options: Pick<DaemonMemoryDependencyOptions, "resolvedConfig" | "runtimeProfileName">,
): boolean {
  const profile = activeRuntimeProfile(options.resolvedConfig, options.runtimeProfileName);
  const memory = profile?.memory;
  if (memory?.enabled === false) return false;
  const serviceNames = new Set(
    (memory?.services ?? profile?.services ?? []).map((service) => service.name),
  );
  return [...MEMORY_SERVICE_NAMES].some((name) => serviceNames.has(name));
}

function hasRuntimeMemoryEnv(
  env: DaemonMemoryEnv,
  memory: ResolvedRuntimeMemoryState | undefined,
): boolean {
  return Boolean(
    envFirst(env, "KIRAKIRA_MEMORY_POSTGRES_DSN", memoryServiceEnv(memory, "postgres"), "DATABASE_URL") &&
      envFirst(env, "KIRAKIRA_MEMORY_REDIS_URL", memoryServiceEnv(memory, "redis"), "REDIS_URL") &&
      envFirst(
        env,
        "KIRAKIRA_MEMORY_S3_ENDPOINT_URL",
        memory?.blob?.endpoint_env,
        memoryServiceEnv(memory, "minio"),
        "S3_ENDPOINT",
        "S3_ENDPOINT_URL",
      ),
  );
}

export function shouldCreateDaemonMemoryDependencies(
  options: DaemonMemoryDependencyOptions,
): boolean {
  const env = options.env ?? process.env;
  const enabled = envFlag(env, "KIRAKIRA_MEMORY_ENABLED");
  const memory = activeRuntimeMemory(options);
  if (enabled === false) return false;
  if (memory?.enabled === false) return false;
  if (options.service) return true;
  if (enabled === true) return true;
  return Boolean(
    options.resolvedConfig?.agentToml.deep_research?.enabled &&
      memoryProfileHasBackingServices(options) &&
      hasRuntimeMemoryEnv(env, memory),
  );
}

export function memoryServiceConfigFromEnv(
  env: DaemonMemoryEnv = process.env,
  memory?: ResolvedRuntimeMemoryState,
): MemoryServiceConfig {
  const postgresDsn =
    envFirst(env, "KIRAKIRA_MEMORY_POSTGRES_DSN", memoryServiceEnv(memory, "postgres"), "DATABASE_URL") ??
    "postgresql://localhost:5432/kirakira";
  const redisUrl =
    envFirst(env, "KIRAKIRA_MEMORY_REDIS_URL", memoryServiceEnv(memory, "redis"), "REDIS_URL") ?? "redis://localhost:6379/0";
  const qdrantUrl = envFirst(
    env,
    "KIRAKIRA_MEMORY_QDRANT_URL",
    memory?.vector?.url_env,
    memoryServiceEnv(memory, "qdrant"),
    "QDRANT_URL",
  );
  const vectorBackend = envFirst(env, "KIRAKIRA_MEMORY_VECTOR_BACKEND") ?? memory?.vector?.backend;
  const graphBackend = envFirst(env, "KIRAKIRA_MEMORY_GRAPH_BACKEND") ?? memory?.graph?.backend;
  const neo4jUri =
    envFirst(
      env,
      "KIRAKIRA_MEMORY_NEO4J_URI",
      memory?.graph?.uri_env,
      memoryServiceEnv(memory, "neo4j"),
      "NEO4J_URI",
    ) ?? "bolt://localhost:7687";
  const s3Endpoint = envFirst(
    env,
    "KIRAKIRA_MEMORY_S3_ENDPOINT_URL",
    memory?.blob?.endpoint_env,
    memoryServiceEnv(memory, "minio"),
    "S3_ENDPOINT",
    "S3_ENDPOINT_URL",
  );
  const accessKeyId = envFirst(
    env,
    "KIRAKIRA_MEMORY_AWS_ACCESS_KEY_ID",
    memory?.blob?.access_key_id_env,
    "S3_ACCESS_KEY_ID",
    "AWS_ACCESS_KEY_ID",
  );
  const secretAccessKey = envFirst(
    env,
    "KIRAKIRA_MEMORY_AWS_SECRET_ACCESS_KEY",
    memory?.blob?.secret_access_key_env,
    "S3_SECRET_ACCESS_KEY",
    "AWS_SECRET_ACCESS_KEY",
  );
  const qdrant = endpointHostPort(
    qdrantUrl,
    envFirst(env, "KIRAKIRA_MEMORY_QDRANT_HOST", memory?.vector?.host_env) ?? "localhost",
    parsePort(envFirst(env, "KIRAKIRA_MEMORY_QDRANT_PORT", memory?.vector?.port_env), 6333),
  );

  return {
    postgres: postgresConfigFromDsn(postgresDsn),
    redis: { url: redisUrl },
    vector:
      vectorBackend === "pgvector" || (!qdrantUrl && vectorBackend !== "qdrant")
        ? { backend: "pgvector" }
        : {
            backend: "qdrant",
            host: qdrant.host,
            port: qdrant.port,
            apiKey: envFirst(env, "KIRAKIRA_MEMORY_QDRANT_API_KEY", memory?.vector?.api_key_env, "QDRANT_API_KEY"),
          },
    graph:
      graphBackend === "kuzu"
        ? {
            backend: "kuzu",
            database:
              envFirst(env, "KIRAKIRA_MEMORY_KUZU_PATH") ??
              memory?.graph?.database ??
              ".kirakira/memory/kuzu",
          }
        : {
            backend: "neo4j",
            uri: neo4jUri,
            username:
              envFirst(env, "KIRAKIRA_MEMORY_NEO4J_USER", memory?.graph?.username_env, "KIRAKIRA_NEO4J_USER") ??
              "neo4j",
            password:
              envFirst(
                env,
                "KIRAKIRA_MEMORY_NEO4J_PASSWORD",
                memory?.graph?.password_env,
                "KIRAKIRA_NEO4J_PASSWORD",
              ) ?? "password",
          },
    blob: {
      bucket: envFirst(env, "KIRAKIRA_MEMORY_S3_BUCKET", "S3_BUCKET") ?? memory?.blob?.bucket ?? "kirakira-memory",
      region: envFirst(env, "KIRAKIRA_MEMORY_S3_REGION", "AWS_REGION") ?? memory?.blob?.region ?? "us-east-1",
      ...(s3Endpoint ? { endpoint: s3Endpoint, forcePathStyle: true } : {}),
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    },
    embedding: {
      model:
        envFirst(env, "KIRAKIRA_MEMORY_EMBEDDING_MODEL", "OPENAI_EMBEDDING_MODEL") ??
        memory?.embedding?.model ??
        "text-embedding-3-small",
      apiKey: envFirst(env, "KIRAKIRA_MEMORY_EMBEDDING_API_KEY", memory?.embedding?.api_key_env, "OPENAI_API_KEY"),
      baseUrl: envFirst(env, "KIRAKIRA_MEMORY_EMBEDDING_BASE_URL", memory?.embedding?.base_url_env, "OPENAI_BASE_URL"),
    },
    recall: {
      similarityWeight: envNumber(env, "KIRAKIRA_MEMORY_RECALL_SIMILARITY_WEIGHT"),
      graphWeight: envNumber(env, "KIRAKIRA_MEMORY_RECALL_GRAPH_WEIGHT"),
      temporalWeight: envNumber(env, "KIRAKIRA_MEMORY_RECALL_TEMPORAL_WEIGHT"),
      stateWeight: envNumber(env, "KIRAKIRA_MEMORY_RECALL_STATE_WEIGHT"),
      defaultTokenBudget: envNumber(env, "KIRAKIRA_MEMORY_RECALL_TOKEN_BUDGET") ?? memory?.recall?.token_budget,
      defaultLevel: envFirst(env, "KIRAKIRA_MEMORY_RECALL_LEVEL") ?? memory?.recall?.level,
    },
    retain: {
      reflectThreshold: envNumber(env, "KIRAKIRA_MEMORY_RETAIN_REFLECT_THRESHOLD"),
      factBaseConfidence: envNumber(env, "KIRAKIRA_MEMORY_FACT_BASE_CONFIDENCE"),
      factConfidenceStep: envNumber(env, "KIRAKIRA_MEMORY_FACT_CONFIDENCE_STEP"),
    },
    belief: {
      defaultConfidence: envNumber(env, "KIRAKIRA_MEMORY_BELIEF_DEFAULT_CONFIDENCE"),
      supportDelta: envNumber(env, "KIRAKIRA_MEMORY_BELIEF_SUPPORT_DELTA"),
      contradictDelta: envNumber(env, "KIRAKIRA_MEMORY_BELIEF_CONTRADICT_DELTA"),
    },
  };
}

class LazyMemoryRecallPort implements DaemonMemoryService {
  private service: DaemonMemoryService | undefined;

  constructor(
    private readonly config: MemoryServiceConfig,
    private readonly serviceFactory: (config: MemoryServiceConfig) => DaemonMemoryService,
  ) {}

  async recall(...args: Parameters<MemoryRecallPort["recall"]>) {
    return this.getService().recall(...args);
  }

  async explainRetrieval(...args: Parameters<MemoryRecallPort["explainRetrieval"]>) {
    return this.getService().explainRetrieval(...args);
  }

  async close(): Promise<void> {
    await this.service?.close?.();
  }

  private getService(): DaemonMemoryService {
    this.service ??= this.serviceFactory(this.config);
    return this.service;
  }
}

function defaultTenantId(
  options: DaemonMemoryDependencyOptions,
  env: DaemonMemoryEnv,
): string {
  return (
    envFirst(env, "KIRAKIRA_MEMORY_TENANT_ID", "KIRAKIRA_TENANT_ID") ??
    options.resolvedConfig?.agentToml.workspace_name ??
    "local"
  );
}

function defaultWorkspaceId(
  options: DaemonMemoryDependencyOptions,
  env: DaemonMemoryEnv,
): string {
  const profile = activeRuntimeProfile(options.resolvedConfig, options.runtimeProfileName);
  return (
    envFirst(env, "KIRAKIRA_MEMORY_WORKSPACE_ID", "KIRAKIRA_WORKSPACE_ID") ??
    profile?.workspace_root ??
    options.workspaceRoot
  );
}

export function createDaemonMemoryDependencies(
  options: DaemonMemoryDependencyOptions,
): DaemonMemoryDependencies {
  if (!shouldCreateDaemonMemoryDependencies(options)) {
    return { async close() {} };
  }

  const env = options.env ?? process.env;
  const memory = activeRuntimeMemory(options);
  const config = options.service ? undefined : memoryServiceConfigFromEnv(env, memory);
  const service =
    options.service ??
    new LazyMemoryRecallPort(
      config!,
      options.serviceFactory ?? ((serviceConfig) => new MemoryServiceImpl(serviceConfig)),
    );

  return {
    ...(config ? { config } : {}),
    researchSource: {
      service,
      tenantId: () =>
        envFirst(env, "KIRAKIRA_MEMORY_TENANT_ID", "KIRAKIRA_TENANT_ID") ??
        defaultTenantId(options, env),
      workspaceId: ({ workspaceRoot }) =>
        envFirst(env, "KIRAKIRA_MEMORY_WORKSPACE_ID", "KIRAKIRA_WORKSPACE_ID") ??
        workspaceRoot ??
        defaultWorkspaceId(options, env),
      tokenBudget: envNumber(env, "KIRAKIRA_MEMORY_RECALL_TOKEN_BUDGET") ?? memory?.recall?.token_budget,
      limit: envNumber(env, "KIRAKIRA_MEMORY_RECALL_LIMIT") ?? memory?.recall?.limit,
      level:
        memoryContextLevel(envFirst(env, "KIRAKIRA_MEMORY_RECALL_LEVEL") ?? memory?.recall?.level) ??
        DEFAULT_MEMORY_LEVEL,
      includeRedacted: false,
    },
    async close() {
      await service.close?.();
    },
  };
}

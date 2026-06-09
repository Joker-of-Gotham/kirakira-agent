import type { ResolvedConfig, ResolvedRuntimeMemoryState } from "@kirakira/core";
import type { MemoryRecallPort } from "@kirakira/deep-research";
import type { CheckpointRepository } from "@kirakira/event-store";
import {
  MemoryServiceImpl,
  type MemoryServiceConfig,
} from "@kirakira/memory-service";
import {
  createPgClient,
  PostgresCheckpointEnvelopeRepository,
} from "@kirakira/memory-store";
import type { RunEvent, RunEventKind } from "@kirakira/runtime-contracts";
import { ulid } from "ulid";

import type {
  DaemonMemoryResearchSourceOptions,
  DaemonRunEventSink,
} from "./deep-research.js";
import { runtimeProfileComposition } from "./runtime-profile.js";

export type DaemonMemoryEnv = Record<string, string | undefined>;

export type DaemonMemoryNamespace = "user" | "project" | "org" | "agent" | "shared";
export type DaemonMemoryEpisodeSourceType = "chat" | "tool" | "file" | "web" | "sandbox";
export type DaemonMemoryRetentionClass = "default" | "regulated" | "ephemeral";
export type DaemonMemoryPiiLevel = "none" | "low" | "high";

export interface DaemonMemoryRetainRequest {
  tenantId: string;
  workspaceId: string;
  actorId?: string;
  namespace: DaemonMemoryNamespace;
  sourceType: DaemonMemoryEpisodeSourceType;
  content: string;
  metadata?: Record<string, unknown>;
  sessionId?: string;
  runId?: string;
  retentionClass?: DaemonMemoryRetentionClass;
  piiLevel?: DaemonMemoryPiiLevel;
}

export interface DaemonMemoryRetainReceipt {
  episodeId: string;
  memoryRecordIds: string[];
  factIds: string[];
  outboxEventId: string;
  retainedAt: string;
}

export interface DaemonMemoryReflectRequest {
  tenantId: string;
  workspaceId: string;
  scope?: string;
  factIds?: string[];
  episodeIds?: string[];
  maxConsolidations?: number;
}

export interface DaemonMemoryReflectReceipt {
  observationIds: string[];
  beliefUpdates: Array<{ beliefId: string; action: "created" | "updated" | "invalidated" }>;
  contradictions: Array<{ factId: string; conflictsWith: string; resolution: string }>;
  reflectedAt: string;
}

export type DaemonMemoryService = MemoryRecallPort & {
  retain?: (req: DaemonMemoryRetainRequest) => Promise<DaemonMemoryRetainReceipt>;
  reflect?: (req: DaemonMemoryReflectRequest) => Promise<DaemonMemoryReflectReceipt>;
  close?: () => Promise<void> | void;
};

export type DaemonCheckpointRepository = CheckpointRepository & {
  close?: () => Promise<void> | void;
};

export interface DaemonMemoryDependencyOptions {
  workspaceRoot: string;
  env?: DaemonMemoryEnv;
  resolvedConfig?: Pick<ResolvedConfig, "agentToml" | "runtimeState">;
  runtimeProfileName?: string;
  service?: DaemonMemoryService;
  serviceFactory?: (config: MemoryServiceConfig) => DaemonMemoryService;
  eventSink?: DaemonRunEventSink;
  enableRetain?: boolean;
  enableReflect?: boolean;
  enableCheckpointRepository?: boolean;
  checkpointRepository?: DaemonCheckpointRepository;
  checkpointRepositoryFactory?: (config: MemoryServiceConfig) => DaemonCheckpointRepository;
}

export type DaemonMemoryOperationName = "retain" | "reflect";

export type DaemonMemoryEventDestination =
  | {
      channel: "memory-service";
      enabled: boolean;
      operation: DaemonMemoryOperationName;
    }
  | {
      channel: "memory-service-outbox";
      enabled: boolean;
      eventTypes: readonly string[];
    }
  | {
      channel: "runtime-events";
      enabled: boolean;
      eventKinds: readonly RunEventKind[];
      requiresRunId: boolean;
    };

export interface DaemonMemoryOperationContext {
  runId?: string;
  sessionId?: string;
  traceId?: string;
  parentTaskId?: string;
  nodeId?: string;
  metadata?: Record<string, unknown>;
}

export interface DaemonMemoryOperationBridge<Request, Receipt> {
  operation: DaemonMemoryOperationName;
  enabled: boolean;
  destinations: DaemonMemoryEventDestination[];
  invoke?: (request: Request, context?: DaemonMemoryOperationContext) => Promise<Receipt>;
}

export interface DaemonMemoryRetainReflectBridge {
  retain: DaemonMemoryOperationBridge<DaemonMemoryRetainRequest, DaemonMemoryRetainReceipt>;
  reflect: DaemonMemoryOperationBridge<DaemonMemoryReflectRequest, DaemonMemoryReflectReceipt>;
}

export interface DaemonMemoryDependencies {
  researchSource?: DaemonMemoryResearchSourceOptions;
  checkpointRepository?: CheckpointRepository;
  retainReflect: DaemonMemoryRetainReflectBridge;
  config?: MemoryServiceConfig;
  close(): Promise<void>;
}

const MEMORY_SERVICE_NAMES = new Set(["postgres", "redis", "qdrant", "neo4j", "minio"]);
const MEMORY_CONTEXT_LEVELS = new Set(["L0", "L1", "L2", "L3"]);
const DEFAULT_MEMORY_LEVEL: NonNullable<DaemonMemoryResearchSourceOptions["level"]> = "L3";
export const DAEMON_MEMORY_RETAIN_RUNTIME_EVENTS = [
  "memory.retain.started",
  "memory.retain.completed",
  "memory.retain.failed",
] as const satisfies readonly RunEventKind[];
export const DAEMON_MEMORY_REFLECT_RUNTIME_EVENTS = [
  "memory.reflect.started",
  "memory.reflect.completed",
  "memory.reflect.failed",
] as const satisfies readonly RunEventKind[];
export const DAEMON_MEMORY_RETAIN_SERVICE_OUTBOX_EVENTS = [
  "memory.fact.extract",
  "memory.index.materialize",
  "memory.reflect.request",
] as const;
export const DAEMON_MEMORY_REFLECT_SERVICE_OUTBOX_EVENTS = [
  "memory.observation.created",
] as const;
const LOCAL_MEMORY_DEFAULTS = {
  postgresDsn: "postgresql://localhost:5432/kirakira",
  redisUrl: "redis://localhost:6379/0",
  qdrantHost: "localhost",
  qdrantPort: 6333,
  neo4jUri: "bolt://localhost:7687",
};

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
  return runtimeProfileComposition(options).memory;
}

function memoryServiceEnv(
  memory: ResolvedRuntimeMemoryState | undefined,
  name: string,
): string | undefined {
  return memory?.services?.find((service) => service.name === name)?.url_env;
}

function memoryDeclaresService(
  memory: ResolvedRuntimeMemoryState | undefined,
  name: string,
): boolean {
  if (!memory || memory.enabled === false) return false;
  return (memory.services ?? []).some((service) => service.name === name);
}

function profileMemoryFallback<T>(
  memory: ResolvedRuntimeMemoryState | undefined,
  label: string,
  keys: Array<string | undefined>,
  fallback: T,
): T {
  if (!memory || memory.enabled === false) return fallback;
  const envKeys = [...new Set(keys.filter((key): key is string => Boolean(key)))];
  throw new Error(
    `Resolved runtime memory profile requires ${label} from env${
      envKeys.length > 0 ? ` (${envKeys.join(", ")})` : ""
    }`,
  );
}

function memoryPostgresEnvKeys(memory: ResolvedRuntimeMemoryState | undefined): Array<string | undefined> {
  return ["KIRAKIRA_MEMORY_POSTGRES_DSN", memoryServiceEnv(memory, "postgres"), "DATABASE_URL"];
}

function memoryRedisEnvKeys(memory: ResolvedRuntimeMemoryState | undefined): Array<string | undefined> {
  return ["KIRAKIRA_MEMORY_REDIS_URL", memoryServiceEnv(memory, "redis"), "REDIS_URL"];
}

function memoryQdrantUrlEnvKeys(memory: ResolvedRuntimeMemoryState | undefined): Array<string | undefined> {
  return [
    "KIRAKIRA_MEMORY_QDRANT_URL",
    memory?.vector?.url_env,
    memoryServiceEnv(memory, "qdrant"),
    "QDRANT_URL",
  ];
}

function memoryQdrantHostEnvKeys(memory: ResolvedRuntimeMemoryState | undefined): Array<string | undefined> {
  return ["KIRAKIRA_MEMORY_QDRANT_HOST", memory?.vector?.host_env];
}

function memoryNeo4jUriEnvKeys(memory: ResolvedRuntimeMemoryState | undefined): Array<string | undefined> {
  return [
    "KIRAKIRA_MEMORY_NEO4J_URI",
    memory?.graph?.uri_env,
    memoryServiceEnv(memory, "neo4j"),
    "NEO4J_URI",
  ];
}

function memoryNeo4jUserEnvKeys(memory: ResolvedRuntimeMemoryState | undefined): Array<string | undefined> {
  return ["KIRAKIRA_MEMORY_NEO4J_USER", memory?.graph?.username_env, "KIRAKIRA_NEO4J_USER"];
}

function memoryNeo4jPasswordEnvKeys(memory: ResolvedRuntimeMemoryState | undefined): Array<string | undefined> {
  return [
    "KIRAKIRA_MEMORY_NEO4J_PASSWORD",
    memory?.graph?.password_env,
    "KIRAKIRA_NEO4J_PASSWORD",
  ];
}

function memoryProfileHasService(
  options: Pick<DaemonMemoryDependencyOptions, "resolvedConfig" | "runtimeProfileName">,
  name: string,
): boolean {
  const composition = runtimeProfileComposition(options);
  const memory = composition.memory;
  if (memory?.enabled === false) return false;
  return (memory?.services ?? composition.profile?.services ?? []).some(
    (service) => service.name === name,
  );
}

function memoryProfileHasBackingServices(
  options: Pick<DaemonMemoryDependencyOptions, "resolvedConfig" | "runtimeProfileName">,
): boolean {
  const composition = runtimeProfileComposition(options);
  const memory = composition.memory;
  if (memory?.enabled === false) return false;
  const serviceNames = new Set(
    (memory?.services ?? composition.profile?.services ?? []).map((service) => service.name),
  );
  return [...MEMORY_SERVICE_NAMES].some((name) => serviceNames.has(name));
}

function memoryPostgresDsn(
  env: DaemonMemoryEnv,
  memory: ResolvedRuntimeMemoryState | undefined,
): string | undefined {
  return envFirst(env, ...memoryPostgresEnvKeys(memory));
}

function hasRuntimeMemoryPostgresEnv(
  env: DaemonMemoryEnv,
  memory: ResolvedRuntimeMemoryState | undefined,
): boolean {
  return Boolean(memoryPostgresDsn(env, memory));
}

function hasRuntimeMemoryEnv(
  env: DaemonMemoryEnv,
  memory: ResolvedRuntimeMemoryState | undefined,
): boolean {
  return Boolean(
    memoryPostgresDsn(env, memory) &&
      envFirst(env, ...memoryRedisEnvKeys(memory)) &&
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

function serviceSupportsOperation(
  service: DaemonMemoryService | undefined,
  operation: DaemonMemoryOperationName,
): boolean {
  return typeof service?.[operation] === "function";
}

function shouldCreateDaemonMemoryOperation(
  options: DaemonMemoryDependencyOptions,
  operation: DaemonMemoryOperationName,
): boolean {
  const env = options.env ?? process.env;
  const enabled = envFlag(env, "KIRAKIRA_MEMORY_ENABLED");
  const operationEnabled = envFlag(
    env,
    operation === "retain"
      ? "KIRAKIRA_MEMORY_RETAIN_ENABLED"
      : "KIRAKIRA_MEMORY_REFLECT_ENABLED",
  );
  const memory = activeRuntimeMemory(options);
  const optionEnabled =
    operation === "retain" ? options.enableRetain : options.enableReflect;
  const hasMemoryServiceConfig = hasRuntimeMemoryEnv(env, memory);
  if (optionEnabled === false) return false;
  if (operationEnabled === false) return false;
  if (enabled === false) return false;
  if (memory?.enabled === false) return false;
  if (options.service) {
    return serviceSupportsOperation(options.service, operation) &&
      (optionEnabled === true ||
        operationEnabled === true ||
        enabled === true ||
        memoryProfileHasBackingServices(options));
  }
  if (optionEnabled === true) return hasMemoryServiceConfig;
  if (operationEnabled === true) return hasMemoryServiceConfig;
  if (enabled === true) return hasMemoryServiceConfig;
  return Boolean(
    memoryProfileHasBackingServices(options) &&
      hasMemoryServiceConfig,
  );
}

export function shouldCreateDaemonMemoryRetainReflectBridge(
  options: DaemonMemoryDependencyOptions,
): boolean {
  return shouldCreateDaemonMemoryOperation(options, "retain") ||
    shouldCreateDaemonMemoryOperation(options, "reflect");
}

export function shouldCreateDaemonMemoryCheckpointRepository(
  options: DaemonMemoryDependencyOptions,
): boolean {
  if (options.enableCheckpointRepository === false) return false;
  const env = options.env ?? process.env;
  const enabled = envFlag(env, "KIRAKIRA_MEMORY_ENABLED");
  const checkpointEnabled = envFlag(env, "KIRAKIRA_MEMORY_CHECKPOINTS_ENABLED");
  const memory = activeRuntimeMemory(options);
  if (checkpointEnabled === false) return false;
  if (enabled === false) return false;
  if (memory?.enabled === false) return false;
  if (options.checkpointRepository) return true;
  if (checkpointEnabled === true) return true;
  return Boolean(
    memoryProfileHasService(options, "postgres") &&
      hasRuntimeMemoryPostgresEnv(env, memory),
  );
}

export function memoryPostgresConfigFromEnv(
  env: DaemonMemoryEnv = process.env,
  memory?: ResolvedRuntimeMemoryState,
): MemoryServiceConfig["postgres"] | undefined {
  const dsn = memoryPostgresDsn(env, memory);
  return dsn ? postgresConfigFromDsn(dsn) : undefined;
}

export function memoryServiceConfigFromEnv(
  env: DaemonMemoryEnv = process.env,
  memory?: ResolvedRuntimeMemoryState,
): MemoryServiceConfig {
  const postgresDsn =
    memoryPostgresDsn(env, memory) ??
    (memoryDeclaresService(memory, "postgres")
      ? profileMemoryFallback(
          memory,
          "Postgres DSN",
          memoryPostgresEnvKeys(memory),
          LOCAL_MEMORY_DEFAULTS.postgresDsn,
        )
      : LOCAL_MEMORY_DEFAULTS.postgresDsn);
  const redisUrl =
    envFirst(env, ...memoryRedisEnvKeys(memory)) ??
    (memoryDeclaresService(memory, "redis")
      ? profileMemoryFallback(memory, "Redis URL", memoryRedisEnvKeys(memory), LOCAL_MEMORY_DEFAULTS.redisUrl)
      : LOCAL_MEMORY_DEFAULTS.redisUrl);
  const qdrantUrl = envFirst(env, ...memoryQdrantUrlEnvKeys(memory));
  const vectorBackend = envFirst(env, "KIRAKIRA_MEMORY_VECTOR_BACKEND") ?? memory?.vector?.backend;
  const graphBackend = envFirst(env, "KIRAKIRA_MEMORY_GRAPH_BACKEND") ?? memory?.graph?.backend;
  const neo4jUri =
    envFirst(env, ...memoryNeo4jUriEnvKeys(memory)) ??
    (memoryDeclaresService(memory, "neo4j") || graphBackend === "neo4j"
      ? profileMemoryFallback(memory, "Neo4j URI", memoryNeo4jUriEnvKeys(memory), LOCAL_MEMORY_DEFAULTS.neo4jUri)
      : LOCAL_MEMORY_DEFAULTS.neo4jUri);
  const neo4jUsername =
    envFirst(env, ...memoryNeo4jUserEnvKeys(memory)) ??
    (memory?.graph?.username_env
      ? profileMemoryFallback(memory, "Neo4j username", memoryNeo4jUserEnvKeys(memory), "neo4j")
      : "neo4j");
  const neo4jPassword =
    envFirst(env, ...memoryNeo4jPasswordEnvKeys(memory)) ??
    (memory?.graph?.password_env
      ? profileMemoryFallback(memory, "Neo4j password", memoryNeo4jPasswordEnvKeys(memory), "password")
      : "password");
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
  const qdrantHost = envFirst(env, ...memoryQdrantHostEnvKeys(memory));
  const qdrantPort = parsePort(
    envFirst(env, "KIRAKIRA_MEMORY_QDRANT_PORT", memory?.vector?.port_env),
    LOCAL_MEMORY_DEFAULTS.qdrantPort,
  );
  const requiresQdrant =
    vectorBackend === "qdrant" ||
    memoryDeclaresService(memory, "qdrant") ||
    Boolean(memory?.vector?.url_env || memory?.vector?.host_env);
  const useQdrant =
    vectorBackend === "qdrant" ||
    Boolean(qdrantUrl) ||
    (requiresQdrant && vectorBackend !== "pgvector");
  const qdrant = qdrantUrl
    ? endpointHostPort(qdrantUrl, qdrantHost ?? LOCAL_MEMORY_DEFAULTS.qdrantHost, qdrantPort)
    : {
        host: qdrantHost ??
          (requiresQdrant
            ? profileMemoryFallback(
                memory,
                "Qdrant URL or host",
                [...memoryQdrantUrlEnvKeys(memory), ...memoryQdrantHostEnvKeys(memory)],
                LOCAL_MEMORY_DEFAULTS.qdrantHost,
              )
            : LOCAL_MEMORY_DEFAULTS.qdrantHost),
        port: qdrantPort,
      };

  return {
    postgres: postgresConfigFromDsn(postgresDsn),
    redis: { url: redisUrl },
    vector:
      !useQdrant
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
            username: neo4jUsername,
            password: neo4jPassword,
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

class LazyMemoryService implements DaemonMemoryService {
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

  async retain(req: DaemonMemoryRetainRequest): Promise<DaemonMemoryRetainReceipt> {
    const service = this.getService();
    if (!service.retain) {
      throw new Error("Daemon memory service does not implement retain");
    }
    return service.retain(req);
  }

  async reflect(req: DaemonMemoryReflectRequest): Promise<DaemonMemoryReflectReceipt> {
    const service = this.getService();
    if (!service.reflect) {
      throw new Error("Daemon memory service does not implement reflect");
    }
    return service.reflect(req);
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
  const profile = runtimeProfileComposition(options).profile;
  return (
    envFirst(env, "KIRAKIRA_MEMORY_WORKSPACE_ID", "KIRAKIRA_WORKSPACE_ID") ??
    profile?.workspace_root ??
    options.workspaceRoot
  );
}

function createDefaultCheckpointRepository(
  config: MemoryServiceConfig,
): DaemonCheckpointRepository {
  const sql = createPgClient({
    ...config.postgres,
    maxConnections: config.postgres.maxConnections ?? 4,
  });
  const repository = new PostgresCheckpointEnvelopeRepository(sql);
  return {
    save: (envelope) => repository.save(envelope),
    load: (id) => repository.load(id),
    delete: (id) => repository.delete(id),
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}

function memoryOperationDestinations(
  operation: DaemonMemoryOperationName,
  enabled: boolean,
  eventSink: DaemonRunEventSink | undefined,
): DaemonMemoryEventDestination[] {
  const serviceOutboxEvents =
    operation === "retain"
      ? DAEMON_MEMORY_RETAIN_SERVICE_OUTBOX_EVENTS
      : DAEMON_MEMORY_REFLECT_SERVICE_OUTBOX_EVENTS;
  const destinations: DaemonMemoryEventDestination[] = [
    { channel: "memory-service", enabled, operation },
    {
      channel: "memory-service-outbox",
      enabled,
      eventTypes: serviceOutboxEvents,
    },
  ];
  destinations.push({
    channel: "runtime-events",
    enabled: enabled && eventSink !== undefined,
    eventKinds: operation === "retain"
      ? DAEMON_MEMORY_RETAIN_RUNTIME_EVENTS
      : DAEMON_MEMORY_REFLECT_RUNTIME_EVENTS,
    requiresRunId: true,
  });
  return destinations;
}

function memoryOperationContract<Request, Receipt>(
  operation: DaemonMemoryOperationName,
  enabled: boolean,
  eventSink: DaemonRunEventSink | undefined,
  invoke?: (request: Request, context?: DaemonMemoryOperationContext) => Promise<Receipt>,
): DaemonMemoryOperationBridge<Request, Receipt> {
  return {
    operation,
    enabled,
    destinations: memoryOperationDestinations(operation, enabled, eventSink),
    ...(enabled && invoke ? { invoke } : {}),
  };
}

function createRetainReflectBridge(input: {
  service?: DaemonMemoryService;
  eventSink?: DaemonRunEventSink;
  retainEnabled: boolean;
  reflectEnabled: boolean;
}): DaemonMemoryRetainReflectBridge {
  const retainInvoke = input.service
    ? (request: DaemonMemoryRetainRequest, context?: DaemonMemoryOperationContext) =>
        invokeRetain(input.service!, request, context, input.eventSink)
    : undefined;
  const reflectInvoke = input.service
    ? (request: DaemonMemoryReflectRequest, context?: DaemonMemoryOperationContext) =>
        invokeReflect(input.service!, request, context, input.eventSink)
    : undefined;
  return {
    retain: memoryOperationContract(
      "retain",
      input.retainEnabled,
      input.eventSink,
      retainInvoke,
    ),
    reflect: memoryOperationContract(
      "reflect",
      input.reflectEnabled,
      input.eventSink,
      reflectInvoke,
    ),
  };
}

async function invokeRetain(
  service: DaemonMemoryService,
  request: DaemonMemoryRetainRequest,
  context: DaemonMemoryOperationContext | undefined,
  eventSink: DaemonRunEventSink | undefined,
): Promise<DaemonMemoryRetainReceipt> {
  if (!service.retain) {
    throw new Error("Daemon memory service does not implement retain");
  }
  const operationId = ulid();
  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();
  const runId = context?.runId ?? request.runId;
  const basePayload = memoryRetainRequestPayload(operationId, request, context, startedAtIso);
  if (eventSink && runId) {
    await emitDaemonMemoryOperationEvent(
      eventSink,
      runId,
      "memory.retain.started",
      basePayload,
    );
  }
  try {
    const receipt = await service.retain(request);
    if (eventSink && runId) {
      await emitDaemonMemoryOperationEvent(
        eventSink,
        runId,
        "memory.retain.completed",
        {
          ...basePayload,
          ...memoryRetainReceiptPayload(receipt),
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
        },
      );
    }
    return receipt;
  } catch (error) {
    if (eventSink && runId) {
      await emitDaemonMemoryOperationEvent(
        eventSink,
        runId,
        "memory.retain.failed",
        {
          ...basePayload,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
          error: errorMessage(error),
        },
      );
    }
    throw error;
  }
}

async function invokeReflect(
  service: DaemonMemoryService,
  request: DaemonMemoryReflectRequest,
  context: DaemonMemoryOperationContext | undefined,
  eventSink: DaemonRunEventSink | undefined,
): Promise<DaemonMemoryReflectReceipt> {
  if (!service.reflect) {
    throw new Error("Daemon memory service does not implement reflect");
  }
  const operationId = ulid();
  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();
  const runId = context?.runId;
  const basePayload = memoryReflectRequestPayload(operationId, request, context, startedAtIso);
  if (eventSink && runId) {
    await emitDaemonMemoryOperationEvent(
      eventSink,
      runId,
      "memory.reflect.started",
      basePayload,
    );
  }
  try {
    const receipt = await service.reflect(request);
    if (eventSink && runId) {
      await emitDaemonMemoryOperationEvent(
        eventSink,
        runId,
        "memory.reflect.completed",
        {
          ...basePayload,
          ...memoryReflectReceiptPayload(receipt),
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
        },
      );
    }
    return receipt;
  } catch (error) {
    if (eventSink && runId) {
      await emitDaemonMemoryOperationEvent(
        eventSink,
        runId,
        "memory.reflect.failed",
        {
          ...basePayload,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
          error: errorMessage(error),
        },
      );
    }
    throw error;
  }
}

function memoryRetainRequestPayload(
  operationId: string,
  request: DaemonMemoryRetainRequest,
  context: DaemonMemoryOperationContext | undefined,
  startedAt: string,
): Record<string, unknown> {
  return compactRecord({
    memoryOperationId: operationId,
    operation: "retain",
    runId: context?.runId ?? request.runId,
    sessionId: context?.sessionId ?? request.sessionId,
    traceId: context?.traceId,
    parentTaskId: context?.parentTaskId,
    nodeId: context?.nodeId,
    tenantId: request.tenantId,
    workspaceId: request.workspaceId,
    actorId: request.actorId,
    namespace: request.namespace,
    sourceType: request.sourceType,
    retentionClass: request.retentionClass,
    piiLevel: request.piiLevel,
    contentLength: request.content.length,
    startedAt,
    metadata: sanitizeRecord(context?.metadata),
  });
}

function memoryRetainReceiptPayload(receipt: DaemonMemoryRetainReceipt): Record<string, unknown> {
  return compactRecord({
    episodeId: receipt.episodeId,
    memoryRecordIds: receipt.memoryRecordIds.slice(0, 50),
    factIds: receipt.factIds.slice(0, 50),
    outboxEventId: receipt.outboxEventId,
    retainedAt: receipt.retainedAt,
    serviceOutboxEventTypes: DAEMON_MEMORY_RETAIN_SERVICE_OUTBOX_EVENTS,
  });
}

function memoryReflectRequestPayload(
  operationId: string,
  request: DaemonMemoryReflectRequest,
  context: DaemonMemoryOperationContext | undefined,
  startedAt: string,
): Record<string, unknown> {
  return compactRecord({
    memoryOperationId: operationId,
    operation: "reflect",
    runId: context?.runId,
    sessionId: context?.sessionId,
    traceId: context?.traceId,
    parentTaskId: context?.parentTaskId,
    nodeId: context?.nodeId,
    tenantId: request.tenantId,
    workspaceId: request.workspaceId,
    scope: request.scope,
    factIds: request.factIds?.slice(0, 50),
    factIdCount: request.factIds?.length,
    episodeIds: request.episodeIds?.slice(0, 50),
    episodeIdCount: request.episodeIds?.length,
    maxConsolidations: request.maxConsolidations,
    startedAt,
    metadata: sanitizeRecord(context?.metadata),
  });
}

function memoryReflectReceiptPayload(receipt: DaemonMemoryReflectReceipt): Record<string, unknown> {
  return compactRecord({
    observationIds: receipt.observationIds.slice(0, 50),
    observationCount: receipt.observationIds.length,
    beliefUpdates: receipt.beliefUpdates
      .slice(0, 50)
      .map((update) => ({ beliefId: update.beliefId, action: update.action })),
    beliefUpdateCount: receipt.beliefUpdates.length,
    contradictionCount: receipt.contradictions.length,
    contradictionFactIds: uniqueStrings(
      receipt.contradictions.flatMap((contradiction) => [
        contradiction.factId,
        contradiction.conflictsWith,
      ]),
    ).slice(0, 50),
    reflectedAt: receipt.reflectedAt,
    serviceOutboxEventTypes: DAEMON_MEMORY_REFLECT_SERVICE_OUTBOX_EVENTS,
  });
}

async function emitDaemonMemoryOperationEvent(
  eventSink: DaemonRunEventSink,
  runId: string,
  kind: RunEventKind,
  payload: Record<string, unknown>,
): Promise<RunEvent> {
  const event: RunEvent = {
    id: ulid(),
    runId,
    timestamp: new Date().toISOString(),
    kind,
    payload: compactRecord(payload),
  };
  await eventSink(event);
  return event;
}

function compactRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

function sanitizeRecord(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      item === null ||
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean"
    ) {
      out[key] = typeof item === "string" ? preview(item, 240) : item;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)].filter((value) => value.length > 0);
}

function preview(value: string, max = 160): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 3))}...`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? preview(error.message, 240) : preview(String(error), 240);
}

export function createDaemonMemoryDependencies(
  options: DaemonMemoryDependencyOptions,
): DaemonMemoryDependencies {
  const shouldCreateRecall = shouldCreateDaemonMemoryDependencies(options);
  const shouldCreateRetain = shouldCreateDaemonMemoryOperation(options, "retain");
  const shouldCreateReflect = shouldCreateDaemonMemoryOperation(options, "reflect");
  const shouldCreateCheckpoint = shouldCreateDaemonMemoryCheckpointRepository(options);
  if (!shouldCreateRecall && !shouldCreateRetain && !shouldCreateReflect && !shouldCreateCheckpoint) {
    return {
      retainReflect: createRetainReflectBridge({
        retainEnabled: false,
        reflectEnabled: false,
      }),
      async close() {},
    };
  }

  const env = options.env ?? process.env;
  const memory = activeRuntimeMemory(options);
  const postgresConfig = memoryPostgresConfigFromEnv(env, memory);
  if (
    shouldCreateCheckpoint &&
    !options.checkpointRepository &&
    !options.checkpointRepositoryFactory &&
    !postgresConfig
  ) {
    throw new Error(
      "Memory checkpoint repository requires a Postgres DSN from resolved runtime memory profile or env",
    );
  }
  const needsConfig = (shouldCreateRecall && !options.service) ||
    ((shouldCreateRetain || shouldCreateReflect) && !options.service) ||
    (shouldCreateCheckpoint && !options.checkpointRepository);
  const config = needsConfig ? memoryServiceConfigFromEnv(env, memory) : undefined;
  const shouldCreateService = shouldCreateRecall || shouldCreateRetain || shouldCreateReflect;
  const service = shouldCreateService
    ? options.service ??
      new LazyMemoryService(
        config!,
        options.serviceFactory ?? ((serviceConfig) => new MemoryServiceImpl(serviceConfig)),
      )
    : undefined;
  const checkpointRepository = shouldCreateCheckpoint
    ? options.checkpointRepository ??
      (options.checkpointRepositoryFactory ?? createDefaultCheckpointRepository)(config!)
    : undefined;
  const retainReflect = createRetainReflectBridge({
    ...(service ? { service } : {}),
    ...(options.eventSink ? { eventSink: options.eventSink } : {}),
    retainEnabled: shouldCreateRetain,
    reflectEnabled: shouldCreateReflect,
  });

  return {
    retainReflect,
    ...(config ? { config } : {}),
    ...(checkpointRepository ? { checkpointRepository } : {}),
    ...(shouldCreateRecall && service
      ? {
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
        }
      : {}),
    async close() {
      await service?.close?.();
      await checkpointRepository?.close?.();
    },
  };
}

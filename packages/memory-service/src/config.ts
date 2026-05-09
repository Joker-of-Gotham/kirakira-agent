import type { PgClientConfig, RedisClientConfig, BlobConfig } from "@kirakira/memory-store";

export interface MemoryServiceConfig {
  postgres: PgClientConfig;
  redis: RedisClientConfig;
  blob: BlobConfig;
  vector: {
    backend: "qdrant" | "pgvector";
    host?: string;
    port?: number;
    apiKey?: string;
  };
  graph: {
    backend: "neo4j" | "kuzu";
    uri?: string;
    username?: string;
    password?: string;
    database?: string;
  };
  embedding: { model: string; apiKey?: string; baseUrl?: string };
  recall: {
    similarityWeight?: number;
    graphWeight?: number;
    temporalWeight?: number;
    stateWeight?: number;
    defaultTokenBudget?: number;
    defaultLevel?: string;
  };
  retain: {
    reflectThreshold?: number;
    factBaseConfidence?: number;
    factConfidenceStep?: number;
  };
  belief: {
    defaultConfidence?: number;
    supportDelta?: number;
    contradictDelta?: number;
  };
}

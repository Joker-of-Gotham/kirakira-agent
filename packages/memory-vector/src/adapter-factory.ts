import type { QdrantClient } from "@qdrant/js-client-rest";
import type { VectorAdapter } from "@kirakira/memory-core";
import postgres from "postgres";
import { QdrantClientWrapper } from "./qdrant/client.js";
import { QdrantAdapter } from "./qdrant/qdrant-adapter.js";
import { PgVectorAdapter } from "./pgvector/pgvector-adapter.js";

export type VectorStoreBackend = "qdrant" | "pgvector";

export interface QdrantAdapterFactoryConfig {
  readonly backend: "qdrant";
  readonly host: string;
  readonly port: number;
  readonly apiKey?: string;
  readonly https?: boolean;
}

export interface PgVectorAdapterFactoryConfig {
  readonly backend: "pgvector";
  /** postgres.js instance (ensure pgvector via createPgVectorClient). */
  readonly sql: ReturnType<typeof postgres>;
}

export type VectorAdapterFactoryConfig =
  | QdrantAdapterFactoryConfig
  | PgVectorAdapterFactoryConfig;

export function createVectorAdapter(config: QdrantAdapterFactoryConfig): QdrantAdapter;
export function createVectorAdapter(config: PgVectorAdapterFactoryConfig): PgVectorAdapter;
export function createVectorAdapter(
  config: VectorAdapterFactoryConfig,
): VectorAdapter {
  if (config.backend === "qdrant") {
    const { client } = new QdrantClientWrapper(
      config.host,
      config.port,
      config.apiKey,
      config.https,
    );
    return new QdrantAdapter(client);
  }

  return new PgVectorAdapter(config.sql);
}

export function createQdrantClientWrapper(
  host: string,
  port: number,
  apiKey?: string,
  https?: boolean,
): QdrantClientWrapper {
  return new QdrantClientWrapper(host, port, apiKey, https);
}

export type { QdrantClient };

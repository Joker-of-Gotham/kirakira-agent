import type { GraphAdapter } from "@kirakira/memory-core";
import { Neo4jAdapter } from "./neo4j/adapter.js";
import { Neo4jClient } from "./neo4j/client.js";
import { KuzuAdapter } from "./kuzu/client.js";

export type Neo4jAdapterConfig = {
  backend: "neo4j";
  uri: string;
  username: string;
  password: string;
  database?: string;
};

export type KuzuAdapterConfig = {
  backend: "kuzu";
  dbPath: string;
};

export type GraphAdapterConfig = Neo4jAdapterConfig | KuzuAdapterConfig;

export function createGraphAdapter(config: GraphAdapterConfig): GraphAdapter {
  if (config.backend === "neo4j") {
    const client = new Neo4jClient(config.uri, config.username, config.password, config.database);
    return new Neo4jAdapter(client);
  }
  return new KuzuAdapter(config.dbPath);
}

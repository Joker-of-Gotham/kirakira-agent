import postgres from "postgres";

export interface PgClientConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  maxConnections?: number;
  idleTimeoutMs?: number;
  ssl?: boolean | object;
}

export function createPgClient(config: PgClientConfig) {
  return postgres({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    max: config.maxConnections ?? 20,
    idle_timeout: config.idleTimeoutMs ? config.idleTimeoutMs / 1000 : 30,
    ssl: config.ssl ?? false,
    types: { bigint: postgres.BigInt },
  });
}

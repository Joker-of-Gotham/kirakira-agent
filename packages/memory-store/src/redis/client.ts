import { Redis } from "ioredis";

export interface RedisClientConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  tls?: Record<string, unknown>;
}

export type RedisClient = InstanceType<typeof Redis>;

/**
 * Creates a new `ioredis` client. Call `quit()` when shutting down.
 */
export function createRedisClient(config: RedisClientConfig = {}): RedisClient {
  if (config.url) {
    return new Redis(config.url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
    });
  }

  return new Redis({
    host: config.host ?? "127.0.0.1",
    port: config.port ?? 6379,
    password: config.password,
    db: config.db ?? 0,
    tls: config.tls,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
  });
}

import type { RedisClient } from "./client.js";

/**
 * High-level cache manager for recall caches, entity resolution caches, and hot checkpoint refs.
 * Design doc: "recall cache、rerank cache、entity resolution cache、state hydration cache"
 */
export class CacheManager {
  constructor(private readonly redis: RedisClient) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const payload = typeof value === "string" ? value : JSON.stringify(value);
    if (ttlMs !== undefined && ttlMs > 0) {
      await this.redis.set(key, payload, "PX", ttlMs);
    } else {
      await this.redis.set(key, payload);
    }
  }

  /**
   * Cache-aside: returns cached value if present, otherwise invokes `loader`, caches and returns.
   */
  async getOrSet<T>(key: string, loader: () => Promise<T>, ttlMs?: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await loader();
    await this.set(key, value, ttlMs);
    return value;
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async deletePattern(pattern: string): Promise<number> {
    let cursor = "0";
    let n = 0;
    do {
      const [next, keys] = await this.redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
      cursor = next;
      if (keys.length > 0) {
        n += await this.redis.del(...keys);
      }
    } while (cursor !== "0");
    return n;
  }

  async setHotCheckpoint(runId: string, checkpointRef: Record<string, unknown>, ttlMs = 300_000): Promise<void> {
    const key = `kirakira:hot:checkpoint:${runId}`;
    await this.set(key, checkpointRef, ttlMs);
  }

  async getHotCheckpoint<T>(runId: string): Promise<T | null> {
    const key = `kirakira:hot:checkpoint:${runId}`;
    return this.get<T>(key);
  }
}

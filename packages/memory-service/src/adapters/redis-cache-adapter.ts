import { randomUUID } from "node:crypto";

import type { CacheAdapter } from "@kirakira/memory-core";
import type { RedisClient } from "@kirakira/memory-store";

const lockPrefix = "lock:";
const streamDlq = "__dlq__";

export class RedisCacheAdapter implements CacheAdapter {
  constructor(private readonly redis: RedisClient) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
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

  async acquireLock(key: string, ttlMs: number): Promise<string | null> {
    const token = randomUUID();
    const full = `${lockPrefix}${key}`;
    const ok = await this.redis.set(full, token, "PX", ttlMs, "NX");
    return ok === "OK" ? token : null;
  }

  async releaseLock(key: string, token: string): Promise<boolean> {
    const full = `${lockPrefix}${key}`;
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const n = await this.redis.eval(script, 1, full, token);
    return Number(n) === 1;
  }

  async extendLock(key: string, token: string, ttlMs: number): Promise<boolean> {
    const full = `${lockPrefix}${key}`;
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("pexpire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;
    const n = await this.redis.eval(script, 1, full, token, String(ttlMs));
    return Number(n) === 1;
  }

  async publishToStream(stream: string, data: Record<string, string>): Promise<string> {
    const flat = Object.entries(data).flat() as [string, string, ...string[]];
    const id = await this.redis.xadd(stream, "*", ...flat);
    if (id == null) {
      throw new Error("Redis XADD returned null");
    }
    return id;
  }

  async consumeStream(
    stream: string,
    group: string,
    consumer: string,
    count: number,
  ): Promise<Array<{ id: string; data: Record<string, string> }>> {
    try {
      await this.redis.xgroup("CREATE", stream, group, "0", "MKSTREAM");
    } catch {
      // BUSYGROUP
    }
    const resRaw: unknown = await this.redis.xreadgroup(
      "GROUP",
      group,
      consumer,
      "COUNT",
      String(count),
      "STREAMS",
      stream,
      ">",
    );
    if (!Array.isArray(resRaw) || resRaw.length === 0) return [];
    const streamBatch = resRaw[0] as unknown;
    if (!Array.isArray(streamBatch) || streamBatch.length < 2) return [];
    const messages = streamBatch[1] as unknown;
    if (!Array.isArray(messages)) return [];
    const out: Array<{ id: string; data: Record<string, string> }> = [];
    for (const msg of messages) {
      if (!Array.isArray(msg) || msg.length < 2) continue;
      const id = msg[0];
      const fields = msg[1];
      if (typeof id !== "string" || !Array.isArray(fields)) continue;
      const data: Record<string, string> = {};
      for (let i = 0; i < fields.length; i += 2) {
        const k = fields[i];
        const v = fields[i + 1];
        if (typeof k === "string" && typeof v === "string") {
          data[k] = v;
        }
      }
      out.push({ id, data });
    }
    return out;
  }

  async ackStream(stream: string, group: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.redis.xack(stream, group, ...ids);
  }

  async createConsumerGroup(stream: string, group: string): Promise<void> {
    try {
      await this.redis.xgroup("CREATE", stream, group, "0", "MKSTREAM");
    } catch {
      // ignore busy
    }
  }

  async close(): Promise<void> {
    await this.redis.quit().catch(() => {
      void this.redis.disconnect();
    });
  }
}

/** Internal marker for unsupported stream edge cases (RedisCacheAdapter streams are best-effort). */
export { streamDlq };

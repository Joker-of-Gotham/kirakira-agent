import { randomUUID } from "node:crypto";

import type { RedisClient } from "./client.js";

const RELEASE_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

const EXTEND_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("pexpire", KEYS[1], ARGV[2])
  else
    return 0
  end
`;

export interface LockHandle {
  key: string;
  token: string;
  release: () => Promise<boolean>;
  extend: (ttlMs: number) => Promise<boolean>;
}

/**
 * Distributed lock manager using Redis SET NX PX + Lua CAS release/extend.
 * Design doc: "run 级与 checkpoint 恢复级 lease"
 */
export class LockManager {
  constructor(private readonly redis: RedisClient) {}

  async acquire(key: string, ttlMs: number): Promise<LockHandle | null> {
    const token = randomUUID();
    const ok = await this.redis.set(key, token, "PX", ttlMs, "NX");
    if (ok !== "OK") return null;

    return {
      key,
      token,
      release: () => this.release(key, token),
      extend: (newTtl: number) => this.extend(key, token, newTtl),
    };
  }

  async release(key: string, token: string): Promise<boolean> {
    const n = await this.redis.eval(RELEASE_SCRIPT, 1, key, token);
    return Number(n) === 1;
  }

  async extend(key: string, token: string, ttlMs: number): Promise<boolean> {
    const n = await this.redis.eval(EXTEND_SCRIPT, 1, key, token, String(ttlMs));
    return Number(n) === 1;
  }

  async isLocked(key: string): Promise<boolean> {
    const v = await this.redis.get(key);
    return v !== null;
  }
}

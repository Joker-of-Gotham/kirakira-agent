import type postgres from "postgres";

import type { StreamRouter } from "./dispatcher.js";
import { resolveStreamOrThrow } from "./dispatcher.js";
import type { RedisClient } from "../redis/client.js";

export interface ReconcilerOptions {
  sql: postgres.Sql;
  redis?: RedisClient;
  /** Max rows to scan for diagnostics queries. */
  batchSize?: number;
  /** How long a row may sit in `processing` before it is reset. */
  stuckProcessingMs?: number;
  /** How long `pending` may wait before surfacing in {@link findLongPending}. */
  pendingWarningMs?: number;
  router?: StreamRouter;
  /** Defaults to `outbox`. */
  tableName?: string;
}

function fieldsArrayToRecord(fields: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    const k = fields[i];
    const v = fields[i + 1];
    if (k !== undefined && v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Recovery tasks for outbox + Redis streams.
 */
export class OutboxReconciler {
  private readonly sql: postgres.Sql;
  private readonly redis: RedisClient | undefined;
  private readonly router: StreamRouter | undefined;
  private readonly batchSize: number;
  private readonly stuckProcessingMs: number;
  private readonly pendingWarningMs: number | undefined;
  private readonly table: string;

  constructor(options: ReconcilerOptions) {
    this.sql = options.sql;
    this.redis = options.redis;
    this.router = options.router;
    this.batchSize = options.batchSize ?? 100;
    this.stuckProcessingMs = options.stuckProcessingMs ?? 60_000;
    this.pendingWarningMs = options.pendingWarningMs;
    this.table = options.tableName ?? "outbox";
  }

  /**
   * Moves `processing` rows older than `stuckProcessingMs` back to `pending` for retry.
   */
  async resetStuckProcessing(): Promise<number> {
    const cutoff = new Date(Date.now() - this.stuckProcessingMs);
    const result = await this.sql`
      UPDATE ${this.sql(this.table)}
      SET status = 'pending',
          updated_at = now()
      WHERE status = 'processing'
        AND updated_at < ${cutoff}
    `;
    return result.count;
  }

  /**
   * Returns pending rows that have waited longer than `pendingWarningMs` (diagnostics / metrics).
   */
  async findLongPending(): Promise<
    Array<{ id: string; event_type: string; created_at: Date; attempts: number }>
  > {
    if (this.pendingWarningMs === undefined) return [];
    const cutoff = new Date(Date.now() - this.pendingWarningMs);
    return await this.sql`
      SELECT id, event_type, created_at, attempts
      FROM ${this.sql(this.table)}
      WHERE status = 'pending'
        AND created_at < ${cutoff}
      ORDER BY id ASC
      LIMIT ${this.batchSize}
    `;
  }

  /**
   * Spot-checks that `completed` rows exist in the target Redis stream (best-effort).
   * Uses `XRANGE` on a capped window; trimming/eviction can cause false negatives.
   */
  async verifyCompletedInRedisStream(sampleLimit = 25): Promise<VerifyResult> {
    if (!this.redis || !this.router) {
      return { checked: 0, missing: [] };
    }

    const rows = await this.sql<
      {
        id: string;
        event_type: string;
      }[]
    >`
      SELECT id, event_type
      FROM ${this.sql(this.table)}
      WHERE status = 'completed'
      ORDER BY updated_at DESC
      LIMIT ${sampleLimit}
    `;

    const missing: string[] = [];

    for (const row of rows) {
      const stream = resolveStreamOrThrow(this.router, row.event_type);
      const found = await this.messageExistsInStream(stream, row.id);
      if (!found) {
        missing.push(row.id);
      }
    }

    return { checked: rows.length, missing };
  }

  private async messageExistsInStream(stream: string, outboxId: string): Promise<boolean> {
    if (!this.redis) return true;
    const recent = await this.redis.xrevrange(stream, "+", "-", "COUNT", 500);
    for (const [, fields] of recent) {
      if (!Array.isArray(fields)) {
        continue;
      }
      const flat = fieldsArrayToRecord(fields as string[]);
      if (flat.id === outboxId) {
        return true;
      }
    }
    return false;
  }
}

export interface VerifyResult {
  checked: number;
  missing: string[];
}

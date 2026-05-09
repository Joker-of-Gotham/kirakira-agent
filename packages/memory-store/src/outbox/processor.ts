import type postgres from "postgres";

import type { StreamRouter } from "./dispatcher.js";
import { createDefaultDispatcher, resolveStreamOrThrow } from "./dispatcher.js";
import type { RedisClient } from "../redis/client.js";
import { OutboxRepository, type OutboxRow } from "../postgres/repositories/outbox-repo.js";

export interface OutboxProcessorOptions {
  sql: postgres.Sql;
  redis: RedisClient;
  pollIntervalMs?: number;
  batchSize?: number;
  router?: StreamRouter;
  repo?: OutboxRepository;
}

/**
 * Polls Postgres outbox rows, publishes to Redis streams, and advances status.
 */
export class OutboxProcessor {
  private readonly redis: RedisClient;
  private readonly repo: OutboxRepository;
  private readonly router: StreamRouter;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private timer: ReturnType<typeof setInterval> | undefined;
  private shouldRun = false;

  constructor(options: OutboxProcessorOptions) {
    this.redis = options.redis;
    this.repo = options.repo ?? new OutboxRepository(options.sql);
    this.router = options.router ?? createDefaultDispatcher();
    this.pollIntervalMs = options.pollIntervalMs ?? 500;
    this.batchSize = options.batchSize ?? 25;
  }

  start(): void {
    if (this.timer) return;
    this.shouldRun = true;
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, this.pollIntervalMs);
  }

  async stop(): Promise<void> {
    this.shouldRun = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async tick(): Promise<void> {
    if (!this.shouldRun && !this.timer) {
      return;
    }
    const batch = await this.repo.claim(this.batchSize);
    for (const row of batch) {
      try {
        await this.publish(row);
        await this.repo.complete(row.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.repo.fail(row.id, message);
      }
    }
  }

  private async publish(row: OutboxRow): Promise<void> {
    const stream = resolveStreamOrThrow(this.router, row.eventType);
    const payload =
      row.payload !== null && typeof row.payload === "object"
        ? JSON.stringify(row.payload)
        : JSON.stringify({ value: row.payload });

    await this.redis.xadd(
      stream,
      "*",
      "id",
      row.id,
      "event_type",
      row.eventType,
      "tenant_id",
      row.tenantId ?? "",
      "aggregate_id",
      row.aggregateId ?? "",
      "payload",
      payload,
    );
  }
}

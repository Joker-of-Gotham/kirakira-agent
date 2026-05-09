import type postgres from "postgres";

import type { BackoffOptions } from "../../outbox/retry-policy.js";
import type { PgSql } from "../pg-sql.js";
import { calculateBackoffDelayMs } from "../../outbox/retry-policy.js";

function isPoolSql(sql: PgSql): sql is postgres.Sql {
  return typeof (sql as postgres.Sql).begin === "function";
}

export type OutboxStatus = "pending" | "processing" | "completed" | "failed" | "dead_letter";

export interface OutboxEventInsert {
  tenantId?: string;
  aggregateType?: string;
  aggregateId?: string;
  eventType: string;
  payload: unknown;
  maxAttempts?: number;
  availableAt?: Date;
}

export interface OutboxRow {
  id: string;
  tenantId: string | null;
  aggregateType: string | null;
  aggregateId: string | null;
  eventType: string;
  payload: unknown;
  status: OutboxStatus;
  attempts: number;
  maxAttempts: number;
  availableAt: Date;
  createdAt: Date;
  lastError: string | null;
  updatedAt: Date;
}

export interface OutboxRepositoryOptions {
  tableName?: string;
}

type RawOutboxRow = {
  id: string;
  tenant_id: string | null;
  aggregate_type: string | null;
  aggregate_id: string | null;
  event_type: string;
  payload: unknown;
  status: string;
  attempts: number;
  max_attempts: number;
  available_at: Date;
  created_at: Date;
  last_error: string | null;
  updated_at: Date;
};

function toRow(r: RawOutboxRow): OutboxRow {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    aggregateType: r.aggregate_type,
    aggregateId: r.aggregate_id,
    eventType: r.event_type,
    payload: r.payload,
    status: r.status as OutboxStatus,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    availableAt: r.available_at,
    createdAt: r.created_at,
    lastError: r.last_error,
    updatedAt: r.updated_at,
  };
}

export class OutboxRepository {
  private readonly table: string;

  constructor(
    private readonly sql: PgSql,
    options?: OutboxRepositoryOptions,
  ) {
    this.table = options?.tableName ?? "outbox";
  }

  async push(event: OutboxEventInsert): Promise<string> {
    const payloadJson =
      event.payload !== null && typeof event.payload === "object"
        ? (event.payload as object)
        : { value: event.payload };

    const rows = await this.sql<{ id: string }[]>`
      INSERT INTO ${this.sql(this.table)} (
        tenant_id,
        aggregate_type,
        aggregate_id,
        event_type,
        payload,
        status,
        attempts,
        max_attempts,
        available_at
      ) VALUES (
        ${event.tenantId ?? null},
        ${event.aggregateType ?? null},
        ${event.aggregateId ?? null}::uuid,
        ${event.eventType},
        ${this.sql.json(payloadJson as postgres.JSONValue)},
        'pending',
        0,
        ${event.maxAttempts ?? 10},
        ${event.availableAt ?? new Date()}
      )
      RETURNING id
    `;
    const row = rows[0];
    if (!row) {
      throw new Error("outbox insert did not return id");
    }
    return String(row.id);
  }

  /**
   * Claims up to `limit` pending rows using `FOR UPDATE SKIP LOCKED`.
   */
  async claim(limit: number): Promise<OutboxRow[]> {
    const rows = await this.sql<RawOutboxRow[]>`
      WITH cte AS (
        SELECT id
        FROM ${this.sql(this.table)}
        WHERE status = 'pending'
          AND available_at <= now()
        ORDER BY id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      UPDATE ${this.sql(this.table)} AS o
      SET status = 'processing',
          updated_at = now()
      FROM cte
      WHERE o.id = cte.id
      RETURNING
        o.id,
        o.tenant_id,
        o.aggregate_type,
        o.aggregate_id,
        o.event_type,
        o.payload,
        o.status,
        o.attempts,
        o.max_attempts,
        o.available_at,
        o.created_at,
        o.last_error,
        o.updated_at
    `;
    return rows.map(toRow);
  }

  async complete(id: string): Promise<number> {
    const result = await this.sql`
      UPDATE ${this.sql(this.table)}
      SET status = 'completed',
          updated_at = now(),
          last_error = NULL
      WHERE id = ${id}::bigint
    `;
    return result.count;
  }

  async fail(
    id: string,
    errorMessage: string,
    options?: BackoffOptions & { clock?: () => Date },
  ): Promise<OutboxRow | undefined> {
    const clock = options?.clock ?? (() => new Date());

    if (!isPoolSql(this.sql)) {
      throw new TypeError("OutboxRepository.fail requires a root postgres.Sql pool (not a transaction)");
    }

    return await this.sql.begin(async (tx: postgres.TransactionSql) => {
      const locked = await tx<{ attempts: number; max_attempts: number; available_at: Date }[]>`
        SELECT attempts, max_attempts, available_at
        FROM ${tx(this.table)}
        WHERE id = ${id}::bigint
        FOR UPDATE
        LIMIT 1
      `;
      const current = locked[0];
      if (!current) return undefined;

      const nextAttempts = current.attempts + 1;
      const dead = nextAttempts >= current.max_attempts;
      const delayMs = dead
        ? 0
        : calculateBackoffDelayMs(nextAttempts, options ?? {});
      const availableAt = dead ? current.available_at : new Date(clock().getTime() + delayMs);

      const rows = await tx<RawOutboxRow[]>`
        UPDATE ${tx(this.table)}
        SET attempts = ${nextAttempts},
            last_error = ${errorMessage},
            updated_at = now(),
            status = ${dead ? "dead_letter" : "pending"},
            available_at = ${availableAt}
        WHERE id = ${id}::bigint
        RETURNING
          id,
          tenant_id,
          aggregate_type,
          aggregate_id,
          event_type,
          payload,
          status,
          attempts,
          max_attempts,
          available_at,
          created_at,
          last_error,
          updated_at
      `;
      const row = rows[0];
      return row ? toRow(row) : undefined;
    });
  }

  async deadLetter(id: string, reason?: string): Promise<number> {
    const result = await this.sql`
      UPDATE ${this.sql(this.table)}
      SET status = 'dead_letter',
          last_error = COALESCE(${reason ?? null}, last_error),
          updated_at = now()
      WHERE id = ${id}::bigint
    `;
    return result.count;
  }
}

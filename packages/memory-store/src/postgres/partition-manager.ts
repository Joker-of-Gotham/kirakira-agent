import type postgres from "postgres";

export interface PartitionManagerOptions {
  /** Parent table to partition, default `memory_records`. */
  tableName?: string;
  /** Schema name, default `public`. */
  schemaName?: string;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** First day of month UTC for `d`. */
function utcMonthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function addUtcMonths(d: Date, delta: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1, 0, 0, 0, 0));
}

function partitionNameFor(table: string, d: Date): string {
  return `${table}_${d.getUTCFullYear()}_${pad2(d.getUTCMonth() + 1)}`;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Ensures monthly RANGE partitions exist on `memory_records` (or `tableName`) for UTC months
 * starting at the current month through `monthsAhead - 1` months in the future.
 */
export async function ensurePartitions(
  sql: postgres.Sql,
  monthsAhead: number,
  options?: PartitionManagerOptions,
): Promise<string[]> {
  if (!Number.isFinite(monthsAhead) || monthsAhead < 1 || monthsAhead > 240) {
    throw new RangeError("monthsAhead must be between 1 and 240");
  }

  const schema = options?.schemaName ?? "public";
  const table = options?.tableName ?? "memory_records";
  const qualifiedParent = `${schema}.${table}`;

  const created: string[] = [];
  const start = utcMonthStart(new Date());

  for (let i = 0; i < monthsAhead; i += 1) {
    const from = addUtcMonths(start, i);
    const to = addUtcMonths(start, i + 1);
    const name = partitionNameFor(table, from);
    const qualifiedChild = `${schema}.${name}`;

    const exists = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = ${schema}
          AND c.relname = ${name}
      ) AS exists
    `;
    const row = exists[0];
    if (row?.exists) {
      continue;
    }

    const fromIso = isoDay(from);
    const toIso = isoDay(to);

    await sql.unsafe(
      `CREATE TABLE IF NOT EXISTS ${qualifiedChild} PARTITION OF ${qualifiedParent}
       FOR VALUES FROM ('${fromIso}') TO ('${toIso}');`,
    );
    created.push(qualifiedChild);
  }

  return created;
}

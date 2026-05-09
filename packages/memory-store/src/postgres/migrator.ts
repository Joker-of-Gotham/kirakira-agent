import { createHash } from "node:crypto";
import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface MigrationRunnerOptions {
  /** Absolute or package-relative migrations directory. Defaults to `./migrations` next to this file. */
  migrationsDir?: string;
}

export interface MigrationRecord {
  name: string;
  appliedAt: Date;
  sha256: string;
}

export class MigrationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MigrationError";
  }
}

async function defaultMigrationsDir(): Promise<string> {
  const pkgRoot = resolve(__dirname, "..");
  const candidates = [
    join(__dirname, "migrations"),
    join(__dirname, "postgres", "migrations"),
    join(pkgRoot, "src", "postgres", "migrations"),
    join(pkgRoot, "dist", "postgres", "migrations"),
  ];
  for (const dir of candidates) {
    try {
      await access(dir);
      const entries = await readdir(dir);
      if (entries.some((e) => e.endsWith(".sql"))) return dir;
    } catch {
      /* try next */
    }
  }
  return candidates[0]!;
}

function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

async function listMigrationFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".sql"))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

async function ensureMigrationsTable(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`
    DO $$ BEGIN
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        sha256 TEXT NOT NULL
      );
    EXCEPTION WHEN duplicate_table OR unique_violation THEN
      NULL;
    END $$;
  `);
}

const MIGRATION_LOCK_ID = 0x45414D_4D494752;

/**
 * Runs pending `.sql` migrations in lexicographic order, tracking applied files in `_migrations`.
 * Uses a PostgreSQL advisory lock to serialize concurrent migration attempts. Each migration
 * runs in a single transaction. On success, a row is inserted with the file SHA-256.
 */
export async function runMigrations(sql: postgres.Sql, options?: MigrationRunnerOptions): Promise<MigrationRecord[]> {
  const dir = options?.migrationsDir ?? (await defaultMigrationsDir());

  await sql.unsafe(`SELECT pg_advisory_lock(${MIGRATION_LOCK_ID})`);
  try {
    return await _runMigrationsLocked(sql, dir);
  } finally {
    await sql.unsafe(`SELECT pg_advisory_unlock(${MIGRATION_LOCK_ID})`);
  }
}

async function _runMigrationsLocked(sql: postgres.Sql, dir: string): Promise<MigrationRecord[]> {
  const applied: MigrationRecord[] = [];
  await ensureMigrationsTable(sql);

  const files = await listMigrationFiles(dir);
  if (files.length === 0) {
    throw new MigrationError(`No .sql migrations found in ${dir}`);
  }

  for (const file of files) {
    const fullPath = join(dir, file);
    const body = await readFile(fullPath, "utf8");
    const hash = sha256Hex(body);

    const existing = await sql<{ name: string; sha256: string }[]>`
      SELECT name, sha256 FROM _migrations WHERE name = ${file} LIMIT 1
    `;

    if (existing.length > 0) {
      const row = existing[0];
      if (!row) {
        throw new MigrationError(`unexpected: empty row for migration ${file}`);
      }
      if (row.sha256 !== hash) {
        throw new MigrationError(
          `migration checksum mismatch for ${file}: database has ${row.sha256}, filesystem has ${hash}`,
        );
      }
      continue;
    }

    try {
      await sql.begin(async (tx: postgres.TransactionSql) => {
        await tx.unsafe(body);
        await tx`
          INSERT INTO _migrations (name, applied_at, sha256)
          VALUES (${file}, now(), ${hash})
        `;
      });
    } catch (err) {
      throw new MigrationError(`failed applying migration ${file}`, { cause: err });
    }

    const inserted = await sql<{ applied_at: Date }[]>`
      SELECT applied_at FROM _migrations WHERE name = ${file} LIMIT 1
    `;
    const ins = inserted[0];
    if (!ins) {
      throw new MigrationError(`migration ${file} applied but not recorded`);
    }
    applied.push({ name: file, appliedAt: ins.applied_at, sha256: hash });
  }

  return applied;
}

/**
 * Lists applied migrations with metadata (newest last).
 */
export async function listAppliedMigrations(sql: postgres.Sql): Promise<MigrationRecord[]> {
  await ensureMigrationsTable(sql);
  const rows = await sql<{ name: string; applied_at: Date; sha256: string }[]>`
    SELECT name, applied_at, sha256 FROM _migrations ORDER BY name ASC
  `;
  return rows.map((r: { name: string; applied_at: Date; sha256: string }) => ({
    name: r.name,
    appliedAt: r.applied_at,
    sha256: r.sha256,
  }));
}

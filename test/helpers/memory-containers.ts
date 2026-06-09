import { afterAll, beforeAll } from "vitest";
import postgres from "postgres";

import { runMigrations } from "@kirakira/memory-store";

import {
  TEST_MINIO_ENDPOINT,
  TEST_NEO4J_PASSWORD,
  TEST_NEO4J_URI,
  TEST_NEO4J_USER,
  TEST_PG_URL,
  TEST_QDRANT_HOST,
  TEST_QDRANT_PORT,
  TEST_REDIS_URL,
} from "./memory-env.js";

export {
  TEST_MINIO_ENDPOINT,
  TEST_NEO4J_PASSWORD,
  TEST_NEO4J_URI,
  TEST_NEO4J_USER,
  TEST_PG_URL,
  TEST_QDRANT_HOST,
  TEST_QDRANT_PORT,
  TEST_REDIS_URL,
};

/**
 * Populated by `test/helpers/memory-global-setup.ts` before any test file loads.
 * When the profile-defined memory stack is unreachable, integration suites should skip.
 */
export function skipIfNoDocker(): boolean {
  if (process.env["KIRAKIRA_FORCE_INTEGRATION"] === "1") {
    return false;
  }
  return process.env["__KIRAKIRA_MEMORY_STACK_UP__"] !== "1";
}

export interface MemoryPgHarness {
  sql: postgres.Sql;
  close: () => Promise<void>;
}

/**
 * Opens a Postgres pool, runs memory-store migrations, and registers `afterAll` cleanup.
 * Use inside `describe.skipIf(skipIfNoDocker())` blocks.
 */
export function setupMemoryPostgresHooks(): MemoryPgHarness {
  let sql: postgres.Sql | undefined;

  beforeAll(async () => {
    sql = postgres(TEST_PG_URL, { max: 4, idle_timeout: 20, connect_timeout: 10 });
    await runMigrations(sql);
  });

  afterAll(async () => {
    if (sql) {
      await sql.end({ timeout: 5 });
    }
  });

  return {
    get sql(): postgres.Sql {
      if (!sql) {
        throw new Error("Postgres harness not initialized (beforeAll not run yet)");
      }
      return sql;
    },
    close: async () => {
      if (sql) await sql.end({ timeout: 5 });
    },
  };
}

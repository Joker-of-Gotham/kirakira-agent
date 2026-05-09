import type postgres from "postgres";

/** Postgres.js pool connection or in-flight transaction handle for repository calls. */
export type PgSql = postgres.Sql | postgres.TransactionSql;

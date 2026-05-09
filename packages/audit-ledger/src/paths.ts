import { join } from "node:path";
import { getUserHome } from "@kirakira/core";

const AUDIT_DIR = "audit";
const AUDIT_LEDGER = "audit/ledger";
const AUDIT_CHECKPOINTS = "audit/checkpoints";
const AUDIT_KEYS = "audit/keys";
const AUDIT_INDEX_SQLITE = "audit/index.sqlite";

/** Base audit directory (~/.kirakira/audit/). */
export function getAuditBaseDir(): string {
  return join(getUserHome(), AUDIT_DIR);
}

/** Ledger JSONL directory (~/.kirakira/audit/ledger/). */
export function getAuditLedgerDir(): string {
  return join(getUserHome(), AUDIT_LEDGER);
}

/** Signed checkpoints (~/.kirakira/audit/checkpoints/). */
export function getAuditCheckpointDir(): string {
  return join(getUserHome(), AUDIT_CHECKPOINTS);
}

/** Signing keys (~/.kirakira/audit/keys/). */
export function getAuditKeysDir(): string {
  return join(getUserHome(), AUDIT_KEYS);
}

/** Default SQLite audit index (~/.kirakira/audit/index.sqlite). */
export function getAuditIndexPath(): string {
  return join(getUserHome(), AUDIT_INDEX_SQLITE);
}

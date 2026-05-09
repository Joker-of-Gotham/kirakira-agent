import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AuditEvent } from "@kirakira/core";

/** Input shape accepted by `LedgerWriter.append` (no chain fields). */
export type LedgerAppendInput = Omit<
  AuditEvent,
  "segment" | "prev_hash" | "entry_hash"
>;

export async function createTempLedgerDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "audit-ledger-test-"));
}

export async function removeTempDir(dir: string | undefined): Promise<void> {
  if (!dir) {
    return;
  }
  await rm(dir, { recursive: true, force: true });
}

export function deterministicEvent(
  overrides: Partial<LedgerAppendInput> = {},
): LedgerAppendInput {
  return {
    event_id: overrides.event_id ?? "evt-deterministic-1",
    ts: overrides.ts ?? "2026-05-05T12:00:00.000Z",
    trace_id: overrides.trace_id ?? "trace-deterministic",
    kind: overrides.kind ?? "policy.decision",
    actor: overrides.actor ?? { user_id: "user-1", interactive: false },
    subject: overrides.subject ?? {},
    result: overrides.result ?? { effect: "allow" },
    metrics: overrides.metrics,
    integrity: overrides.integrity,
    decision_id: overrides.decision_id,
    version: overrides.version,
  };
}

export function uniqueEvent(overrides: Partial<LedgerAppendInput> = {}): LedgerAppendInput {
  return deterministicEvent({
    ...overrides,
    event_id: overrides.event_id ?? randomUUID(),
    trace_id: overrides.trace_id ?? randomUUID(),
  });
}

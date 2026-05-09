import { createHash } from "blake3";
import type { AuditEvent } from "@kirakira/core";
import { canonicalJson } from "./canonical-json.js";

export const LEDGER_VERSION = "kirakira.audit.v1";

export type LedgerEventPayload = Omit<
  AuditEvent,
  "entry_hash" | "prev_hash" | "segment"
>;

/** Strip chain fields before canonical JSON inside hash preimage. */
export function persistedAuditEventHashPayload(
  ev: AuditEvent,
): LedgerEventPayload {
  return {
    version: ev.version,
    event_id: ev.event_id,
    ts: ev.ts,
    trace_id: ev.trace_id,
    decision_id: ev.decision_id,
    kind: ev.kind,
    actor: ev.actor,
    subject: ev.subject,
    result: ev.result,
    metrics: ev.metrics,
    integrity: ev.integrity,
  };
}

export function ledgerHashInputUtf8(
  segmentId: string,
  prevHashHex: string,
  eventWithoutHashes: LedgerEventPayload,
): Uint8Array {
  const canon = canonicalJson(eventWithoutHashes);
  const prelude = `${LEDGER_VERSION}${segmentId}${prevHashHex}${canon}`;
  return Buffer.from(prelude, "utf8");
}

export function computeEntryHash(
  segmentId: string,
  prevHashHex: string,
  eventWithoutHashes: LedgerEventPayload,
): string {
  return createHash()
    .update(ledgerHashInputUtf8(segmentId, prevHashHex, eventWithoutHashes))
    .digest("hex");
}

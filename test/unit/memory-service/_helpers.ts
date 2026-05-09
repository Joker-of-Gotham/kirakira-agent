import type { MemoryRecord } from "@kirakira/memory-core";

const DEFAULT_ISO = "2026-05-06T12:00:00.000Z";

/**
 * Minimal valid {@link MemoryRecord} for unit tests; override any field as needed.
 */
export function makeRecord(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: "rec-default",
    tenantId: "tenant-1",
    workspaceId: "ws-1",
    namespace: "user",
    kind: "fact",
    text: "Default fact text used in memory-service unit tests.",
    summaryL0: "Default fact summary.",
    metadata: {},
    confidence: 0.7,
    evidenceIds: [],
    entityIds: [],
    txFrom: DEFAULT_ISO,
    retentionClass: "default",
    piiLevel: "none",
    redacted: false,
    createdAt: DEFAULT_ISO,
    ...overrides,
  };
}

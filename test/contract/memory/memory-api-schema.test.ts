import { describe, expect, it } from "vitest";

import {
  checkpointRefSchema,
  checkpointRequestSchema,
  exportReceiptSchema,
  exportRequestSchema,
  forgetReceiptSchema,
  forgetRequestSchema,
  recallRequestSchema,
  retainReceiptSchema,
  retainRequestSchema,
} from "@kirakira/memory-core";

describe("memory API schemas", () => {
  it("parses retain / recall / checkpoint / forget / export contracts", () => {
    retainRequestSchema.parse({
      tenantId: "t1",
      workspaceId: "w1",
      namespace: "project",
      sourceType: "chat",
      content: "hello world",
      metadata: { k: 1 },
    });

    retainReceiptSchema.parse({
      episodeId: "550e8400-e29b-41d4-a716-446655440000",
      memoryRecordIds: ["550e8400-e29b-41d4-a716-446655440001"],
      factIds: [],
      outboxEventId: "01HZQB5XK9DZRXC0QVTG4M5K9Q",
      retainedAt: "2026-05-06T12:00:00.000Z",
    });

    recallRequestSchema.parse({
      tenantId: "t1",
      workspaceId: "w1",
      query: "what did we decide about billing?",
      timeWindow: { from: "2026-01-01T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z" },
      limit: 20,
      level: "L2",
    });

    checkpointRequestSchema.parse({
      tenantId: "t1",
      runId: "550e8400-e29b-41d4-a716-446655440000",
      stepNo: 3,
      state: { counters: { n: 2 } },
    });

    checkpointRefSchema.parse({
      id: "01HZQB5XK9DZRXC0QVTG4M5K9Q",
      runId: "550e8400-e29b-41d4-a716-446655440000",
      stepNo: 3,
      createdAt: "2026-05-06T12:00:00.000Z",
    });

    forgetRequestSchema.parse({
      tenantId: "t1",
      workspaceId: "w1",
      recordIds: ["550e8400-e29b-41d4-a716-446655440002"],
      reason: "gdpr_erasure",
    });

    forgetReceiptSchema.parse({
      tombstonedIds: ["550e8400-e29b-41d4-a716-446655440002"],
      indexesDeleted: 3,
      cacheKeysEvicted: 1,
      graphEdgesInvalidated: 2,
      dryRun: false,
      forgotAt: "2026-05-06T12:00:00.000Z",
    });

    exportRequestSchema.parse({
      tenantId: "t1",
      workspaceId: "w1",
      format: "jsonl",
      includeBlobs: false,
    });

    exportReceiptSchema.parse({
      exportId: "01HZQB5XK9DZRXC0QVTG4M5K9Q",
      blobUri: "s3://bucket/exports/x.jsonl",
      recordCount: 42,
      totalBytes: 1024,
      exportedAt: "2026-05-06T12:00:00.000Z",
    });
  });

  it("rejects malformed envelopes with Zod errors", () => {
    expect(() =>
      retainRequestSchema.parse({
        tenantId: "",
        workspaceId: "w",
        namespace: "project",
        sourceType: "chat",
        content: "x",
      }),
    ).toThrow();
  });
});

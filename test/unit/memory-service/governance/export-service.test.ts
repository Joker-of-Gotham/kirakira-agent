import { describe, expect, it, vi } from "vitest";
import type { BlobAdapter, ExportRequest, StoreAdapter } from "@kirakira/memory-core";

import { ExportService } from "../../../../packages/memory-service/src/governance/export-service.js";
import { makeRecord } from "../_helpers.js";

function createStoreStub(overrides: Partial<StoreAdapter> = {}): StoreAdapter {
  const stub = {
    insertRecord: vi.fn<StoreAdapter["insertRecord"]>().mockResolvedValue(undefined),
    insertRecords: vi.fn<StoreAdapter["insertRecords"]>().mockResolvedValue(undefined),
    getRecord: vi.fn<StoreAdapter["getRecord"]>().mockResolvedValue(null),
    queryRecords: vi.fn<StoreAdapter["queryRecords"]>().mockResolvedValue([]),
    tombstoneRecord: vi.fn<StoreAdapter["tombstoneRecord"]>().mockResolvedValue(undefined),
    tombstoneRecords: vi.fn<StoreAdapter["tombstoneRecords"]>().mockResolvedValue(undefined),
    insertEpisode: vi.fn<StoreAdapter["insertEpisode"]>().mockResolvedValue(undefined),
    getEpisode: vi.fn<StoreAdapter["getEpisode"]>().mockResolvedValue(null),
    queryEpisodes: vi.fn<StoreAdapter["queryEpisodes"]>().mockResolvedValue([]),
    saveCheckpoint: vi.fn<StoreAdapter["saveCheckpoint"]>().mockResolvedValue(undefined),
    loadCheckpoint: vi.fn<StoreAdapter["loadCheckpoint"]>().mockResolvedValue(null),
    loadCheckpointById: vi.fn<StoreAdapter["loadCheckpointById"]>().mockResolvedValue(null),
    listCheckpoints: vi.fn<StoreAdapter["listCheckpoints"]>().mockResolvedValue([]),
    insertArtifactMeta: vi.fn<StoreAdapter["insertArtifactMeta"]>().mockResolvedValue(undefined),
    getArtifactMeta: vi.fn<StoreAdapter["getArtifactMeta"]>().mockResolvedValue(null),
    pushOutboxEvent: vi.fn<StoreAdapter["pushOutboxEvent"]>().mockResolvedValue(""),
    claimOutboxEvents: vi.fn<StoreAdapter["claimOutboxEvents"]>().mockResolvedValue([]),
    completeOutboxEvent: vi.fn<StoreAdapter["completeOutboxEvent"]>().mockResolvedValue(undefined),
    failOutboxEvent: vi.fn<StoreAdapter["failOutboxEvent"]>().mockResolvedValue(undefined),
    createDeletionJob: vi.fn<StoreAdapter["createDeletionJob"]>().mockResolvedValue(""),
    updateDeletionJob: vi.fn<StoreAdapter["updateDeletionJob"]>().mockResolvedValue(undefined),
    runMigrations: vi.fn<StoreAdapter["runMigrations"]>().mockResolvedValue(undefined),
    close: vi.fn<StoreAdapter["close"]>().mockResolvedValue(undefined),
  };
  return { ...stub, ...overrides } as StoreAdapter;
}

describe("ExportService.export", () => {
  const bucket = "exports-bucket";

  it("writes valid JSON arrays to blob storage", async () => {
    const rows = [
      makeRecord({
        id: "a",
        text: "sensitive body",
        overviewL1: "overview",
        summaryL0: "sum",
        tenantId: "tenant-x",
        workspaceId: "ws-x",
      }),
    ];
    const put = vi.fn<BlobAdapter["put"]>().mockResolvedValue(undefined);
    const blob = { put } as unknown as BlobAdapter;
    const store = createStoreStub();
    vi.mocked(store.queryRecords).mockResolvedValue(rows);

    const svc = new ExportService(blob, bucket);
    const req: ExportRequest = { tenantId: "tenant-x", workspaceId: "ws-x", format: "json", includeBlobs: true };
    const receipt = await svc.export(req, store);

    expect(receipt.recordCount).toBe(1);
    expect(receipt.blobUri).toContain(`s3://${bucket}/tenants/tenant-x/exports/`);
    expect(receipt.blobUri.endsWith(".json")).toBe(true);
    expect(receipt.totalBytes).toBeGreaterThan(0);

    const written = put.mock.calls[0]![1] as Buffer;
    const parsed = JSON.parse(written.toString("utf8"));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].text).toBe("sensitive body");
  });

  it("supports newline-delimited JSON exports", async () => {
    const rows = [
      makeRecord({ id: "line-1", tenantId: "t", workspaceId: "w" }),
      makeRecord({ id: "line-2", tenantId: "t", workspaceId: "w" }),
    ];
    const put = vi.fn<BlobAdapter["put"]>().mockResolvedValue(undefined);
    const store = createStoreStub();
    vi.mocked(store.queryRecords).mockResolvedValue(rows);

    const svc = new ExportService({ put } as unknown as BlobAdapter, bucket);
    const receipt = await svc.export(
      { tenantId: "t", workspaceId: "w", format: "jsonl", includeBlobs: false },
      store,
    );

    const body = (put.mock.calls[0]![1] as Buffer).toString("utf8").trimEnd();
    const lines = body.split("\n");
    expect(lines).toHaveLength(2);
    expect(() => lines.map((ln) => JSON.parse(ln))).not.toThrow();
  });

  it("strips bulky string fields when includeBlobs is false", async () => {
    const rows = [makeRecord({ id: "z", text: "hidden", overviewL1: "also-hidden", summaryL0: "keep" })];
    const put = vi.fn<BlobAdapter["put"]>().mockResolvedValue(undefined);
    const store = createStoreStub();
    vi.mocked(store.queryRecords).mockResolvedValue(rows);

    const svc = new ExportService({ put } as unknown as BlobAdapter, bucket);
    await svc.export({ tenantId: "t", workspaceId: "w", format: "json", includeBlobs: false }, store);

    const parsed = JSON.parse((put.mock.calls[0]![1] as Buffer).toString("utf8")) as unknown[];
    expect(parsed[0]).not.toHaveProperty("text");
    expect(parsed[0]).not.toHaveProperty("overviewL1");
    expect(parsed[0]).toHaveProperty("summaryL0");
  });
});

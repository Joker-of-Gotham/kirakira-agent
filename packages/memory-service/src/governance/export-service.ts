import { createHash, randomUUID } from "node:crypto";

import type {
  BlobAdapter,
  ExportReceipt,
  ExportRequest,
  MemoryRecord,
  StoreAdapter,
} from "@kirakira/memory-core";

export class ExportService {
  constructor(
    private readonly blob: BlobAdapter,
    private readonly bucket: string,
  ) {}

  async export(req: ExportRequest, store: StoreAdapter): Promise<ExportReceipt> {
    const exportId = randomUUID();
    const nowIso = new Date().toISOString();

    const rows = await store.queryRecords({
      tenantId: req.tenantId,
      workspaceId: req.workspaceId,
      limit: 50_000,
      tombstoned: false,
    });

    const ext = req.format === "jsonl" ? "jsonl" : "json";
    const uri = `s3://${this.bucket}/tenants/${req.tenantId}/exports/${exportId}.${ext}`;
    let body: Buffer;
    const recordCount = rows.length;

    if (req.format === "jsonl") {
      const lines = rows.map((r) => JSON.stringify(ExportService.stripForExport(r, req.includeBlobs === true)));
      body = Buffer.from(`${lines.join("\n")}\n`, "utf8");
    } else {
      body = Buffer.from(
        JSON.stringify(rows.map((r) => ExportService.stripForExport(r, req.includeBlobs === true))),
        "utf8",
      );
    }

    const exportSha256 = createHash("sha256").update(body).digest("hex");
    await this.blob.put(uri, body, {
      contentType: req.format === "jsonl" ? "application/x-ndjson; charset=utf-8" : "application/json; charset=utf-8",
      sha256: exportSha256,
      size: body.byteLength,
    });

    return {
      exportId,
      blobUri: uri,
      recordCount,
      totalBytes: body.byteLength,
      exportedAt: nowIso,
    };
  }

  private static stripForExport(r: MemoryRecord, includeBlobs: boolean): Record<string, unknown> {
    const base: Record<string, unknown> = {
      id: r.id,
      tenantId: r.tenantId,
      workspaceId: r.workspaceId,
      kind: r.kind,
      namespace: r.namespace,
      summaryL0: r.summaryL0,
      createdAt: r.createdAt,
      metadata: r.metadata,
    };
    if (includeBlobs) {
      base["text"] = r.text;
      base["overviewL1"] = r.overviewL1;
    }
    return base;
  }
}

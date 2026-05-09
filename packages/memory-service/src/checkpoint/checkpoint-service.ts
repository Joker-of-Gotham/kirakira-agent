import { createHash, randomUUID } from "node:crypto";

import type {
  BlobAdapter,
  CheckpointRef,
  CheckpointRequest,
  MemoryCheckpoint,
  RestoredState,
  StoreAdapter,
} from "@kirakira/memory-core";

import { EamError } from "@kirakira/core";

import { type BlobConfig } from "../adapters/s3-blob-adapter.js";

const INLINE_THRESHOLD = 65_536;

function checkpointBlobUri(cfg: BlobConfig, tenantId: string, checkpointId: string): string {
  return `s3://${cfg.bucket}/tenants/${tenantId}/checkpoints/${checkpointId}.json`;
}

/**
 * Persists checkpoint envelopes: small inline JSON in Postgres, large payloads in blob storage.
 */
export class CheckpointService {
  constructor(
    private readonly blob: BlobAdapter,
    private readonly blobCfg: BlobConfig,
  ) {}

  async save(req: CheckpointRequest, store: StoreAdapter): Promise<CheckpointRef> {
    const id = randomUUID();
    const nowIso = new Date().toISOString();
    const raw = JSON.stringify(req.state ?? {});
    let stateJson: Record<string, unknown> = req.state ?? {};

    if (raw.length > INLINE_THRESHOLD) {
      const uri = checkpointBlobUri(this.blobCfg, req.tenantId, id);
      const buf = Buffer.from(raw, "utf8");
      const ckptSha256 = createHash("sha256").update(buf).digest("hex");
      await this.blob.put(uri, buf, {
        contentType: "application/json; charset=utf-8",
        sha256: ckptSha256,
        size: buf.byteLength,
      });
      stateJson = { __blobUri: uri, __inline: false, __bytes: buf.byteLength };
    }

    const checkpoint: MemoryCheckpoint = {
      id,
      tenantId: req.tenantId,
      runId: req.runId,
      taskId: req.taskId,
      stepNo: req.stepNo,
      stateJson,
      artifactManifest: req.artifactManifest ?? {},
      parentCheckpointId: req.parentCheckpointId,
      createdAt: nowIso,
    };

    await store.saveCheckpoint(checkpoint);
    return { id, runId: req.runId, stepNo: req.stepNo, createdAt: nowIso };
  }

  /** Loads metadata from Postgres, hydrates blob payload when the checkpoint was spilled. */
  async restore(ref: CheckpointRef, store: StoreAdapter): Promise<RestoredState> {
    const row = await store.loadCheckpointById(ref.id);
    if (!row) {
      throw new EamError("CHECKPOINT_NOT_FOUND", `checkpoint not found: ${ref.id}`);
    }

    let state = row.stateJson;
    const blobUri = state["__blobUri"];
    if (typeof blobUri === "string") {
      const obj = await this.blob.get(blobUri);
      if (!obj) {
        throw new EamError("CHECKPOINT_BLOB_MISSING", `checkpoint blob missing: ${blobUri}`);
      }
      const body = obj.body instanceof Buffer ? obj.body : Buffer.from(await new Response(obj.body).arrayBuffer());
      state = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
    }

    const checkpoint: MemoryCheckpoint = { ...row, stateJson: state };
    const manifest = row.artifactManifest;
    const artifactRefs: string[] = [];
    if (Array.isArray(manifest["artifactIds"])) {
      for (const x of manifest["artifactIds"] as unknown[]) {
        if (typeof x === "string") artifactRefs.push(x);
      }
    } else {
      for (const v of Object.values(manifest)) {
        if (typeof v === "string" && v.length > 8) artifactRefs.push(v);
      }
    }

    return {
      checkpoint,
      artifactRefs,
      hydratedAt: new Date().toISOString(),
    };
  }
}

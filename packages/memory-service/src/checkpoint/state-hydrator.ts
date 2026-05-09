import type { ArtifactMeta, BlobAdapter, MemoryRecord, RestoredState, StoreAdapter } from "@kirakira/memory-core";

import { createHash } from "node:crypto";

export interface HydratedRuntimeState {
  checkpointState: Record<string, unknown>;
  artifacts: Array<{ meta: ArtifactMeta; bytes: Buffer | null }>;
  workingMemoryPreview: MemoryRecord[];
}

/**
 * Expands artifact pointers and builds a working-memory preview for agent run resumption.
 */
export class StateHydrator {
  async hydrate(restored: RestoredState, store: StoreAdapter, blob: BlobAdapter): Promise<HydratedRuntimeState> {
    const arts: Array<{ meta: ArtifactMeta; bytes: Buffer | null }> = [];

    for (const id of restored.artifactRefs) {
      const meta = await store.getArtifactMeta(id);
      if (!meta) {
        continue;
      }
      const obj = await blob.get(meta.uri);
      const bytes =
        obj && obj.body instanceof Buffer
          ? obj.body
          : obj
            ? Buffer.from(await new Response(obj.body).arrayBuffer())
            : null;
      if (bytes && !meta.sha256) {
        meta.sha256 = createHash("sha256").update(bytes).digest("hex");
      }
      arts.push({ meta, bytes });
    }

    const preview: MemoryRecord[] = [];
    const seenIds = new Set(arts.map((a) => a.meta.id));
    for (const id of restored.artifactRefs.slice(0, 16)) {
      if (!seenIds.has(id)) continue;
      const meta = arts.find((a) => a.meta.id === id)?.meta;
      if (!meta) continue;
      preview.push({
        id: meta.id,
        tenantId: meta.tenantId,
        workspaceId: restored.checkpoint.tenantId,
        namespace: "agent",
        kind: "artifact_meta",
        text: meta.uri,
        summaryL0: meta.mediaType,
        metadata: { ...meta.metadata, artifactId: meta.id },
        evidenceIds: [],
        entityIds: [],
        txFrom: meta.createdAt,
        retentionClass: "default",
        piiLevel: "none",
        redacted: false,
        createdAt: meta.createdAt,
      });
    }

    return {
      checkpointState: restored.checkpoint.stateJson,
      artifacts: arts,
      workingMemoryPreview: preview,
    };
  }
}

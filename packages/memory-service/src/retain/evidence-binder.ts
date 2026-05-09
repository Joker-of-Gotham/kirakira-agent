import { randomUUID } from "node:crypto";

import type { EpisodeSegment, MemoryRecord } from "@kirakira/memory-core";

export interface EvidenceBindingInput {
  tenantId: string;
  workspaceId: string;
  namespace: MemoryRecord["namespace"];
  episodeId: string;
  segment: EpisodeSegment;
  extractedFacts: Array<{ text: string; confidence?: number }>;
  retentionClass: MemoryRecord["retentionClass"];
  piiLevel: MemoryRecord["piiLevel"];
  actorId?: string;
}

/**
 * Binds extracted atomic statements to the originating episode segment via `evidenceIds`.
 */
export class EvidenceBinder {
  bindFacts(input: EvidenceBindingInput, nowIso: string): MemoryRecord[] {
    const evidenceKey = input.segment.id;
    return input.extractedFacts.map((f) => {
      const id = randomUUID();
      const rec: MemoryRecord = {
        id,
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        namespace: input.namespace,
        kind: "fact",
        text: f.text,
        summaryL0: f.text.slice(0, 160),
        metadata: {
          sourceEpisodeId: input.episodeId,
          sourceSegmentId: input.segment.id,
        },
        confidence: f.confidence ?? 0.7,
        evidenceIds: [evidenceKey],
        entityIds: [],
        txFrom: nowIso,
        retentionClass: input.retentionClass,
        piiLevel: input.piiLevel,
        redacted: false,
        createdAt: nowIso,
      };
      return rec;
    });
  }
}

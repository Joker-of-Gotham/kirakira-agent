import { describe, expect, it } from "vitest";
import type { EpisodeSegment } from "@kirakira/memory-core";

import { EvidenceBinder } from "../../../../packages/memory-service/src/retain/evidence-binder.js";

describe("EvidenceBinder.bindFacts", () => {
  const binder = new EvidenceBinder();
  const nowIso = "2026-05-06T15:00:00.000Z";
  const segment: EpisodeSegment = {
    id: "seg-99",
    episodeId: "ep-1",
    offsetStart: 0,
    offsetEnd: 120,
    text: "segment text",
    entityRefs: [],
    createdAt: nowIso,
  };

  it("creates one MemoryRecord per extracted fact", () => {
    const rows = binder.bindFacts(
      {
        tenantId: "t1",
        workspaceId: "w1",
        namespace: "project",
        episodeId: "ep-1",
        segment,
        extractedFacts: [{ text: "A" }, { text: "B" }, { text: "C" }],
        retentionClass: "regulated",
        piiLevel: "low",
      },
      nowIso,
    );
    expect(rows).toHaveLength(3);
  });

  it('sets kind to "fact" and evidenceIds to the segment id', () => {
    const [row] = binder.bindFacts(
      {
        tenantId: "t1",
        workspaceId: "w1",
        namespace: "user",
        episodeId: "ep-1",
        segment,
        extractedFacts: [{ text: "Only one fact statement here." }],
        retentionClass: "default",
        piiLevel: "none",
      },
      nowIso,
    );
    expect(row!.kind).toBe("fact");
    expect(row!.evidenceIds).toEqual([segment.id]);
  });

  it("defaults confidence to 0.7 when omitted", () => {
    const [row] = binder.bindFacts(
      {
        tenantId: "t1",
        workspaceId: "w1",
        namespace: "user",
        episodeId: "ep-1",
        segment,
        extractedFacts: [{ text: "Implicit confidence fact text long enough" }],
        retentionClass: "default",
        piiLevel: "none",
      },
      nowIso,
    );
    expect(row!.confidence).toBe(0.7);
  });

  it("respects explicit confidence and propagates scope fields", () => {
    const [row] = binder.bindFacts(
      {
        tenantId: "tenant-x",
        workspaceId: "workspace-y",
        namespace: "org",
        episodeId: "ep-1",
        segment,
        extractedFacts: [{ text: "High confidence", confidence: 0.91 }],
        retentionClass: "ephemeral",
        piiLevel: "high",
        actorId: "actor-42",
      },
      nowIso,
    );
    expect(row!.confidence).toBe(0.91);
    expect(row!.tenantId).toBe("tenant-x");
    expect(row!.workspaceId).toBe("workspace-y");
    expect(row!.namespace).toBe("org");
    expect(row!.retentionClass).toBe("ephemeral");
    expect(row!.piiLevel).toBe("high");
    expect(row!.actorId).toBe("actor-42");
  });
});

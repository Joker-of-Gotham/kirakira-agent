import { describe, expect, it } from "vitest";
import {
  checkpointRefSchema,
  checkpointRequestSchema,
  contextLevelSchema,
  episodeSchema,
  episodeSegmentSchema,
  episodeSourceTypeSchema,
  exportReceiptSchema,
  exportRequestSchema,
  forgetReceiptSchema,
  forgetRequestSchema,
  memoryKindSchema,
  memoryNamespaceSchema,
  memoryRecordSchema,
  piiLevelSchema,
  recallRequestSchema,
  retentionClassSchema,
  routeCandidateSchema,
  routeExplanationSchema,
  retainReceiptSchema,
  retainRequestSchema,
  retrievalTraceSchema,
} from "@kirakira/memory-core";

const iso = "2026-05-06T12:00:00.000Z";

describe("exported Zod enum / helper schemas", () => {
  it("memoryKindSchema accepts fact and rejects invalid", () => {
    expect(memoryKindSchema.parse("fact")).toBe("fact");
    expect(memoryKindSchema.safeParse("widget").success).toBe(false);
    expect(() => memoryKindSchema.parse("widget")).toThrow();
  });

  it("retentionClassSchema", () => {
    expect(retentionClassSchema.parse("ephemeral")).toBe("ephemeral");
    expect(retentionClassSchema.safeParse("forever").success).toBe(false);
  });

  it("piiLevelSchema", () => {
    expect(piiLevelSchema.parse("high")).toBe("high");
    expect(piiLevelSchema.safeParse("medium").success).toBe(false);
  });

  it("memoryNamespaceSchema", () => {
    expect(memoryNamespaceSchema.parse("shared")).toBe("shared");
    expect(memoryNamespaceSchema.safeParse("public").success).toBe(false);
  });

  it("episodeSourceTypeSchema", () => {
    expect(episodeSourceTypeSchema.parse("sandbox")).toBe("sandbox");
    expect(episodeSourceTypeSchema.safeParse("api").success).toBe(false);
  });

  it("contextLevelSchema via recallRequestSchema", () => {
    const r = recallRequestSchema.parse({
      tenantId: "t",
      workspaceId: "w",
      query: "q",
      level: "L3",
    });
    expect(r.level).toBe("L3");
    expect(
      recallRequestSchema.safeParse({
        tenantId: "t",
        workspaceId: "w",
        query: "q",
        level: "L4",
      }).success,
    ).toBe(false);
  });

  it("routeCandidateSchema and routeExplanationSchema", () => {
    const cand = routeCandidateSchema.parse({
      recordId: "mem_x",
      score: 0.5,
      rank: 2,
    });
    expect(cand.rank).toBe(2);
    expect(routeCandidateSchema.safeParse({ recordId: "", score: 1, rank: 0 }).success).toBe(false);

    const expl = routeExplanationSchema.parse({
      routeName: "hybrid",
      candidates: [{ recordId: "a", score: 1, rank: 0 }],
      filters: { k: 1 },
      durationMs: 0,
    });
    expect(expl.routeName).toBe("hybrid");
    expect(
      routeExplanationSchema.safeParse({
        routeName: "x",
        candidates: [],
        filters: {},
        durationMs: -1,
      }).success,
    ).toBe(false);
  });
});

describe("memoryRecordSchema", () => {
  const validFull = {
    id: "mem_01",
    tenantId: "ten_1",
    workspaceId: "ws_1",
    actorId: "actor_1",
    namespace: "user" as const,
    kind: "fact" as const,
    text: "full text",
    summaryL0: "s0",
    overviewL1: "o1",
    metadata: { k: "v" },
    confidence: 0.82,
    evidenceIds: ["ev1"],
    entityIds: ["ent1"],
    validFrom: iso,
    validTo: iso,
    txFrom: iso,
    txTo: iso,
    retentionClass: "regulated" as const,
    piiLevel: "low" as const,
    redacted: false,
    tombstonedAt: undefined,
    createdAt: iso,
  };

  it("parses a valid full record", () => {
    const data = memoryRecordSchema.parse(validFull);
    expect(data.id).toBe("mem_01");
    expect(data.kind).toBe("fact");
    expect(data.piiLevel).toBe("low");
    expect(data.confidence).toBe(0.82);
    expect(data.metadata).toEqual({ k: "v" });
  });

  it("rejects missing required fields via safeParse and parse throws", () => {
    const { tenantId: _t, ...rest } = validFull;
    const r = memoryRecordSchema.safeParse(rest);
    expect(r.success).toBe(false);
    expect(() => memoryRecordSchema.parse(rest)).toThrow();
  });

  it("rejects invalid kind", () => {
    const r = memoryRecordSchema.safeParse({ ...validFull, kind: "not-a-kind" });
    expect(r.success).toBe(false);
  });

  it("rejects invalid piiLevel", () => {
    const r = memoryRecordSchema.safeParse({ ...validFull, piiLevel: "extreme" });
    expect(r.success).toBe(false);
  });

  it("rejects confidence below 0 and above 1", () => {
    expect(memoryRecordSchema.safeParse({ ...validFull, confidence: -0.01 }).success).toBe(
      false,
    );
    expect(memoryRecordSchema.safeParse({ ...validFull, confidence: 1.01 }).success).toBe(false);
  });

  it("rejects invalid ISO datetimes", () => {
    const r = memoryRecordSchema.safeParse({
      ...validFull,
      createdAt: "not-a-datetime",
    });
    expect(r.success).toBe(false);
  });
});

describe("episodeSchema", () => {
  const valid = {
    id: "epi_1",
    tenantId: "ten_1",
    workspaceId: "ws_1",
    sessionId: "sess_1",
    sourceType: "chat" as const,
    startAt: iso,
    endAt: iso,
    bodyBlobUri: "s3://bucket/ep",
    segmentationScore: 0.9,
    metadata: {},
    createdAt: iso,
  };

  it("parses a valid episode", () => {
    const data = episodeSchema.parse(valid);
    expect(data.sourceType).toBe("chat");
  });

  it("rejects missing tenantId", () => {
    const { tenantId: _t, ...rest } = valid;
    expect(episodeSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects invalid sourceType", () => {
    expect(episodeSchema.safeParse({ ...valid, sourceType: "voice" }).success).toBe(false);
  });
});

describe("episodeSegmentSchema", () => {
  const valid = {
    id: "seg_1",
    episodeId: "epi_1",
    offsetStart: 0,
    offsetEnd: 10,
    text: "hello",
    entityRefs: ["e1"],
    createdAt: iso,
  };

  it("parses a valid segment", () => {
    expect(episodeSegmentSchema.parse(valid).offsetEnd).toBe(10);
  });

  it("rejects negative offsets", () => {
    expect(
      episodeSegmentSchema.safeParse({ ...valid, offsetStart: -1 }).success,
    ).toBe(false);
    expect(episodeSegmentSchema.safeParse({ ...valid, offsetEnd: -5 }).success).toBe(false);
  });
});

describe("retainRequestSchema", () => {
  const base = {
    tenantId: "ten_1",
    workspaceId: "ws_1",
    namespace: "user" as const,
    sourceType: "chat" as const,
    content: "remember this",
  };

  it("parses a valid request", () => {
    expect(retainRequestSchema.parse(base).content).toBe("remember this");
  });

  it("rejects empty content", () => {
    expect(retainRequestSchema.safeParse({ ...base, content: "" }).success).toBe(false);
  });

  it.each(["user", "project", "org", "agent", "shared"] as const)(
    "accepts namespace %s",
    (namespace) => {
      const data = retainRequestSchema.parse({ ...base, namespace });
      expect(data.namespace).toBe(namespace);
    },
  );
});

describe("recallRequestSchema", () => {
  const base = {
    tenantId: "ten_1",
    workspaceId: "ws_1",
    query: "what did we decide?",
  };

  it("parses a valid query", () => {
    expect(recallRequestSchema.parse(base).query).toContain("decide");
  });

  it("enforces tokenBudget minimum 100", () => {
    expect(recallRequestSchema.safeParse({ ...base, tokenBudget: 99 }).success).toBe(false);
    expect(recallRequestSchema.parse({ ...base, tokenBudget: 100 }).tokenBudget).toBe(100);
  });

  it("enforces limit between 1 and 200", () => {
    expect(recallRequestSchema.safeParse({ ...base, limit: 0 }).success).toBe(false);
    expect(recallRequestSchema.safeParse({ ...base, limit: 201 }).success).toBe(false);
    expect(recallRequestSchema.parse({ ...base, limit: 1 }).limit).toBe(1);
    expect(recallRequestSchema.parse({ ...base, limit: 200 }).limit).toBe(200);
  });
});

describe("checkpointRequestSchema", () => {
  const valid = {
    tenantId: "ten_1",
    runId: "run_1",
    stepNo: 0,
    state: { x: 1 },
  };

  it("parses a valid checkpoint request", () => {
    expect(checkpointRequestSchema.parse(valid).stepNo).toBe(0);
  });

  it("rejects negative stepNo", () => {
    expect(checkpointRequestSchema.safeParse({ ...valid, stepNo: -1 }).success).toBe(false);
  });
});

describe("forgetRequestSchema", () => {
  const valid = {
    tenantId: "ten_1",
    workspaceId: "ws_1",
    reason: "user requested deletion",
  };

  it("parses a valid forget request", () => {
    expect(forgetRequestSchema.parse(valid).reason).toContain("deletion");
  });

  it("rejects empty reason", () => {
    expect(forgetRequestSchema.safeParse({ ...valid, reason: "" }).success).toBe(false);
  });
});

describe("exportRequestSchema", () => {
  const valid = {
    tenantId: "ten_1",
    workspaceId: "ws_1",
    format: "jsonl" as const,
  };

  it("parses a valid export request", () => {
    expect(exportRequestSchema.parse(valid).format).toBe("jsonl");
    expect(exportRequestSchema.parse({ ...valid, format: "json" }).format).toBe("json");
  });

  it("rejects invalid format", () => {
    expect(exportRequestSchema.safeParse({ ...valid, format: "csv" }).success).toBe(false);
  });
});

describe("retrievalTraceSchema", () => {
  it("parses a valid trace with nested route explanations", () => {
    const raw = {
      traceId: "tr_1",
      queryId: "q_1",
      normalizedQuery: "n q",
      routePlan: ["vector", "graph"],
      routes: [
        {
          routeName: "vector",
          candidates: [{ recordId: "mem_a", score: 0.9, rank: 0 }],
          filters: { ns: "user" },
          durationMs: 12,
        },
        {
          routeName: "graph",
          candidates: [
            { recordId: "mem_b", score: 0.7, rank: 0 },
            { recordId: "mem_c", score: 0.6, rank: 1 },
          ],
          filters: {},
          durationMs: 8,
        },
      ],
      fusionScores: [{ recordId: "mem_a", score: 1, selected: true }],
      rerankScores: [{ recordId: "mem_a", score: 1, reason: "ok" }],
      budgetLevel: "L2",
      totalDurationMs: 25,
      createdAt: iso,
    };
    const data = retrievalTraceSchema.parse(raw);
    expect(data.routes).toHaveLength(2);
    expect(data.routes[0]?.routeName).toBe("vector");
    expect(data.routes[1]?.candidates).toHaveLength(2);
  });
});

describe("checkpointRefSchema", () => {
  it("parses a valid ref", () => {
    expect(
      checkpointRefSchema.parse({
        id: "ckp_1",
        runId: "run_1",
        stepNo: 3,
        createdAt: iso,
      }).stepNo,
    ).toBe(3);
  });

  it("rejects invalid createdAt", () => {
    expect(
      checkpointRefSchema.safeParse({
        id: "ckp_1",
        runId: "run_1",
        stepNo: 0,
        createdAt: "nope",
      }).success,
    ).toBe(false);
  });
});

describe("retainReceiptSchema", () => {
  it("parses a valid receipt", () => {
    expect(
      retainReceiptSchema.parse({
        episodeId: "epi_1",
        memoryRecordIds: ["m1"],
        factIds: ["f1"],
        outboxEventId: "obx_1",
        retainedAt: iso,
      }).episodeId,
    ).toBe("epi_1");
  });

  it("rejects empty episodeId", () => {
    expect(
      retainReceiptSchema.safeParse({
        episodeId: "",
        memoryRecordIds: [],
        factIds: [],
        outboxEventId: "x",
        retainedAt: iso,
      }).success,
    ).toBe(false);
  });
});

describe("forgetReceiptSchema", () => {
  it("parses a valid receipt", () => {
    expect(
      forgetReceiptSchema.parse({
        tombstonedIds: ["m1"],
        indexesDeleted: 0,
        cacheKeysEvicted: 0,
        graphEdgesInvalidated: 0,
        dryRun: false,
        forgotAt: iso,
      }).dryRun,
    ).toBe(false);
  });

  it("rejects negative counts", () => {
    expect(
      forgetReceiptSchema.safeParse({
        tombstonedIds: [],
        indexesDeleted: -1,
        cacheKeysEvicted: 0,
        graphEdgesInvalidated: 0,
        dryRun: true,
        forgotAt: iso,
      }).success,
    ).toBe(false);
  });
});

describe("exportReceiptSchema", () => {
  it("parses a valid receipt", () => {
    expect(
      exportReceiptSchema.parse({
        exportId: "ex_1",
        blobUri: "s3://x",
        recordCount: 10,
        totalBytes: 1024,
        exportedAt: iso,
      }).recordCount,
    ).toBe(10);
  });

  it("rejects empty exportId", () => {
    expect(
      exportReceiptSchema.safeParse({
        exportId: "",
        blobUri: "s3://x",
        recordCount: 0,
        totalBytes: 0,
        exportedAt: iso,
      }).success,
    ).toBe(false);
  });
});

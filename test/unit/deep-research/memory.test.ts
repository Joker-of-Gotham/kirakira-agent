import { describe, expect, it } from "vitest";
import type {
  MemoryBundle,
  MemoryService,
  RecallRequest,
  RetrievalTrace,
} from "@kirakira/memory-core";
import {
  extractMemoryCitations,
  memoryProviderFromService,
} from "../../../packages/deep-research/src/index.js";

const trace: RetrievalTrace = {
  traceId: "trace-1",
  queryId: "query-1",
  normalizedQuery: "research memory",
  routePlan: ["vector", "graph"],
  routes: [
    {
      routeName: "vector",
      candidates: [{ recordId: "rec-1", score: 0.9, rank: 1 }],
      filters: {},
      durationMs: 12,
    },
  ],
  fusionScores: [{ recordId: "rec-1", score: 0.82, selected: true }],
  rerankScores: [{ recordId: "rec-1", score: 0.91, reason: "strong match" }],
  budgetLevel: "L3",
  totalDurationMs: 20,
  createdAt: "2026-06-08T00:00:00.000Z",
};

const bundle: MemoryBundle = {
  id: "bundle-1",
  queryId: "query-1",
  context: {
    queryId: "query-1",
    totalEstimatedTokens: 128,
    levels: {
      l0: {
        level: "L0",
        abstract: "Prior architecture research",
        entityCount: 1,
        estimatedTokens: 16,
      },
      l1: {
        level: "L1",
        factSummaries: ["Fact A"],
        stateSummary: "State summary",
        observationSummaries: [],
        estimatedTokens: 32,
      },
      l2: {
        level: "L2",
        cards: [
          {
            id: "card-1",
            kind: "fact",
            summary: "Structured card summary",
            provenance: "ev-1, ev-2",
            routeReason: "semantic match",
            score: 0.77,
          },
        ],
        estimatedTokens: 48,
      },
      l3: {
        level: "L3",
        evidence: [
          {
            id: "ev-1",
            sourceRecordId: "rec-1",
            rawSpan: "Relevant raw span",
            artifactPointer: "artifact://doc-1#L10",
            graphPath: ["Run", "Fact"],
          },
        ],
        estimatedTokens: 64,
      },
    },
  },
  trace,
  recordIds: ["rec-1"],
  totalTokens: 128,
  createdAt: "2026-06-08T00:00:00.000Z",
};

describe("memory citation extraction", () => {
  it("maps L3 evidence and L2 provenance into stable research citations", () => {
    const citations = extractMemoryCitations(bundle);

    expect(citations).toContainEqual(
      expect.objectContaining({
        id: "memory:rec-1:ev-1",
        sourceKind: "memory",
        traceId: "trace-1",
        queryId: "query-1",
        sourceRecordId: "rec-1",
        evidenceIds: ["ev-1"],
        artifactPointer: "artifact://doc-1#L10",
        score: 0.91,
        rawSpan: "Relevant raw span",
      }),
    );
    expect(citations).toContainEqual(
      expect.objectContaining({
        id: "memory:card-1",
        provenanceIds: ["ev-1", "ev-2"],
        summary: "Structured card summary",
        score: 0.77,
      }),
    );
  });

  it("uses MemoryService recall without concrete memory backends", async () => {
    const calls: RecallRequest[] = [];
    const memory: Pick<MemoryService, "recall" | "explainRetrieval"> = {
      async recall(request) {
        calls.push(request);
        return bundle;
      },
      async explainRetrieval() {
        return trace;
      },
    };
    const adapter = memoryProviderFromService(memory, {
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      tokenBudget: 256,
      limit: 5,
    });

    const evidence = await adapter.search({
      taskId: "task-1",
      query: "research memory",
      sourceKind: "memory",
      limits: { maxDepth: 3, maxBreadth: 4, maxToolCalls: 24 },
      requireCitations: true,
    });

    expect(calls[0]).toMatchObject({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      query: "research memory",
      tokenBudget: 256,
      limit: 5,
      level: "L3",
      includeRedacted: false,
    });
    expect(evidence[0]?.citations).toHaveLength(2);
    expect(evidence[0]?.metadata).toMatchObject({
      bundleId: "bundle-1",
      traceId: "trace-1",
      recordIds: ["rec-1"],
    });
  });
});

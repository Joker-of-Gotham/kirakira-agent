import type {
  ContextLevel,
  MemoryBundle,
  MemoryService,
  RecallRequest,
  RetrievalTrace,
} from "@kirakira/memory-core";

import type {
  ResearchCitation,
  ResearchEvidence,
  ResearchSourceAdapter,
  ResearchSourceRequest,
} from "./types.js";

export type MemoryRecallPort = Pick<
  MemoryService,
  "recall" | "explainRetrieval"
>;

export interface MemorySourceAdapterOptions {
  tenantId: string;
  workspaceId: string;
  namespace?: RecallRequest["namespace"];
  kinds?: RecallRequest["kinds"];
  runId?: string;
  sessionId?: string;
  tokenBudget?: number;
  limit?: number;
  level?: ContextLevel;
  includeRedacted?: boolean;
}

export function extractMemoryCitations(
  bundle: MemoryBundle,
): ResearchCitation[] {
  const routeNames = extractRouteNames(bundle.trace);
  const citations = new Map<string, ResearchCitation>();

  for (const evidence of bundle.context.levels.l3?.evidence ?? []) {
    const id = `memory:${evidence.sourceRecordId}:${evidence.id}`;
    citations.set(id, {
      id,
      sourceKind: "memory",
      title: evidence.id,
      summary: evidence.rawSpan,
      traceId: bundle.trace.traceId,
      queryId: bundle.queryId,
      sourceRecordId: evidence.sourceRecordId,
      evidenceIds: [evidence.id],
      artifactPointer: evidence.artifactPointer,
      routeNames,
      score: scoreForRecord(bundle.trace, evidence.sourceRecordId),
      rawSpan: evidence.rawSpan,
      metadata: {
        graphPath: evidence.graphPath,
        checkpointState: evidence.checkpointState,
      },
    });
  }

  for (const card of bundle.context.levels.l2?.cards ?? []) {
    const provenanceIds = parseProvenanceIds(card.provenance);
    const sourceRecordId = provenanceIds[0];
    const id = `memory:${card.id}`;
    citations.set(id, {
      id,
      sourceKind: "memory",
      title: card.kind,
      summary: card.summary,
      traceId: bundle.trace.traceId,
      queryId: bundle.queryId,
      sourceRecordId,
      evidenceIds: provenanceIds,
      provenanceIds,
      routeNames,
      score: card.score,
      metadata: {
        routeReason: card.routeReason,
      },
    });
  }

  if (citations.size === 0) {
    for (const recordId of bundle.recordIds) {
      citations.set(`memory:${recordId}`, {
        id: `memory:${recordId}`,
        sourceKind: "memory",
        traceId: bundle.trace.traceId,
        queryId: bundle.queryId,
        sourceRecordId: recordId,
        routeNames,
        score: scoreForRecord(bundle.trace, recordId),
      });
    }
  }

  return [...citations.values()];
}

export function memoryProviderFromService(
  memory: MemoryRecallPort,
  options: MemorySourceAdapterOptions,
): ResearchSourceAdapter {
  return {
    kind: "memory",
    async search(request: ResearchSourceRequest): Promise<ResearchEvidence[]> {
      const bundle = await memory.recall({
        tenantId: options.tenantId,
        workspaceId: options.workspaceId,
        query: request.query,
        namespace: options.namespace,
        kinds: options.kinds,
        runId: options.runId,
        sessionId: options.sessionId,
        tokenBudget: options.tokenBudget,
        limit: options.limit,
        level: options.level ?? "L3",
        includeRedacted: options.includeRedacted ?? false,
      });
      const citations = extractMemoryCitations(bundle);

      return [
        {
          id: `memory-evidence:${bundle.id}`,
          sourceKind: "memory",
          query: request.query,
          title: "Workspace memory recall",
          summary: bundle.context.levels.l0.abstract,
          content: bundle.context.levels.l1?.stateSummary,
          citations,
          metadata: {
            bundleId: bundle.id,
            queryId: bundle.queryId,
            traceId: bundle.trace.traceId,
            recordIds: bundle.recordIds,
            totalTokens: bundle.totalTokens,
          },
        },
      ];
    },
  };
}

function parseProvenanceIds(provenance: string): string[] {
  return provenance
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractRouteNames(trace: RetrievalTrace): string[] {
  const names = [
    ...trace.routePlan,
    ...trace.routes.map((route) => route.routeName),
  ];
  return [...new Set(names)];
}

function scoreForRecord(
  trace: RetrievalTrace,
  recordId: string,
): number | undefined {
  const rerank = trace.rerankScores.find((item) => item.recordId === recordId);
  if (rerank) {
    return rerank.score;
  }
  return trace.fusionScores.find((item) => item.recordId === recordId)?.score;
}

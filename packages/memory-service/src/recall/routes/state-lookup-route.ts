import type { MemoryRecord, RecallRoute, RecallRouteInput, RecallRouteResult } from "@kirakira/memory-core";
import type { RouteExplanation } from "@kirakira/memory-core";
import type { StoreAdapter } from "@kirakira/memory-core";

export class StateLookupRecallRoute implements RecallRoute {
  readonly name = "state";
  constructor(
    readonly weight: number,
    private readonly store: StoreAdapter,
  ) {}

  async execute(input: RecallRouteInput): Promise<RecallRouteResult> {
    const start = performance.now();
    const metaFilters: string[] = [];
    const records: Array<{ record: MemoryRecord; score: number }> = [];

    if (input.runId) {
      metaFilters.push(`run:${input.runId}`);
      const cps = await this.store.listCheckpoints(input.runId);
      for (let i = 0; i < Math.min(3, cps.length); i++) {
        const cp = cps[i]!;
        const row: MemoryRecord = {
          id: cp.id,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          namespace: "agent",
          kind: "checkpoint",
          text: JSON.stringify(cp.stateJson).slice(0, 2000),
          summaryL0: `checkpoint step ${cp.stepNo}`,
          metadata: {
            runId: input.runId,
            checkpoint: true,
            stepNo: cp.stepNo,
          },
          evidenceIds: [],
          entityIds: [],
          txFrom: cp.createdAt,
          retentionClass: "default",
          piiLevel: "none",
          redacted: false,
          createdAt: cp.createdAt,
        };
        records.push({ record: row, score: 1 / (i + 1) });
      }
    }

    if (input.sessionId) {
      metaFilters.push(`session:${input.sessionId}`);
      const eps = await this.store.queryRecords({
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        kinds: ["episode"],
        limit: input.limit * 2,
      });
      for (const r of eps) {
        if (r.metadata["sessionId"] === input.sessionId) {
          records.push({ record: r, score: 0.5 });
        }
      }
    }

    const sliced = records.slice(0, input.limit);
    const explanation: RouteExplanation = {
      routeName: this.name,
      candidates: sliced.map((r, i) => ({
        recordId: r.record.id,
        score: r.score,
        rank: i + 1,
      })),
      filters: { metaFilters, runId: input.runId, sessionId: input.sessionId },
      durationMs: performance.now() - start,
    };

    return { records: sliced, explanation };
  }
}

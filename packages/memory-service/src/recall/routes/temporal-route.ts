import type { MemoryRecord, RecallRoute, RecallRouteInput, RecallRouteResult } from "@kirakira/memory-core";
import type { RouteExplanation } from "@kirakira/memory-core";
import type { StoreAdapter } from "@kirakira/memory-core";

export class TemporalRecallRoute implements RecallRoute {
  readonly name = "temporal";
  constructor(
    readonly weight: number,
    private readonly store: StoreAdapter,
  ) {}

  async execute(input: RecallRouteInput): Promise<RecallRouteResult> {
    const start = performance.now();
    const window = input.timeWindow;
    if (!window?.from && !window?.to) {
      return {
        records: [],
        explanation: {
          routeName: this.name,
          candidates: [],
          filters: { reason: "no_time_window" },
          durationMs: performance.now() - start,
        },
      };
    }

    const validAt = window.to ?? window.from ?? new Date().toISOString();
    const rows = await this.store.queryRecords({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      validAt,
      limit: input.limit * 2,
      tombstoned: false,
    });

    const fromMs = window.from ? Date.parse(window.from) : -Infinity;
    const toMs = window.to ? Date.parse(window.to) : Infinity;

    const filtered = rows.filter((r) => {
      const vf = r.validFrom ? Date.parse(r.validFrom) : -Infinity;
      const vt = r.validTo ? Date.parse(r.validTo) : Infinity;
      return vf <= toMs && vt >= fromMs;
    });

    const records: Array<{ record: MemoryRecord; score: number }> = filtered.slice(0, input.limit).map((r, i) => ({
      record: r,
      score: 1 / (i + 1),
    }));

    const explanation: RouteExplanation = {
      routeName: this.name,
      candidates: records.map((r, i) => ({
        recordId: r.record.id,
        score: r.score,
        rank: i + 1,
      })),
      filters: { window },
      durationMs: performance.now() - start,
    };

    return { records, explanation };
  }
}

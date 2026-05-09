import type { MemoryRecord } from "@kirakira/memory-core";

export interface CoverageDimensions {
  readonly entities: Set<string>;
  readonly timeBuckets: Set<string>;
  readonly evidenceTypes: Set<string>;
}

export function measureRecordCoverage(records: MemoryRecord[]): CoverageDimensions {
  const entities = new Set<string>();
  const timeBuckets = new Set<string>();
  const evidenceTypes = new Set<string>();
  for (const r of records) {
    for (const e of r.entityIds) {
      entities.add(e);
    }
    if (r.validFrom) {
      timeBuckets.add(r.validFrom.slice(0, 10));
    }
    for (const ev of r.evidenceIds) {
      evidenceTypes.add(ev);
    }
    evidenceTypes.add(r.kind);
  }
  return { entities, timeBuckets, evidenceTypes };
}

/** Score in [0,1]: rewards broader coverage across entities, dates, and evidence/kind variety. */
export function coverageScore(dim: CoverageDimensions): number {
  const a = Math.min(1, dim.entities.size / 8);
  const b = Math.min(1, dim.timeBuckets.size / 4);
  const c = Math.min(1, dim.evidenceTypes.size / 6);
  return Number((0.4 * a + 0.35 * b + 0.25 * c).toFixed(4));
}

export function coverageGainForRecord(
  current: CoverageDimensions,
  candidate: MemoryRecord,
): number {
  const nextEntities = new Set(current.entities);
  const nextBuckets = new Set(current.timeBuckets);
  const nextTypes = new Set(current.evidenceTypes);
  for (const e of candidate.entityIds) {
    nextEntities.add(e);
  }
  if (candidate.validFrom) {
    nextBuckets.add(candidate.validFrom.slice(0, 10));
  }
  for (const ev of candidate.evidenceIds) {
    nextTypes.add(ev);
  }
  nextTypes.add(candidate.kind);
  const before = coverageScore(current);
  const after = coverageScore({
    entities: nextEntities,
    timeBuckets: nextBuckets,
    evidenceTypes: nextTypes,
  });
  return Math.max(0, after - before);
}

/**
 * Decides when raw facts should roll up into observations / beliefs.
 */
export class ConsolidationScheduler {
  shouldConsolidate(groupSize: number, maxAgeMs: number, oldestCreatedAt: string, nowMs: number): boolean {
    if (groupSize < 2) return false;
    const age = nowMs - Date.parse(oldestCreatedAt);
    if (groupSize >= 5) return true;
    return age > maxAgeMs && groupSize >= 2;
  }

  maxGroupsPerRun(requested: number | undefined): number {
    const cap = typeof requested === "number" && requested > 0 ? requested : 32;
    return Math.min(cap, 256);
  }
}

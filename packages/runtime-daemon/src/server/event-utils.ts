import type { EventFilter, RunEvent } from "@kirakira/runtime-contracts";

export function eventMatchesSubscription(
  ev: RunEvent,
  subscriptionRunId?: string,
  filter?: EventFilter,
): boolean {
  if (subscriptionRunId !== undefined && ev.runId !== subscriptionRunId) {
    return false;
  }
  if (filter?.runId !== undefined && ev.runId !== filter.runId) {
    return false;
  }
  if (filter?.kinds !== undefined && filter.kinds.length > 0) {
    if (!filter.kinds.includes(ev.kind)) return false;
  }
  if (filter?.after !== undefined && ev.id <= filter.after) {
    return false;
  }
  if (filter?.before !== undefined && ev.id >= filter.before) {
    return false;
  }
  return true;
}

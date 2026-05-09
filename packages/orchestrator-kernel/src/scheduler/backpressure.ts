import type { BackpressureState, ResourceBudgets, SchedulerState } from "../types.js";

export type ThrottleListener = (state: BackpressureState) => void;

export class BackpressureController {
  private throttled = false;
  private reason?: string;
  private since?: string;
  private readonly listeners = new Set<ThrottleListener>();

  subscribe(fn: ThrottleListener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  check(state: SchedulerState): BackpressureState {
    const throttle = this.shouldThrottle(state.budgets);
    const next: BackpressureState = throttle
      ? {
          isThrottled: true,
          ...(this.reason !== undefined ? { reason: this.reason } : {}),
          ...(this.since !== undefined ? { throttledSince: this.since } : {}),
        }
      : { isThrottled: false };
    state.backpressure = next;
    return next;
  }

  shouldThrottle(budgets: ResourceBudgets): boolean {
    const keys = Object.keys(budgets) as (keyof ResourceBudgets)[];
    return keys.some((k) => {
      const b = budgets[k];
      return b.limit > 0 && b.used + b.reserved >= b.limit;
    });
  }

  onThrottle(reason?: string): void {
    if (this.throttled) return;
    this.throttled = true;
    this.reason = reason;
    this.since = new Date().toISOString();
    this.emit({
      isThrottled: true,
      ...(reason ? { reason } : {}),
      throttledSince: this.since,
    });
  }

  onRelease(): void {
    if (!this.throttled) return;
    this.throttled = false;
    this.reason = undefined;
    this.since = undefined;
    this.emit({ isThrottled: false });
  }

  private emit(state: BackpressureState): void {
    for (const fn of this.listeners) fn(state);
  }
}

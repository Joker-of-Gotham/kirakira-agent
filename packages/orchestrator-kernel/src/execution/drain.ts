import type { CheckpointSnapshot, KernelState } from "../types.js";

export class DrainController {
  private draining = false;

  requestDrain(): void {
    this.draining = true;
  }

  isDraining(): boolean {
    return this.draining;
  }

  canContinue(runningCount: number, schedulableCount: number): boolean {
    if (!this.draining) return true;
    return runningCount > 0 || schedulableCount > 0;
  }

  onDrainComplete(state: KernelState): CheckpointSnapshot {
    const id = `drain-${state.runId}-${Date.now()}`;
    return {
      id,
      savedAt: new Date().toISOString(),
      state: structuredClone(state),
    };
  }

  reset(): void {
    this.draining = false;
  }
}

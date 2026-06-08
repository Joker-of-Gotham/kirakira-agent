import type { TaskGraph } from "../types.js";

export interface SuperstepEvent {
  runId: string;
  stepIndex: number;
  completedNodes: number;
  remainingNodes: number;
  timestamp: string;
}

export type SuperstepListener = (event: SuperstepEvent) => void;

export class SuperstepManager {
  private dispatched = 0;
  private inFlight = 0;
  private stepIndex = 0;
  private listeners: SuperstepListener[] = [];

  constructor(private readonly minBatch = 2) {}

  onSuperstep(listener: SuperstepListener): void {
    this.listeners.push(listener);
  }

  notifyDispatched(batchSize: number): void {
    this.dispatched += batchSize;
  }

  notifyStarted(): void {
    this.inFlight += 1;
  }

  notifyFinished(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
  }

  detectBoundary(graph: TaskGraph): boolean {
    if (this.inFlight > 0) return false;
    if (this.dispatched < this.minBatch) return false;

    const completedCount = [...graph.nodes.values()].filter(
      (n) => n.status === "completed" || n.status === "failed",
    ).length;
    const totalNodes = graph.nodes.size;
    if (completedCount === 0) return false;

    return completedCount < totalNodes;
  }

  onBoundary(runId: string): void {
    this.stepIndex += 1;
    const event: SuperstepEvent = {
      runId,
      stepIndex: this.stepIndex,
      completedNodes: this.dispatched,
      remainingNodes: 0,
      timestamp: new Date().toISOString(),
    };
    for (const listener of this.listeners) {
      listener(event);
    }
    this.dispatched = 0;
  }

  getStepIndex(): number {
    return this.stepIndex;
  }

  reset(): void {
    this.dispatched = 0;
    this.inFlight = 0;
    this.stepIndex = 0;
  }
}

import type { WorkerState, WorkerSummary } from "@kirakira/agent-runtime";
import type { RunEvent } from "@kirakira/event-store";
import type { OrchestratorKernel } from "@kirakira/orchestrator-kernel/daemon-orchestrator";

export class RuntimeBridge {
  private readonly kernel: OrchestratorKernel;

  constructor(kernel: OrchestratorKernel) {
    this.kernel = kernel;
  }

  getWorkerStatus(workerId: string): WorkerState {
    return this.kernel.getRuntime().getWorkerStatus(workerId);
  }

  listActiveWorkers(): WorkerSummary[] {
    return this.kernel.getRuntime().listActiveWorkers();
  }

  terminateWorker(workerId: string): Promise<void> {
    return this.kernel.getRuntime().terminateWorker(workerId);
  }

  forwardWorkerEvents(handler: (event: RunEvent) => void): () => void {
    return this.kernel.onEvent(handler);
  }
}

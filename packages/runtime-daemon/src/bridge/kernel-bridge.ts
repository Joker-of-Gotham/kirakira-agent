import { EventWriter } from "@kirakira/event-store";
import { OrchestratorKernel } from "@kirakira/orchestrator-kernel/daemon-orchestrator";
import type {
  ControlMessage,
  RunEvent,
  RuntimeRunMode,
  RuntimeRunOptions,
} from "@kirakira/runtime-contracts";

type RunMode = RuntimeRunMode;
type RunOptions = RuntimeRunOptions;

export class KernelBridge {
  private readonly eventStoreBasePath?: string;
  private kernel: OrchestratorKernel | null = null;

  constructor(eventStoreBasePath?: string) {
    this.eventStoreBasePath = eventStoreBasePath;
  }

  async create(): Promise<void> {
    const writer = new EventWriter({ basePath: this.eventStoreBasePath ?? "" });
    this.kernel = new OrchestratorKernel(writer);
    await this.kernel.start();
  }

  async destroy(): Promise<void> {
    if (this.kernel) {
      await this.kernel.stop();
      this.kernel = null;
    }
  }

  getKernel(): OrchestratorKernel {
    if (!this.kernel) {
      throw new Error("Orchestrator kernel not initialized");
    }
    return this.kernel;
  }

  submitRun(prompt: string, mode: RunMode, options?: RunOptions): Promise<string> {
    return this.getKernel().submitRun(prompt, mode, options);
  }

  forwardControl(message: ControlMessage): void {
    this.getKernel().forwardControl(message);
  }

  onEvent(handler: (event: RunEvent) => void): () => void {
    return this.getKernel().onEvent(handler);
  }
}

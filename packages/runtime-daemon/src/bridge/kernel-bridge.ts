import { join } from "node:path";
import type { ResolvedConfig } from "@kirakira/core";
import {
  EventWriter,
  FsCheckpointRepository,
  resolveEventStoreBasePath,
} from "@kirakira/event-store";
import {
  OrchestratorKernel,
  type OrchestratorKernelOptions,
} from "@kirakira/orchestrator-kernel/daemon-orchestrator";
import { DelegateRunnerSubagentBridge } from "@kirakira/orchestrator-kernel";
import type {
  ControlMessage,
  RunEvent,
  RuntimeRunMode,
  RuntimeRunOptions,
} from "@kirakira/runtime-contracts";
import {
  createDaemonDelegateRuntime,
  type DaemonDelegateRuntime,
  type DaemonDelegateRuntimeOptions,
} from "./runtime-deps.js";
import {
  createDaemonDeepResearchKernelOptions,
  type DaemonDeepResearchOptions,
} from "./deep-research.js";

type RunMode = RuntimeRunMode;
type RunOptions = RuntimeRunOptions;

export interface KernelBridgeOptions {
  workspaceRoot?: string;
  mcpConfigPath?: string;
  runtimeProfileName?: string;
  enableDaemonSubagents?: boolean;
  resolvedConfig?: Pick<ResolvedConfig, "agentToml" | "runtimeState">;
  deepResearch?: DaemonDeepResearchOptions;
  kernelOptions?: Omit<OrchestratorKernelOptions, "subagentBridge">;
  delegateRuntimeFactory?: (
    options: DaemonDelegateRuntimeOptions,
  ) => Promise<DaemonDelegateRuntime>;
}

export class KernelBridge {
  private readonly eventStoreBasePath?: string;
  private readonly options: KernelBridgeOptions;
  private kernel: OrchestratorKernel | null = null;
  private delegateRuntime: DaemonDelegateRuntime | null = null;
  private unsubKernelEvents: (() => void) | null = null;
  private readonly eventHandlers = new Set<(event: RunEvent) => void>();

  constructor(eventStoreBasePath?: string, options: KernelBridgeOptions = {}) {
    this.eventStoreBasePath = eventStoreBasePath;
    this.options = options;
  }

  async create(): Promise<void> {
    const basePath = resolveEventStoreBasePath(this.eventStoreBasePath);
    const writer = new EventWriter({ basePath });
    const kernelOptions = this.options.kernelOptions ?? {};
    const workspaceRoot =
      this.options.workspaceRoot ??
      process.env.KIRAKIRA_WORKSPACE_ROOT ??
      process.cwd();
    const deepResearch = createDaemonDeepResearchKernelOptions({
      resolvedConfig: this.options.resolvedConfig,
      kernelDeepResearch: kernelOptions.deepResearch,
      daemonDeepResearch: this.options.deepResearch,
    });
    let subagentBridge: DelegateRunnerSubagentBridge | undefined;
    if (this.options.enableDaemonSubagents !== false) {
      const delegateRuntimeFactory =
        this.options.delegateRuntimeFactory ?? createDaemonDelegateRuntime;
      this.delegateRuntime = await delegateRuntimeFactory({
        workspaceRoot,
        ...(this.options.mcpConfigPath !== undefined
          ? { mcpConfigPath: this.options.mcpConfigPath }
          : {}),
        eventWriter: {
          emit: async (event) => {
            this.dispatchEvent(writer.append(event));
          },
        },
      });
      subagentBridge = new DelegateRunnerSubagentBridge(this.delegateRuntime.delegateRunner);
    }
    this.kernel = new OrchestratorKernel(writer, {
      ...kernelOptions,
      ...(deepResearch !== undefined ? { deepResearch } : {}),
      ...(subagentBridge !== undefined ? { subagentBridge } : {}),
      checkpointRepository:
        kernelOptions.checkpointRepository ??
        new FsCheckpointRepository(join(basePath, "_graph_checkpoints")),
      checkpointDurability: kernelOptions.checkpointDurability ?? "async",
    });
    this.unsubKernelEvents = this.kernel.onEvent((event) => {
      this.dispatchEvent(event);
    });
    await this.kernel.start();
  }

  async destroy(): Promise<void> {
    if (this.unsubKernelEvents) {
      this.unsubKernelEvents();
      this.unsubKernelEvents = null;
    }
    if (this.kernel) {
      await this.kernel.stop();
      this.kernel = null;
    }
    if (this.delegateRuntime) {
      await this.delegateRuntime.close();
      this.delegateRuntime = null;
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
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  private dispatchEvent(event: RunEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        /* ignore handler errors */
      }
    }
  }
}

import type {
  ApprovalDecision,
  EnqueuePromptRequest,
  InspectRunRequest,
  ProvideRunInputRequest,
  ResumeRunRequest,
  RuntimeArtifactContent,
  RuntimeArtifactContentRequest,
  RuntimeMcpListRequest,
  RuntimeMcpListResult,
  RuntimeMcpToolCallRequest,
  RuntimeMcpToolCallResult,
  RuntimeTransportEvent,
  RuntimeTransportStatus,
  SteerRunRequest,
  SubmitPromptRequest,
  SubscribeRunOptions,
  Unsubscribe,
} from "@kirakira/frontend-core";

export interface KirakiraDesktopRuntimeBridge {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): Promise<RuntimeTransportStatus>;
  submitPrompt(request: SubmitPromptRequest): Promise<{ runId: string }>;
  getState(runId: string): Promise<{ runId: string; state: unknown }>;
  getArtifactContent(request: RuntimeArtifactContentRequest): Promise<RuntimeArtifactContent>;
  listMcpTools(request?: RuntimeMcpListRequest): Promise<RuntimeMcpListResult>;
  callMcpTool(request: RuntimeMcpToolCallRequest): Promise<RuntimeMcpToolCallResult>;
  subscribeRun(
    runId: string,
    options: SubscribeRunOptions | undefined,
    callback: (event: RuntimeTransportEvent) => void,
  ): Unsubscribe;
  steer(request: SteerRunRequest): Promise<void>;
  enqueue(request: EnqueuePromptRequest): Promise<void>;
  approve(decision: ApprovalDecision): Promise<void>;
  provideInput(request: ProvideRunInputRequest): Promise<void>;
  resume(request: ResumeRunRequest): Promise<void>;
  inspect(request: InspectRunRequest): Promise<{ runId: string; state: unknown }>;
  cancel(runId: string, reason?: string): Promise<void>;
  drain(): Promise<void>;
}

declare global {
  interface Window {
    kirakiraRuntime?: KirakiraDesktopRuntimeBridge;
  }
}

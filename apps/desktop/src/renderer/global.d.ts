import type {
  ApprovalDecision,
  RuntimeArtifactContent,
  RuntimeArtifactContentRequest,
  RuntimeMcpToolCallRequest,
  RuntimeMcpToolCallResult,
  RuntimeTransportEvent,
  RuntimeTransportStatus,
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
  callMcpTool(request: RuntimeMcpToolCallRequest): Promise<RuntimeMcpToolCallResult>;
  subscribeRun(
    runId: string,
    options: SubscribeRunOptions | undefined,
    callback: (event: RuntimeTransportEvent) => void,
  ): Unsubscribe;
  approve(decision: ApprovalDecision): Promise<void>;
  cancel(runId: string, reason?: string): Promise<void>;
  drain(): Promise<void>;
}

declare global {
  interface Window {
    kirakiraRuntime?: KirakiraDesktopRuntimeBridge;
  }
}

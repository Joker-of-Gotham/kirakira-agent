import type {
  ApprovalDecision,
  RuntimeTransportEvent,
  SubmitPromptRequest,
  SubscribeRunOptions,
  Unsubscribe,
} from "@kirakira/frontend-core";

export interface KirakiraDesktopRuntimeBridge {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  submitPrompt(request: SubmitPromptRequest): Promise<{ runId: string }>;
  getState(runId: string): Promise<{ runId: string; state: unknown }>;
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

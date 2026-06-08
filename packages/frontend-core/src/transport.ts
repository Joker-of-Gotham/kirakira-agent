import type {
  EventFilter,
  RunEvent,
  RuntimeRunMode,
  RuntimeRunOptions,
} from "@kirakira/runtime-contracts";

export type RuntimeTransportMode = "browser-gateway" | "desktop-ipc" | "mock";
export type RuntimeConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "degraded"
  | "disconnected";

export type Unsubscribe = () => void;

export interface SubmitPromptRequest {
  prompt: string;
  mode?: RuntimeRunMode;
  options?: RuntimeRunOptions;
}

export interface ApprovalDecision {
  runId: string;
  ticketId: string;
  decision: "approve" | "reject";
  reason?: string;
}

export interface RuntimeTransportSnapshot {
  runId: string;
  state: unknown;
}

export type RuntimeTransportEvent =
  | { type: "connection"; state: RuntimeConnectionState; detail?: string }
  | { type: "event"; event: RunEvent }
  | { type: "error"; message: string; detail?: unknown };

export interface SubscribeRunOptions {
  filter?: EventFilter;
  afterSeq?: number;
}

export interface RuntimeTransport {
  readonly mode: RuntimeTransportMode;
  connect(): Promise<void>;
  disconnect(): void;
  submitPrompt(request: SubmitPromptRequest): Promise<{ runId: string }>;
  getState(runId: string): Promise<RuntimeTransportSnapshot>;
  subscribeRun(
    runId: string,
    onEvent: (event: RuntimeTransportEvent) => void,
    options?: SubscribeRunOptions,
  ): Unsubscribe;
  approve(decision: ApprovalDecision): Promise<void>;
  cancel(runId: string, reason?: string): Promise<void>;
  drain(): Promise<void>;
}

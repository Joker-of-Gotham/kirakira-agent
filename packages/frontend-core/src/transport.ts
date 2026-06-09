import type {
  EventFilter,
  RunEvent,
  RuntimeArtifactContent,
  RuntimeArtifactContentRequest,
  RuntimeBrowserGatewayHealth,
  RuntimeDaemonHealth,
  RuntimeMcpListRequest,
  RuntimeMcpListResult,
  RuntimeMcpToolCallRequest,
  RuntimeMcpToolCallResult,
  RuntimeRunMode,
  RuntimeRunOptions,
} from "@kirakira/runtime-contracts";

export type {
  RuntimeArtifactContent,
  RuntimeArtifactContentRequest,
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

export type RuntimeTransportStatusState = "healthy" | "unavailable" | "unknown";

export interface RuntimeTransportStatus {
  mode: RuntimeTransportMode;
  state: RuntimeTransportStatusState;
  label: string;
  detail?: string;
  health?: RuntimeBrowserGatewayHealth | RuntimeDaemonHealth;
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
  getStatus?(): Promise<RuntimeTransportStatus>;
  submitPrompt(request: SubmitPromptRequest): Promise<{ runId: string }>;
  getState(runId: string): Promise<RuntimeTransportSnapshot>;
  getArtifactContent(request: RuntimeArtifactContentRequest): Promise<RuntimeArtifactContent>;
  listMcpTools(request?: RuntimeMcpListRequest): Promise<RuntimeMcpListResult>;
  callMcpTool(request: RuntimeMcpToolCallRequest): Promise<RuntimeMcpToolCallResult>;
  subscribeRun(
    runId: string,
    onEvent: (event: RuntimeTransportEvent) => void,
    options?: SubscribeRunOptions,
  ): Unsubscribe;
  approve(decision: ApprovalDecision): Promise<void>;
  cancel(runId: string, reason?: string): Promise<void>;
  drain(): Promise<void>;
}

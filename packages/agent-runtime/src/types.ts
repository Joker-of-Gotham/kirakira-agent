import type { SandboxProfile } from "@kirakira/core";

export interface Turn {
  id: string;
  seq: number;
  startedAt: string;
  completedAt?: string;
  action?: Action;
  observation?: Observation;
  tokenUsage: TokenUsage;
}

export interface Action {
  kind: "tool_call" | "skill_exec" | "sandbox_exec" | "final_output" | "delegate";
  toolName?: string;
  args?: Record<string, unknown>;
  output?: string;
}

export interface Observation {
  content: string;
  artifactRefs?: string[];
  truncated?: boolean;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface WorkingSet {
  systemPrompt: string;
  messages: Message[];
  toolSchemas: ToolSchema[];
  skillHints: SkillHint[];
  artifactIndex: ArtifactRef[];
  totalTokenEstimate: number;
}

export interface ContextBudget {
  maxTokens: number;
  reservedForOutput: number;
  toolSchemaAllocation: number;
  skillHintAllocation: number;
  historyAllocation: number;
}

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  policyHints?: {
    approvalRequired: boolean;
    riskLevel: string;
  };
}

export interface SkillHint {
  name: string;
  description: string;
  version: string;
  tier: "advertised" | "loaded" | "materialized";
}

export interface ArtifactRef {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  hash: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface Workspace {
  id: string;
  rootPath: string;
  sandboxProfile: string;
  artifacts: Map<string, Artifact>;
}

export interface Artifact {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  size: number;
  hash: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface SandboxSession {
  id: string;
  workspaceId: string;
  profile: string;
  status: "active" | "suspended" | "closed";
  startedAt: string;
  closedAt?: string;
}

export type WorkloadType =
  | "supervisor"
  | "planner"
  | "executor"
  | "reviewer"
  | "summarizer"
  | "router";

/** ReAct loop worker configuration (`ReactWorkerConfig` in public API). */
export interface ReactWorkerConfig {
  id: string;
  runId: string;
  parentWorkerId?: string;
  workloadType: WorkloadType;
  model: string;
  systemPrompt: string;
  contextBudget: ContextBudget;
  maxTurns: number;
  costBudgetUsd?: number;
  toolScope?: string[];
  skillScope?: string[];
  mcpServers?: string[];
  sandboxProfile?: string;
  subagentPolicy?: SubagentRuntimePolicy;
}

/** ReAct loop worker state (`ReactWorkerState` in public API). */
export interface ReactWorkerState {
  config: ReactWorkerConfig;
  turns: Turn[];
  currentTurnSeq: number;
  totalTokensUsed: number;
  totalCostUsd: number;
  status:
    | "initializing"
    | "running"
    | "waiting_approval"
    | "interrupted"
    | "completed"
    | "failed";
  interruptRequested?: boolean;
  interruptReason?: string;
  artifacts: string[];
  lastCheckpointSeq?: number;
}

export interface SkillRegistration {
  name: string;
  description: string;
  version: string;
  path: string;
}

export interface ToolSearchHit {
  name: string;
  description: string;
  score: number;
}

export interface ContextAssemblerOptions {
  toolCapabilityQuery?: string;
  taskPreamble?: string;
}

export interface ExecOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CompleteOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  onUsage?: (usage: TokenUsage) => void;
}

export interface ModelResponse {
  text: string;
  usage: TokenUsage;
  model: string;
  finishReason?: string;
}

export interface GatewayClientLike {
  complete(req: {
    prompt: string;
    model?: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{
    text: string | null;
    model: string;
    rawError?: string | null;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  }>;
}

export interface McpTraceContextCarrier {
  traceparent?: string;
  tracestate?: string;
  baggage?: string;
}

export interface McpContentBlock {
  type: string;
  [key: string]: unknown;
}

export interface McpCallToolResult {
  content: McpContentBlock[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AgentMcpToolCallRequest {
  server: string;
  tool: string;
  arguments?: Record<string, unknown>;
  runId?: string;
  traceId?: string;
  traceContext?: McpTraceContextCarrier;
  subagentId?: string;
  role?: string;
  requestedLane?: string;
  runtimeProfileName?: string;
}

export interface AgentMcpToolPolicyResult {
  effect: "allow" | "deny" | "escalate";
  reasonCodes: string[];
  approvalRequired: boolean;
  traceId: string;
  decisionId?: string;
  summary?: string;
}

export interface AgentMcpOtelMetadata {
  spanName: string;
  attributes: Record<string, string | number | boolean>;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  traceContext?: McpTraceContextCarrier;
  status?: "UNSET" | "OK" | "ERROR";
  durationMs?: number;
}

export interface AgentMcpToolCallResult {
  server: string;
  tool: string;
  success: boolean;
  content?: unknown;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  error?: string;
  latencyMs?: number;
  policy?: AgentMcpToolPolicyResult;
  trust?: Record<string, unknown>;
  audit?: Record<string, unknown>;
  otel?: AgentMcpOtelMetadata;
}

export interface AgentMcpToolGateway {
  callTool(request: AgentMcpToolCallRequest): Promise<AgentMcpToolCallResult>;
}

export interface ToolResult {
  success: boolean;
  output: string;
  artifactRefs?: string[];
  error?: string;
  approvalRequired?: boolean;
  mcp?: AgentMcpToolCallResult;
}

export interface ExitConditionMetrics {
  consecutiveErrors: number;
  maxConsecutiveErrors: number;
}

export interface ModelRoutingConfig {
  defaultModel: string;
  byWorkload: Partial<
    Record<
      WorkloadType,
      {
        primary: string;
        fallbacks: readonly string[];
      }
    >
  >;
}

export interface ProcessedResult {
  content: string;
  artifactRefs: string[];
  truncated: boolean;
}

export interface ChainStep {
  toolName: string;
  args: Record<string, unknown>;
}

export interface ChainResult {
  success: boolean;
  results: ToolResult[];
  error?: string;
}

export type KirakiradProfileClient = (name: string) => Promise<SandboxProfile | null>;

export interface FileSnapshot {
  readonly files: ReadonlyMap<string, string>;
}

export interface FileDiff {
  path: string;
  kind: "added" | "removed" | "modified";
  beforeHash?: string;
  afterHash?: string;
}

export interface InterruptToken {
  v: 1;
  tokenId: string;
  workerId: string;
  runId: string;
  issuedAt: string;
  reason?: string;
  stateSnapshot: string;
}

export type SerializedWorkerState = ReactWorkerState & { __serialized: true };

export interface WorkerConfig {
  workerId: string;
  workspaceRoot: string;
  sandboxProfileId?: string;
  traceId?: string;
  spanId?: string;
  runId?: string;
  parentWorkerId?: string;
  allowedToolNames?: string[];
  mcpServerAllowlist?: string[];
  skillAllowlist?: string[];
  modelDefault?: string;
  policyCeiling?: SandboxPolicyCeiling;
  extra?: Record<string, unknown>;
}

export interface WorkerState {
  id: string;
  runId: string;
  workloadType: string;
  status: string;
  turnCount: number;
  model: string;
}

export interface WorkerSummary {
  id: string;
  workloadType: string;
  status: string;
  turnCount: number;
  model: string;
}

export interface SandboxPolicyCeiling {
  readonly network?: "none" | "restricted" | "full";
  readonly filesystemWrite?: "deny" | "ask" | "allow";
  readonly shell?: "deny" | "ask" | "allow";
}

export interface SubagentCapability {
  kind: "tool" | "skill" | "mcp";
  name: string;
}

export interface RuntimeCapabilityScope {
  toolNames?: string[];
  skillNames?: string[];
  mcpServers?: string[];
}

export type SubagentContextMode = "isolated" | "filtered" | "inherit";

export interface SubagentRuntimePolicy {
  maxTurns?: number;
  systemPreamble?: string;
  contextMode?: SubagentContextMode;
  traceHandoffs?: boolean;
}

export interface EphemeralAgentConfig extends WorkerConfig {
  taskBrief: string;
  capabilities: SubagentCapability[];
  modelPreference?: string;
  ttlMs?: number;
}

export interface PlannerMessage {
  system: string;
  user: string;
  model?: string;
}

export interface ModelPlannerClient {
  completeText(message: PlannerMessage): Promise<string>;
}

export interface EphemeralResult {
  workerId: string;
  finalText?: string;
  error?: string;
}

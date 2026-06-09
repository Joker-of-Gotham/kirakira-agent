import type {
  ReactWorkerConfig,
  SubagentCapability,
  SubagentRuntimePolicy,
  WorkerConfig,
} from "@kirakira/agent-runtime";
import type {
  DeepResearchConfig,
  ResearchSourceKind,
} from "@kirakira/deep-research";

export type TaskNodeKind =
  | "plan"
  | "subagent"
  | "research"
  | "tool"
  | "skill-load"
  | "approval"
  | "merge"
  | "synthesize";

export type TaskStatus =
  | "pending"
  | "ready"
  | "running"
  | "completed"
  | "failed"
  | "interrupted"
  | "cancelled";

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  retryableErrors?: string[];
}

export interface TaskSpec {
  description: string;
  model?: string;
  toolScope?: string[];
  skillScope?: string[];
  mcpServers?: string[];
  timeout?: number;
  retryPolicy?: RetryPolicy;
  inputArtifactRefs?: string[];
  approvalRequired?: boolean;
  approvalCleared?: boolean;
  estimatedTokens?: number;
  subagent?: SubagentTaskContract;
  research?: ResearchTaskContract;
  [key: string]: unknown;
}

export interface TaskResult {
  output: unknown;
  artifactRefs?: string[];
  tokenUsage?: {
    prompt: number;
    completion: number;
  };
  durationMs?: number;
}

export interface TaskNode {
  id: string;
  kind: TaskNodeKind;
  spec: TaskSpec;
  status: TaskStatus;
  result?: TaskResult;
  artifactRefs?: string[];
  assignedWorkerId?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export type EdgeKind =
  | "depends_on"
  | "fanout"
  | "join"
  | "blocks_on_approval"
  | "supersedes"
  | "artifact_flow";

export interface TaskEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  metadata?: Record<string, unknown>;
}

export interface TaskGraph {
  id: string;
  runId: string;
  nodes: Map<string, TaskNode>;
  edges: TaskEdge[];
  rootNodeId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlanContext {
  workspace: string;
  availableTools: string[];
  availableSkills: string[];
  availableMcpServers?: string[];
  previousArtifacts?: string[];
  constraints?: string[];
}

export interface SubagentTaskContract {
  taskBrief: string;
  capabilities: SubagentCapability[];
  modelPreference?: string;
  runtimePolicy?: SubagentRuntimePolicy;
  policyCeiling?: WorkerConfig["policyCeiling"];
  inputArtifactRefs?: string[];
  outputSchema?: Record<string, unknown>;
}

export interface ResearchTaskContract {
  question?: string;
  subquestions?: string[];
  constraints?: string[];
  audience?: string;
  requiredSourceKinds?: ResearchSourceKind[];
  config?: DeepResearchConfig;
  metadata?: Record<string, unknown>;
}

export interface PlanStep {
  id: string;
  description: string;
  kind: TaskNodeKind;
  dependsOn: string[];
  canParallelize: boolean;
  model?: string;
  toolScope?: string[];
  skillScope?: string[];
  mcpServers?: string[];
  inputArtifactRefs?: string[];
  estimatedTokens?: number;
  approvalRequired?: boolean;
  subagent?: Partial<SubagentTaskContract>;
  research?: ResearchTaskContract;
}

export interface RunPlan {
  id: string;
  goal: string;
  context: PlanContext;
  steps: PlanStep[];
  estimatedComplexity: "simple" | "moderate" | "complex";
  requiresSubagents: boolean;
}

export type LaneType = "foreground" | "queued" | "background" | "delegated";

export interface RunningTaskInfo {
  nodeId: string;
  workerId: string;
  startedAt: string;
  lane: LaneType;
}

export interface Budget {
  limit: number;
  used: number;
  reserved: number;
}

export interface ResourceBudgets {
  modelBudget: Budget;
  sandboxSlotBudget: Budget;
  mcpQpsBudget: Budget;
  artifactIoBudget: Budget;
}

export interface LaneQueue {
  capacity: number;
  active: number;
  pending: string[];
}

export interface LaneState {
  foreground: LaneQueue;
  queued: LaneQueue;
  background: LaneQueue;
  delegated: LaneQueue;
}

export type LaneCapacities = Record<LaneType, number>;

export interface BackpressureState {
  isThrottled: boolean;
  reason?: string;
  throttledSince?: string;
}

export interface SchedulerState {
  readyQueue: string[];
  runningTasks: Map<string, RunningTaskInfo>;
  budgets: ResourceBudgets;
  lanes: LaneState;
  backpressure: BackpressureState;
}

export interface SubmitPromptPayload {
  prompt: string;
  mode: "foreground" | "queued" | "background" | "delegated";
  attachments?: string[];
  model?: string;
  constraints?: string[];
}

export interface SteerPayload {
  instruction: string;
  priority?: "high" | "normal";
}

export interface EnqueuePayload {
  prompt: string;
  priority?: number;
}

export interface ApprovalPayload {
  ticketId: string;
  decision: "approve" | "reject";
  reason?: string;
}

export interface InputPayload {
  interruptId: string;
  data: unknown;
}

export interface CancelPayload {
  runId: string;
  reason?: string;
}

export interface ResumePayload {
  runId: string;
  fromCheckpoint?: string;
  additionalContext?: string;
}

export interface InspectPayload {
  runId: string;
  includeEvents?: boolean;
}

export type ControlMessage =
  | { kind: "submit_prompt"; payload: SubmitPromptPayload }
  | { kind: "steer_now"; payload: SteerPayload }
  | { kind: "enqueue_prompt"; payload: EnqueuePayload }
  | { kind: "approve"; payload: ApprovalPayload }
  | { kind: "reject"; payload: ApprovalPayload }
  | { kind: "provide_input"; payload: InputPayload }
  | { kind: "request_drain"; payload: Record<string, never> }
  | { kind: "cancel_hard"; payload: CancelPayload }
  | { kind: "resume_run"; payload: ResumePayload }
  | { kind: "inspect_thread"; payload: InspectPayload };

export interface KernelGraphSnapshot {
  id: string;
  runId: string;
  nodes: Record<string, TaskNode>;
  edges: TaskEdge[];
  rootNodeId: string;
  createdAt: string;
  updatedAt: string;
}

export interface KernelSchedulerSnapshot {
  readyQueue: string[];
  runningTasks: Record<string, RunningTaskInfo>;
  budgets: ResourceBudgets;
  lanes: LaneState;
  backpressure: BackpressureState;
}

export interface KernelState {
  runId: string;
  planId: string;
  graph: KernelGraphSnapshot;
  scheduler: KernelSchedulerSnapshot;
  controlEpoch: number;
  lineageRootId: string;
  resumeContext?: string;
}

export type DurabilityLevel = "exit" | "async" | "sync";

export interface CheckpointContext {
  durability: DurabilityLevel;
  nextHasSideEffect: boolean;
  superstepBoundary: boolean;
  runInterruptRequested: boolean;
}

export type RunEvent =
  | { kind: "graph_normalized"; graph: TaskGraph }
  | { kind: "task_ready"; nodeId: string }
  | { kind: "task_started"; nodeId: string; lane: string; workerId: string }
  | { kind: "task_completed"; nodeId: string; result: TaskResult }
  | { kind: "task_failed"; nodeId: string; error: string }
  | { kind: "checkpoint_saved"; checkpointId: string }
  | { kind: "control_received"; message: ControlMessage }
  | { kind: "superstep_boundary"; runId: string }
  | { kind: "plan_attached"; plan: RunPlan }
  | { kind: "run_completed"; runId: string; graph: TaskGraph }
  | {
      kind: "run_failed";
      runId: string;
      code: string;
      message: string;
      nodeId?: string;
    };

export interface RoutingContext {
  interactive: boolean;
  laneHint?: LaneType;
  /** 0–100; higher = more urgent for the user; values above 50 prefer the foreground lane */
  interactivePriority?: number;
}

export interface TaskExecutor {
  execute(node: TaskNode, lane: LaneType): Promise<TaskResult>;
}

export type MergeStrategy = "concatenate" | "summarize" | "select_best" | "structured_combine";

export interface SourceAttribution {
  index: number;
  summary: unknown;
  artifactRefs?: string[];
}

export interface MergeResult {
  output: unknown;
  sources: SourceAttribution[];
  strategy: MergeStrategy;
}

export interface SubagentSpec {
  taskBrief: string;
  capabilities: SubagentCapability[];
  modelPreference?: string;
  runtimePolicy?: SubagentRuntimePolicy;
  parentWorkerId: string;
  parentTaskId?: string;
  runId: string;
  traceId?: string;
  workspaceRoot: string;
  policyCeiling?: WorkerConfig["policyCeiling"];
  inputArtifactRefs?: string[];
  outputSchema?: Record<string, unknown>;
}

export interface RuntimeSubagentBridgeRequest {
  runId: string;
  parentTaskId: string;
  parentWorkerId: string;
  parentConfig: ReactWorkerConfig;
  workspaceRoot: string;
  spec: SubagentSpec;
  lane: LaneType;
}

export interface RuntimeSubagentBridge {
  run(request: RuntimeSubagentBridgeRequest): Promise<TaskResult>;
}

export interface LineageTree {
  id: string;
  children: LineageTree[];
}

export interface InterruptToken {
  id: string;
  runId: string;
  nodeId: string;
  reason: string;
  checkpointRef?: string;
  timestamp: string;
  resumeSchema?: Record<string, unknown>;
  /** When set, `validateToken` rejects tokens at or past this instant (ISO 8601). */
  expiresAt?: string;
}

export type ResumeAction =
  | { type: "restart_node"; nodeId: string; state: KernelState }
  | { type: "continue_from"; nodeId: string; state: KernelState }
  | { type: "skip_node"; nodeId: string; state: KernelState };

export type ApprovalDecision = "approve" | "reject";

export interface PendingAction {
  ticketId?: string;
  runId: string;
  nodeId?: string;
  summary: string;
  risk: string;
  permissions?: string[];
}

export interface Action {
  kind: string;
  runId: string;
  nodeId?: string;
  payload: unknown;
}

export interface Receipt {
  ok: boolean;
  result?: unknown;
  executedAt: string;
}

export type IntentStatus = "pending" | "confirmed" | "aborted";

export interface Intent {
  intentId: string;
  action: Action;
  status: IntentStatus;
  createdAt: string;
  receipt?: Receipt;
}

export interface PreflightApprovalHint {
  nodeId: string;
  reason: string;
  edgeKinds: string[];
}

export interface PreflightResult {
  approvalsRequired: PreflightApprovalHint[];
  estimatedDelayMs: number;
}

export interface CheckpointSnapshot {
  id: string;
  savedAt: string;
  state: KernelState;
}

export interface BudgetConfig {
  modelLimit: number;
  sandboxSlotLimit: number;
  mcpQpsLimit: number;
  artifactIoLimit: number;
}

import type {
  DeepResearchConfig,
  ResearchSourcePolicy,
} from "@kirakira/core";

export type { DeepResearchConfig, ResearchSourcePolicy };

export type ResearchSourceKind = "memory" | "file" | "web" | "mcp";

export type DeepResearchOutputHeading =
  | "Answer"
  | "Evidence used"
  | "Actions taken"
  | "Open uncertainties"
  | "Failed tool calls"
  | "Recommended next step";

export interface DeepResearchLimits {
  maxDepth: number;
  maxBreadth: number;
  maxToolCalls: number;
}

export interface ResolvedDeepResearchOptions {
  enabled: boolean;
  sourcePolicy: ResearchSourcePolicy;
  limits: DeepResearchLimits;
  requireCitations: boolean;
  verificationRequired: boolean;
  workspaceRoot: string;
  workspaceDir: string;
  workspaceDirRelative: string;
  requiredSourceKinds: ResearchSourceKind[];
}

export interface DeepResearchQuestion {
  prompt: string;
  subquestions?: string[];
  constraints?: string[];
  audience?: string;
  requiredSourceKinds?: ResearchSourceKind[];
  metadata?: Record<string, unknown>;
}

export interface JsonSchemaObject {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

export interface DeepResearchCitationSchema {
  required: boolean;
  minCitationsPerFinding: number;
  acceptedSourceKinds: ResearchSourceKind[];
  includeTraceMetadata: boolean;
}

export type DeepResearchTaskKind = "research" | "synthesis";

export interface DeepResearchTask {
  id: string;
  kind: DeepResearchTaskKind;
  question: string;
  depth: number;
  dependsOn: string[];
  sourceKinds: ResearchSourceKind[];
  requiredCitations: boolean;
  outputSchema: JsonSchemaObject;
}

export interface DeepResearchSubagentContract {
  taskBrief: string;
  requiredHeadings: DeepResearchOutputHeading[];
  outputSchema: JsonSchemaObject;
}

export interface DeepResearchPlanContract {
  question: string;
  sourcePolicy: ResearchSourcePolicy;
  limits: DeepResearchLimits;
  requiredSourceKinds: ResearchSourceKind[];
  citationSchema: DeepResearchCitationSchema;
  unknowns: string[];
  subagent: DeepResearchSubagentContract;
}

export interface DeepResearchPlan extends DeepResearchPlanContract {
  id: string;
  enabled: boolean;
  createdAt: string;
  tasks: DeepResearchTask[];
}

export interface ResearchCitation {
  id: string;
  sourceKind: ResearchSourceKind;
  title?: string;
  uri?: string;
  summary?: string;
  retrievedAt?: string;
  traceId?: string;
  queryId?: string;
  sourceRecordId?: string;
  evidenceIds?: string[];
  provenanceIds?: string[];
  artifactPointer?: string;
  routeNames?: string[];
  score?: number;
  rawSpan?: string;
  metadata?: Record<string, unknown>;
}

export interface ResearchEvidence {
  id: string;
  sourceKind: ResearchSourceKind;
  query: string;
  title?: string;
  content?: string;
  summary?: string;
  citations: ResearchCitation[];
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface ResearchSourceRequest {
  taskId: string;
  query: string;
  sourceKind: ResearchSourceKind;
  limits: DeepResearchLimits;
  requireCitations: boolean;
}

export interface ResearchSourceAdapter {
  kind: ResearchSourceKind;
  search(request: ResearchSourceRequest): Promise<ResearchEvidence[]>;
}

export interface ResearchPlannerContext {
  sourceKinds: ResearchSourceKind[];
  limits: DeepResearchLimits;
  requireCitations: boolean;
}

export interface ResearchPlannerAdapter {
  refinePlan(
    plan: DeepResearchPlan,
    context: ResearchPlannerContext,
  ): Promise<DeepResearchPlan>;
}

export type DeepResearchProgressPhase =
  | "started"
  | "plan_created"
  | "task_started"
  | "source_started"
  | "source_completed"
  | "source_failed"
  | "evidence_collected"
  | "citation_added"
  | "task_completed"
  | "task_failed"
  | "limit_reached"
  | "completed"
  | "failed";

export interface DeepResearchCitationProgress {
  id: string;
  sourceKind: ResearchSourceKind;
  title?: string;
  uri?: string;
  summary?: string;
  traceId?: string;
  queryId?: string;
  sourceRecordId?: string;
  evidenceIds?: string[];
  provenanceIds?: string[];
  artifactPointer?: string;
  routeNames?: string[];
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface DeepResearchProgressEvent {
  phase: DeepResearchProgressPhase;
  researchRunId?: string;
  planId?: string;
  taskId?: string;
  taskKind?: DeepResearchTaskKind;
  depth?: number;
  dependsOn?: string[];
  sourceKind?: ResearchSourceKind;
  sourceCallId?: string;
  sourceKinds?: ResearchSourceKind[];
  limits?: DeepResearchLimits;
  requireCitations?: boolean;
  verificationRequired?: boolean;
  workspaceDirRelative?: string;
  requiredCitations?: boolean;
  toolCalls?: number;
  maxToolCalls?: number;
  evidenceCount?: number;
  citationCount?: number;
  evidenceIds?: string[];
  citationIds?: string[];
  citations?: DeepResearchCitationProgress[];
  unknowns?: string[];
  durationMs?: number;
  errorCode?: string;
  message?: string;
}

export type DeepResearchProgressSink = (
  event: DeepResearchProgressEvent,
) => void | Promise<void>;

export type DeepResearchRunStatus =
  | "disabled"
  | "planned"
  | "evidence_collected";

export interface DeepResearchRunResult {
  status: DeepResearchRunStatus;
  plan: DeepResearchPlan;
  evidence: ResearchEvidence[];
  citations: ResearchCitation[];
  unknowns: string[];
  toolCalls: number;
}

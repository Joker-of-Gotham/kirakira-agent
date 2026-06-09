import {
  DeepResearchRunner,
  resolveDeepResearchOptions,
  type DeepResearchConfig,
  type DeepResearchQuestion,
  type DeepResearchRunResult,
  type ResearchCitation,
  type ResearchEvidence,
  type ResearchPlannerAdapter,
  type ResearchSourceAdapter,
} from "@kirakira/deep-research";
import { ResearchEventBridge, type ResearchEventEmitter } from "./event-bridge.js";
import type { LaneType, TaskExecutor, TaskNode, TaskResult } from "../types.js";

export interface ResearchTaskExecutionContext {
  runId: string;
  workspaceRoot: string;
  parentWorkerId?: string;
  traceId?: string;
}

export interface ResearchTaskKernelInput extends ResearchTaskExecutionContext {
  node: TaskNode;
  lane: LaneType;
}

export interface DeepResearchKernelOptions {
  config?:
    | DeepResearchConfig
    | ((input: ResearchTaskKernelInput) => DeepResearchConfig | undefined);
  sourceAdapters?:
    | readonly ResearchSourceAdapter[]
    | ((input: ResearchTaskKernelInput) => readonly ResearchSourceAdapter[] | undefined);
  planner?: ResearchPlannerAdapter;
}

export interface ResearchTaskExecutorDeps extends DeepResearchKernelOptions {
  getContext: (node: TaskNode) => ResearchTaskExecutionContext;
  fallback: TaskExecutor;
  emit: ResearchEventEmitter;
}

export class ResearchTaskExecutor implements TaskExecutor {
  constructor(private readonly deps: ResearchTaskExecutorDeps) {}

  async execute(node: TaskNode, lane: LaneType): Promise<TaskResult> {
    if (node.kind !== "research") return this.deps.fallback.execute(node, lane);

    const context = this.deps.getContext(node);
    const input: ResearchTaskKernelInput = { ...context, node, lane };
    const sourceAdapters = this.resolveSourceAdapters(input);
    const config = mergeConfig(this.resolveConfig(input), node.spec.research?.config);
    const options = resolveDeepResearchOptions(config, context.workspaceRoot, {
      availableSourceKinds: uniqueSourceKinds(sourceAdapters),
    });
    const question = researchQuestion(node, lane);
    const researchRunId = `${context.runId}:${node.id}:research`;
    const bridge = new ResearchEventBridge(
      {
        researchRunId,
        nodeId: node.id,
        parentTaskId: node.id,
        parentWorkerId: context.parentWorkerId,
        traceId: context.traceId,
        question: question.prompt,
        sourcePolicy: options.sourcePolicy,
        requiredSourceKinds: options.requiredSourceKinds,
        requireCitations: options.requireCitations,
        verificationRequired: options.verificationRequired,
        workspaceDirRelative: options.workspaceDirRelative,
      },
      this.deps.emit,
    );
    const runner = new DeepResearchRunner({
      options,
      sourceAdapters,
      planner: this.deps.planner,
      progressSink: (event) => bridge.handle(event),
      researchRunId,
    });
    const result = await runner.run(question);

    return {
      output: researchOutput(result, researchRunId, options),
    };
  }

  private resolveConfig(input: ResearchTaskKernelInput): DeepResearchConfig | undefined {
    const configured = this.deps.config;
    return typeof configured === "function" ? configured(input) : configured;
  }

  private resolveSourceAdapters(input: ResearchTaskKernelInput): ResearchSourceAdapter[] {
    const configured = this.deps.sourceAdapters;
    const adapters = typeof configured === "function" ? configured(input) : configured;
    return [...(adapters ?? [])];
  }
}

function researchQuestion(node: TaskNode, lane: LaneType): DeepResearchQuestion {
  const contract = node.spec.research;
  return {
    prompt: contract?.question ?? node.spec.description,
    ...(contract?.subquestions !== undefined
      ? { subquestions: [...contract.subquestions] }
      : {}),
    ...(contract?.constraints !== undefined ? { constraints: [...contract.constraints] } : {}),
    ...(contract?.audience !== undefined ? { audience: contract.audience } : {}),
    ...(contract?.requiredSourceKinds !== undefined
      ? { requiredSourceKinds: [...contract.requiredSourceKinds] }
      : {}),
    metadata: {
      ...(contract?.metadata ?? {}),
      taskId: node.id,
      lane,
    },
  };
}

function mergeConfig(
  base: DeepResearchConfig | undefined,
  override: DeepResearchConfig | undefined,
): DeepResearchConfig | undefined {
  if (!base && !override) return undefined;
  return {
    ...(base ?? {}),
    ...(override ?? {}),
  };
}

function uniqueSourceKinds(sourceAdapters: ResearchSourceAdapter[]) {
  return [...new Set(sourceAdapters.map((adapter) => adapter.kind))];
}

function researchOutput(
  result: DeepResearchRunResult,
  researchRunId: string,
  options: ReturnType<typeof resolveDeepResearchOptions>,
): Record<string, unknown> {
  return compactRecord({
    researchRunId,
    status: result.status,
    planId: result.plan.id,
    sourcePolicy: options.sourcePolicy,
    requiredSourceKinds: options.requiredSourceKinds,
    requireCitations: options.requireCitations,
    verificationRequired: options.verificationRequired,
    workspaceDirRelative: options.workspaceDirRelative,
    evidenceCount: result.evidence.length,
    citationCount: result.citations.length,
    toolCalls: result.toolCalls,
    unknowns: result.unknowns.map((item) => preview(item, 240)),
    evidence: result.evidence.slice(0, 25).map(evidencePayload),
    citations: result.citations.slice(0, 50).map(citationPayload),
  });
}

function evidencePayload(evidence: ResearchEvidence): Record<string, unknown> {
  return compactRecord({
    id: evidence.id,
    sourceKind: evidence.sourceKind,
    queryPreview: preview(evidence.query, 180),
    title: evidence.title,
    summary: evidence.summary ? preview(evidence.summary, 360) : undefined,
    citationIds: evidence.citations.map((citation) => citation.id),
    confidence: evidence.confidence,
    metadata: sanitizeRecord(evidence.metadata),
  });
}

function citationPayload(citation: ResearchCitation): Record<string, unknown> {
  return compactRecord({
    id: citation.id,
    sourceKind: citation.sourceKind,
    title: citation.title,
    uri: citation.uri,
    summary: citation.summary ? preview(citation.summary, 360) : undefined,
    retrievedAt: citation.retrievedAt,
    traceId: citation.traceId,
    queryId: citation.queryId,
    sourceRecordId: citation.sourceRecordId,
    evidenceIds: citation.evidenceIds,
    provenanceIds: citation.provenanceIds,
    artifactPointer: citation.artifactPointer,
    routeNames: citation.routeNames,
    score: citation.score,
    metadata: sanitizeRecord(citation.metadata),
  });
}

function compactRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

function sanitizeRecord(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      item === null ||
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean"
    ) {
      out[key] = typeof item === "string" ? preview(item, 240) : item;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function preview(value: string, max = 160): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 3))}...`;
}

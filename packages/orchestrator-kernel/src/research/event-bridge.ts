import { sha256Hex } from "@kirakira/core";
import type {
  DeepResearchCitationProgress,
  DeepResearchProgressEvent,
  ResearchSourceKind,
} from "@kirakira/deep-research";
import type { RunEventKind } from "@kirakira/runtime-contracts";

export type ResearchEventEmitter = (
  kind: RunEventKind,
  payload: Record<string, unknown>,
) => void | Promise<void>;

export interface ResearchEventBridgeContext {
  researchRunId: string;
  nodeId?: string;
  question?: string;
  sourcePolicy?: string;
  requiredSourceKinds?: ResearchSourceKind[];
  requireCitations?: boolean;
  verificationRequired?: boolean;
  workspaceDirRelative?: string;
  parentTaskId?: string;
  parentWorkerId?: string;
  subagentId?: string;
  traceId?: string;
}

export class ResearchEventBridge {
  constructor(
    private readonly context: ResearchEventBridgeContext,
    private readonly emit: ResearchEventEmitter,
  ) {}

  async handle(event: DeepResearchProgressEvent): Promise<void> {
    const payload = this.basePayload(event);
    switch (event.phase) {
      case "started":
        await this.emit("research.started", payload);
        break;
      case "plan_created":
        await this.emit("research.plan.created", payload);
        break;
      case "task_started":
        await this.emit("research.task.started", payload);
        break;
      case "task_completed":
        await this.emit("research.task.completed", payload);
        break;
      case "task_failed":
        await this.emit("research.task.failed", payload);
        break;
      case "source_started":
        await this.emit("research.source.started", payload);
        break;
      case "source_completed":
        await this.emit("research.source.completed", payload);
        break;
      case "source_failed":
        await this.emit("research.source.failed", payload);
        break;
      case "evidence_collected":
        await this.emit("research.evidence.collected", payload);
        break;
      case "citation_added":
        if (event.citations?.length) {
          for (const citation of event.citations) {
            await this.emit("research.citation.added", {
              ...payload,
              ...citationPayload(citation),
            });
          }
        } else {
          await this.emit("research.citation.added", payload);
        }
        break;
      case "limit_reached":
        await this.emit("research.limit.reached", payload);
        break;
      case "completed":
        await this.emit("research.completed", payload);
        break;
      case "failed":
        await this.emit("research.failed", payload);
        break;
    }
  }

  private basePayload(event: DeepResearchProgressEvent): Record<string, unknown> {
    const question = this.context.question;
    return compactRecord({
      researchRunId: event.researchRunId ?? this.context.researchRunId,
      nodeId: this.context.nodeId,
      parentTaskId: this.context.parentTaskId ?? this.context.nodeId,
      parentWorkerId: this.context.parentWorkerId,
      subagentId: this.context.subagentId,
      traceId: this.context.traceId,
      questionHash: question ? sha256Hex(question) : undefined,
      questionPreview: question ? preview(question) : undefined,
      planId: event.planId,
      researchTaskId: event.taskId,
      taskKind: event.taskKind,
      depth: event.depth,
      dependsOn: event.dependsOn,
      sourcePolicy: this.context.sourcePolicy,
      requiredSourceKinds: this.context.requiredSourceKinds,
      sourceKinds: event.sourceKinds,
      sourceKind: event.sourceKind,
      sourceCallId: event.sourceCallId,
      limits: event.limits,
      requireCitations: event.requireCitations ?? this.context.requireCitations,
      verificationRequired:
        event.verificationRequired ?? this.context.verificationRequired,
      workspaceDirRelative:
        event.workspaceDirRelative ?? this.context.workspaceDirRelative,
      requiredCitations: event.requiredCitations,
      toolCalls: event.toolCalls,
      maxToolCalls: event.maxToolCalls,
      evidenceCount: event.evidenceCount,
      citationCount: event.citationCount,
      evidenceIds: event.evidenceIds,
      citationIds: event.citationIds,
      unknowns: event.unknowns,
      durationMs: event.durationMs,
      errorCode: event.errorCode,
      message: event.message ? preview(event.message, 240) : undefined,
    });
  }
}

function citationPayload(
  citation: DeepResearchCitationProgress,
): Record<string, unknown> {
  return compactRecord({
    citationId: citation.id,
    sourceKind: citation.sourceKind,
    title: citation.title,
    uri: citation.uri,
    summary: citation.summary ? preview(citation.summary, 240) : undefined,
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

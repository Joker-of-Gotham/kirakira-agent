import { createDeepResearchPlan } from "./planner.js";
import type {
  DeepResearchCitationProgress,
  DeepResearchPlan,
  DeepResearchProgressEvent,
  DeepResearchProgressSink,
  DeepResearchQuestion,
  DeepResearchRunResult,
  ResearchCitation,
  ResearchEvidence,
  ResearchPlannerAdapter,
  ResearchSourceAdapter,
  ResolvedDeepResearchOptions,
} from "./types.js";

export interface DeepResearchRunnerDeps {
  options: ResolvedDeepResearchOptions;
  sourceAdapters?: ResearchSourceAdapter[];
  planner?: ResearchPlannerAdapter;
  progressSink?: DeepResearchProgressSink;
  researchRunId?: string;
}

export class DeepResearchRunner {
  private readonly options: ResolvedDeepResearchOptions;
  private readonly sourceAdapters: Map<string, ResearchSourceAdapter>;
  private readonly planner?: ResearchPlannerAdapter;
  private readonly progressSink?: DeepResearchProgressSink;
  private readonly researchRunId?: string;

  constructor(deps: DeepResearchRunnerDeps) {
    this.options = deps.options;
    this.sourceAdapters = new Map(
      (deps.sourceAdapters ?? []).map((adapter) => [adapter.kind, adapter]),
    );
    this.planner = deps.planner;
    this.progressSink = deps.progressSink;
    this.researchRunId = deps.researchRunId;
  }

  async plan(question: string | DeepResearchQuestion): Promise<DeepResearchPlan> {
    const basePlan = createDeepResearchPlan(question, this.options);
    if (!this.planner) {
      return basePlan;
    }
    return this.planner.refinePlan(basePlan, {
      sourceKinds: this.options.requiredSourceKinds,
      limits: this.options.limits,
      requireCitations: this.options.requireCitations,
    });
  }

  async run(
    question: string | DeepResearchQuestion,
  ): Promise<DeepResearchRunResult> {
    const runStartedAt = Date.now();
    await this.emitProgress({ phase: "started" });

    let plan: DeepResearchPlan;
    try {
      plan = await this.plan(question);
    } catch (error) {
      await this.emitProgress({
        phase: "failed",
        durationMs: elapsedMs(runStartedAt),
        ...errorProgress(error),
      });
      throw error;
    }

    await this.emitProgress({
      phase: "plan_created",
      planId: plan.id,
      sourceKinds: plan.requiredSourceKinds,
      limits: plan.limits,
      requireCitations: plan.citationSchema.required,
      verificationRequired: this.options.verificationRequired,
      workspaceDirRelative: this.options.workspaceDirRelative,
      unknowns: plan.unknowns,
      evidenceCount: 0,
      citationCount: 0,
    });

    if (!this.options.enabled) {
      await this.emitProgress({
        phase: "completed",
        planId: plan.id,
        unknowns: plan.unknowns,
        toolCalls: 0,
        evidenceCount: 0,
        citationCount: 0,
        durationMs: elapsedMs(runStartedAt),
      });
      return {
        status: "disabled",
        plan,
        evidence: [],
        citations: [],
        unknowns: [...plan.unknowns],
        toolCalls: 0,
      };
    }

    const evidence: ResearchEvidence[] = [];
    const citations: ResearchCitation[] = [];
    const unknowns = [...plan.unknowns];
    let toolCalls = 0;

    for (const task of plan.tasks) {
      if (task.kind !== "research") {
        continue;
      }

      const taskStartedAt = Date.now();
      await this.emitProgress({
        phase: "task_started",
        planId: plan.id,
        taskId: task.id,
        taskKind: task.kind,
        depth: task.depth,
        dependsOn: task.dependsOn,
        sourceKinds: task.sourceKinds,
        requiredCitations: task.requiredCitations,
      });

      for (const sourceKind of task.sourceKinds) {
        if (toolCalls >= this.options.limits.maxToolCalls) {
          const message = "Research source collection stopped at max_tool_calls.";
          unknowns.push(message);
          await this.emitProgress({
            phase: "limit_reached",
            planId: plan.id,
            taskId: task.id,
            toolCalls,
            maxToolCalls: this.options.limits.maxToolCalls,
            message,
          });
          const limited = buildResult(plan, evidence, citations, unknowns, toolCalls);
          await this.emitProgress({
            phase: "completed",
            planId: plan.id,
            toolCalls,
            evidenceCount: evidence.length,
            citationCount: citations.length,
            unknowns,
            durationMs: elapsedMs(runStartedAt),
          });
          return limited;
        }

        const adapter = this.sourceAdapters.get(sourceKind);
        if (!adapter) {
          unknowns.push(`No source adapter registered for "${sourceKind}".`);
          continue;
        }

        toolCalls += 1;
        const sourceCallId = `${task.id}:${sourceKind}:${toolCalls}`;
        const sourceStartedAt = Date.now();
        await this.emitProgress({
          phase: "source_started",
          planId: plan.id,
          taskId: task.id,
          sourceKind,
          sourceCallId,
          toolCalls,
          maxToolCalls: this.options.limits.maxToolCalls,
          requireCitations: task.requiredCitations,
        });

        let sourceEvidence: ResearchEvidence[];
        try {
          sourceEvidence = await adapter.search({
            taskId: task.id,
            query: task.question,
            sourceKind,
            limits: this.options.limits,
            requireCitations: task.requiredCitations,
          });
        } catch (error) {
          await this.emitProgress({
            phase: "source_failed",
            planId: plan.id,
            taskId: task.id,
            sourceKind,
            sourceCallId,
            durationMs: elapsedMs(sourceStartedAt),
            ...errorProgress(error),
          });
          await this.emitProgress({
            phase: "task_failed",
            planId: plan.id,
            taskId: task.id,
            durationMs: elapsedMs(taskStartedAt),
            ...errorProgress(error),
          });
          await this.emitProgress({
            phase: "failed",
            planId: plan.id,
            durationMs: elapsedMs(runStartedAt),
            ...errorProgress(error),
          });
          throw error;
        }

        const sourceCitations = sourceEvidence.flatMap((item) => item.citations);
        const evidenceIds = sourceEvidence.map((item) => item.id);
        const citationIds = sourceCitations.map((citation) => citation.id);

        await this.emitProgress({
          phase: "source_completed",
          planId: plan.id,
          taskId: task.id,
          sourceKind,
          sourceCallId,
          evidenceCount: sourceEvidence.length,
          citationCount: sourceCitations.length,
          evidenceIds,
          citationIds,
          durationMs: elapsedMs(sourceStartedAt),
        });
        await this.emitProgress({
          phase: "evidence_collected",
          planId: plan.id,
          taskId: task.id,
          sourceKind,
          sourceCallId,
          evidenceCount: sourceEvidence.length,
          citationCount: sourceCitations.length,
          evidenceIds,
          citationIds,
        });
        for (const citation of sourceCitations) {
          await this.emitProgress({
            phase: "citation_added",
            planId: plan.id,
            taskId: task.id,
            sourceKind: citation.sourceKind,
            sourceCallId,
            citationIds: [citation.id],
            citations: [citationProgress(citation)],
          });
        }

        evidence.push(...sourceEvidence);
        citations.push(...sourceCitations);
      }

      await this.emitProgress({
        phase: "task_completed",
        planId: plan.id,
        taskId: task.id,
        toolCalls,
        evidenceCount: evidence.length,
        citationCount: citations.length,
        durationMs: elapsedMs(taskStartedAt),
      });
    }

    const result = buildResult(plan, evidence, citations, unknowns, toolCalls);
    await this.emitProgress({
      phase: "completed",
      planId: plan.id,
      toolCalls,
      evidenceCount: evidence.length,
      citationCount: citations.length,
      unknowns,
      durationMs: elapsedMs(runStartedAt),
    });

    return result;
  }

  private async emitProgress(event: DeepResearchProgressEvent): Promise<void> {
    if (!this.progressSink) return;
    await this.progressSink({
      researchRunId: this.researchRunId,
      ...event,
    });
  }
}

function elapsedMs(startedAt: number): number {
  return Date.now() - startedAt;
}

function errorProgress(
  error: unknown,
): Pick<DeepResearchProgressEvent, "errorCode" | "message"> {
  if (error instanceof Error) {
    return {
      errorCode: error.name,
      message: error.message,
    };
  }
  return {
    errorCode: "UnknownError",
    message: String(error),
  };
}

function citationProgress(citation: ResearchCitation): DeepResearchCitationProgress {
  return {
    id: citation.id,
    sourceKind: citation.sourceKind,
    title: citation.title,
    uri: citation.uri,
    summary: citation.summary,
    traceId: citation.traceId,
    queryId: citation.queryId,
    sourceRecordId: citation.sourceRecordId,
    evidenceIds: citation.evidenceIds,
    provenanceIds: citation.provenanceIds,
    artifactPointer: citation.artifactPointer,
    routeNames: citation.routeNames,
    score: citation.score,
    metadata: citation.metadata,
  };
}

function buildResult(
  plan: DeepResearchPlan,
  evidence: ResearchEvidence[],
  citations: ResearchCitation[],
  unknowns: string[],
  toolCalls: number,
): DeepResearchRunResult {
  return {
    status: evidence.length > 0 ? "evidence_collected" : "planned",
    plan,
    evidence,
    citations,
    unknowns,
    toolCalls,
  };
}

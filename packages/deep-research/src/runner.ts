import { createDeepResearchPlan } from "./planner.js";
import type {
  DeepResearchPlan,
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
}

export class DeepResearchRunner {
  private readonly options: ResolvedDeepResearchOptions;
  private readonly sourceAdapters: Map<string, ResearchSourceAdapter>;
  private readonly planner?: ResearchPlannerAdapter;

  constructor(deps: DeepResearchRunnerDeps) {
    this.options = deps.options;
    this.sourceAdapters = new Map(
      (deps.sourceAdapters ?? []).map((adapter) => [adapter.kind, adapter]),
    );
    this.planner = deps.planner;
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
    const plan = await this.plan(question);
    if (!this.options.enabled) {
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
      for (const sourceKind of task.sourceKinds) {
        if (toolCalls >= this.options.limits.maxToolCalls) {
          unknowns.push("Research source collection stopped at max_tool_calls.");
          return buildResult(plan, evidence, citations, unknowns, toolCalls);
        }

        const adapter = this.sourceAdapters.get(sourceKind);
        if (!adapter) {
          unknowns.push(`No source adapter registered for "${sourceKind}".`);
          continue;
        }

        toolCalls += 1;
        const sourceEvidence = await adapter.search({
          taskId: task.id,
          query: task.question,
          sourceKind,
          limits: this.options.limits,
          requireCitations: task.requiredCitations,
        });
        evidence.push(...sourceEvidence);
        citations.push(
          ...sourceEvidence.flatMap((item) => item.citations),
        );
      }
    }

    return buildResult(plan, evidence, citations, unknowns, toolCalls);
  }
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

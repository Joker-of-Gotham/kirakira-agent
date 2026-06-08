import { sha256Hex } from "@kirakira/core";

import {
  DEEP_RESEARCH_OUTPUT_HEADINGS,
  DEFAULT_DEEP_RESEARCH_CITATION_SCHEMA,
} from "./constants.js";
import { selectSourceKinds } from "./options.js";
import type {
  DeepResearchCitationSchema,
  DeepResearchPlan,
  DeepResearchQuestion,
  ResearchSourceKind,
  DeepResearchSubagentContract,
  DeepResearchTask,
  JsonSchemaObject,
  ResolvedDeepResearchOptions,
} from "./types.js";

const SUBAGENT_OUTPUT_SCHEMA: JsonSchemaObject = {
  type: "object",
  additionalProperties: false,
  required: [
    "answer",
    "evidenceUsed",
    "actionsTaken",
    "openUncertainties",
    "failedToolCalls",
    "recommendedNextStep",
  ],
  properties: {
    answer: { type: "string" },
    evidenceUsed: {
      type: "array",
      items: {
        type: "object",
        required: ["citationId", "claim"],
        properties: {
          citationId: { type: "string" },
          claim: { type: "string" },
        },
      },
    },
    actionsTaken: { type: "array", items: { type: "string" } },
    openUncertainties: { type: "array", items: { type: "string" } },
    failedToolCalls: { type: "array", items: { type: "string" } },
    recommendedNextStep: { type: "string" },
  },
};

export function createDeepResearchPlan(
  question: string | DeepResearchQuestion,
  options: ResolvedDeepResearchOptions,
): DeepResearchPlan {
  const normalizedQuestion = normalizeQuestion(question);
  const taskSourceKinds = selectSourceKinds(
    options.sourcePolicy,
    normalizedQuestion.requiredSourceKinds,
    options.requiredSourceKinds,
  );
  const citationSchema = createCitationSchema(options, taskSourceKinds);
  const unknowns: string[] = [];
  const id = createPlanId(normalizedQuestion.prompt, options, taskSourceKinds);
  const subagent = createSubagentContract(
    normalizedQuestion.prompt,
    citationSchema,
  );
  const tasks = options.enabled
    ? createTasks(id, normalizedQuestion, options, taskSourceKinds, unknowns)
    : [];

  if (!options.enabled) {
    unknowns.push("Deep research is disabled by configuration.");
  }

  return {
    id,
    enabled: options.enabled,
    createdAt: new Date().toISOString(),
    question: normalizedQuestion.prompt,
    sourcePolicy: options.sourcePolicy,
    limits: options.limits,
    requiredSourceKinds: taskSourceKinds,
    citationSchema,
    unknowns,
    subagent,
    tasks,
  };
}

function normalizeQuestion(
  question: string | DeepResearchQuestion,
): DeepResearchQuestion {
  if (typeof question === "string") {
    return { prompt: question };
  }
  return question;
}

function createPlanId(
  prompt: string,
  options: ResolvedDeepResearchOptions,
  sourceKinds: readonly string[],
): string {
  const digest = sha256Hex(
    JSON.stringify({
      prompt,
      sourcePolicy: options.sourcePolicy,
      sourceKinds,
      limits: options.limits,
    }),
  ).slice(0, 12);
  return `research-plan-${digest}`;
}

function createCitationSchema(
  options: ResolvedDeepResearchOptions,
  sourceKinds: ResearchSourceKind[],
): DeepResearchCitationSchema {
  return {
    ...DEFAULT_DEEP_RESEARCH_CITATION_SCHEMA,
    required: options.requireCitations,
    minCitationsPerFinding: options.verificationRequired ? 2 : 1,
    acceptedSourceKinds: [...sourceKinds],
  };
}

function createSubagentContract(
  prompt: string,
  citationSchema: DeepResearchCitationSchema,
): DeepResearchSubagentContract {
  return {
    taskBrief: `Research with citations: ${prompt}`,
    requiredHeadings: [...DEEP_RESEARCH_OUTPUT_HEADINGS],
    outputSchema: {
      ...SUBAGENT_OUTPUT_SCHEMA,
      properties: {
        ...SUBAGENT_OUTPUT_SCHEMA.properties,
        evidenceUsed: {
          type: "array",
          minItems: citationSchema.required
            ? citationSchema.minCitationsPerFinding
            : 0,
          items: {
            type: "object",
            required: ["citationId", "claim"],
            properties: {
              citationId: { type: "string" },
              claim: { type: "string" },
            },
          },
        },
      },
    },
  };
}

function createTasks(
  planId: string,
  question: DeepResearchQuestion,
  options: ResolvedDeepResearchOptions,
  sourceKinds: DeepResearchTask["sourceKinds"],
  unknowns: string[],
): DeepResearchTask[] {
  const subquestions = question.subquestions ?? [];
  if (subquestions.length === 0 || options.limits.maxDepth < 2) {
    return [
      createTask({
        id: `${planId}:root`,
        kind: "research",
        question: question.prompt,
        depth: 0,
        dependsOn: [],
        sourceKinds,
        requiredCitations: options.requireCitations,
      }),
    ];
  }

  const selectedSubquestions = subquestions.slice(0, options.limits.maxBreadth);
  if (selectedSubquestions.length < subquestions.length) {
    unknowns.push(
      `${subquestions.length - selectedSubquestions.length} subquestions were omitted by max_breadth.`,
    );
  }

  const researchTasks = selectedSubquestions.map((subquestion, index) =>
    createTask({
      id: `${planId}:research:${index + 1}`,
      kind: "research",
      question: subquestion,
      depth: 1,
      dependsOn: [],
      sourceKinds,
      requiredCitations: options.requireCitations,
    }),
  );

  return [
    ...researchTasks,
    createTask({
      id: `${planId}:synthesis`,
      kind: "synthesis",
      question: question.prompt,
      depth: 0,
      dependsOn: researchTasks.map((task) => task.id),
      sourceKinds,
      requiredCitations: options.requireCitations,
    }),
  ];
}

function createTask(input: Omit<DeepResearchTask, "outputSchema">): DeepResearchTask {
  return {
    ...input,
    outputSchema: SUBAGENT_OUTPUT_SCHEMA,
  };
}

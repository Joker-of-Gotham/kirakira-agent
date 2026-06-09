import type { ModelPlannerClient } from "@kirakira/agent-runtime";
import type {
  DeepResearchConfig,
  ResearchSourceKind,
} from "@kirakira/deep-research";
import { ulid } from "ulid";
import { OrchestratorKernelError } from "../errors.js";
import { parseStringArray, parseSubagentTaskContract } from "../subagent/contract.js";
import type {
  PlanContext,
  PlanStep,
  ResearchTaskContract,
  RunPlan,
  TaskNodeKind,
} from "../types.js";

const PLAN_VERSION = "kirakira.runplan.v1";
const RESEARCH_SOURCE_KINDS = new Set<ResearchSourceKind>(["memory", "file", "web", "mcp"]);
const RESEARCH_SOURCE_POLICIES = new Set<NonNullable<DeepResearchConfig["source_policy"]>>([
  "workspace",
  "web",
  "hybrid",
  "verified",
]);

export class GoalCompiler {
  constructor(private readonly planner: ModelPlannerClient) {}

  async compile(prompt: string, context: PlanContext): Promise<RunPlan> {
    const system = [
      "You are the Kirakira orchestrator planner.",
      "Decompose the user's goal into executable plan steps.",
      `Respond with ONLY valid JSON (no markdown) matching shape:`,
      `{`,
      `  "version": "${PLAN_VERSION}",`,
      `  "goal": string,`,
      `  "steps": Array<{`,
      `    "id": string,`,
      `    "description": string,`,
      `    "kind": "plan" | "subagent" | "research" | "tool" | "skill-load" | "approval" | "merge" | "synthesize",`,
      `    "dependsOn": string[],`,
      `    "canParallelize": boolean,`,
      `    "model"?: string,`,
      `    "toolScope"?: string[],`,
      `    "skillScope"?: string[],`,
      `    "mcpServers"?: string[],`,
      `    "inputArtifactRefs"?: string[],`,
      `    "estimatedTokens"?: number,`,
      `    "approvalRequired"?: boolean,`,
      `    "subagent"?: {`,
      `      "taskBrief"?: string,`,
      `      "capabilities"?: Array<{ "kind": "tool" | "skill" | "mcp", "name": string }>,`,
      `      "modelPreference"?: string,`,
      `      "outputSchema"?: object`,
      `    }`,
      `    "research"?: {`,
      `      "question"?: string,`,
      `      "subquestions"?: string[],`,
      `      "constraints"?: string[],`,
      `      "audience"?: string,`,
      `      "requiredSourceKinds"?: Array<"memory" | "file" | "web" | "mcp">,`,
      `      "config"?: {`,
      `        "enabled"?: boolean,`,
      `        "source_policy"?: "workspace" | "web" | "hybrid" | "verified",`,
      `        "max_depth"?: number,`,
      `        "max_breadth"?: number,`,
      `        "max_tool_calls"?: number,`,
      `        "require_citations"?: boolean,`,
      `        "workspace_dir"?: string`,
      `      },`,
      `      "metadata"?: object`,
      `    }`,
      `  }>,`,
      `  "estimatedComplexity": "simple" | "moderate" | "complex",`,
      `  "requiresSubagents": boolean`,
      `}`,
      "Rules:",
      "- steps[].id must be unique.",
      "- dependsOn must reference earlier step ids only (DAG).",
      '- Use kind "subagent" when work should be delegated.',
      "- For subagent steps, prefer least-privilege toolScope/skillScope/mcpServers or explicit subagent.capabilities.",
      '- Use kind "research" for source-backed evidence collection, citation-oriented synthesis inputs, or deep research that may run in the background.',
      "- For research steps, include research.requiredSourceKinds only when a specific source class is required.",
      '- Use kind "approval" when user confirmation is needed.',
      `- Prefer tools/skills from context: tools=[${context.availableTools.join(", ")}], skills=[${context.availableSkills.join(", ")}].`,
      `- Available MCP servers: [${(context.availableMcpServers ?? []).join(", ")}].`,
    ].join("\n");

    const user = JSON.stringify(
      {
        goal: prompt,
        workspace: context.workspace,
        availableTools: context.availableTools,
        availableSkills: context.availableSkills,
        previousArtifacts: context.previousArtifacts ?? [],
        constraints: context.constraints ?? [],
      },
      null,
      2,
    );

    const raw = await this.planner.completeText({ system, user });
    const parsed = GoalCompiler.parsePlanJson(raw);
    return GoalCompiler.hydratePlan(parsed, prompt, context);
  }

  private static extractJson(text: string): string {
    const trimmed = text.trim();
    const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
    if (fence?.[1]) return fence[1].trim();
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
    return trimmed;
  }

  private static parsePlanJson(raw: string): unknown {
    const jsonText = GoalCompiler.extractJson(raw);
    try {
      return JSON.parse(jsonText) as unknown;
    } catch (err) {
      throw new OrchestratorKernelError("PLAN_PARSE", "Planner output was not valid JSON", {
        cause: err,
      });
    }
  }

  private static hydratePlan(parsed: unknown, fallbackGoal: string, context: PlanContext): RunPlan {
    if (!parsed || typeof parsed !== "object") {
      throw new OrchestratorKernelError("PLAN_SHAPE", "Planner JSON must be an object");
    }
    const obj = parsed as Record<string, unknown>;
    const goal = typeof obj.goal === "string" ? obj.goal : fallbackGoal;
    const stepsRaw = obj.steps;
    if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) {
      throw new OrchestratorKernelError("PLAN_SHAPE", "Planner JSON must include non-empty steps[]");
    }
    const steps: PlanStep[] = [];
    const seen = new Set<string>();
    for (const entry of stepsRaw) {
      if (!entry || typeof entry !== "object") {
        throw new OrchestratorKernelError("PLAN_SHAPE", "Each step must be an object");
      }
      const s = entry as Record<string, unknown>;
      const id = typeof s.id === "string" ? s.id : ulid();
      if (seen.has(id)) throw new OrchestratorKernelError("PLAN_SHAPE", `Duplicate step id: ${id}`);
      seen.add(id);
      const description =
        typeof s.description === "string" ? s.description : String(s.description ?? "");
      const kind = GoalCompiler.normalizeKind(s.kind);
      const dependsOn = Array.isArray(s.dependsOn)
        ? s.dependsOn.filter((x): x is string => typeof x === "string")
        : [];
      const canParallelize = Boolean(s.canParallelize);
      const model = typeof s.model === "string" ? s.model : undefined;
      const toolScope = parseStringArray(s.toolScope);
      const skillScope = parseStringArray(s.skillScope);
      const mcpServers = parseStringArray(s.mcpServers);
      const inputArtifactRefs = parseStringArray(s.inputArtifactRefs);
      const estimatedTokens = typeof s.estimatedTokens === "number" ? s.estimatedTokens : undefined;
      const approvalRequired =
        typeof s.approvalRequired === "boolean" ? s.approvalRequired : undefined;
      const subagent = parseSubagentTaskContract(s.subagent);
      const research = GoalCompiler.parseResearchTaskContract(s.research);
      steps.push({
        id,
        description,
        kind,
        dependsOn,
        canParallelize,
        ...(model !== undefined ? { model } : {}),
        ...(toolScope !== undefined ? { toolScope } : {}),
        ...(skillScope !== undefined ? { skillScope } : {}),
        ...(mcpServers !== undefined ? { mcpServers } : {}),
        ...(inputArtifactRefs !== undefined ? { inputArtifactRefs } : {}),
        ...(estimatedTokens !== undefined ? { estimatedTokens } : {}),
        ...(approvalRequired !== undefined ? { approvalRequired } : {}),
        ...(subagent !== undefined ? { subagent } : {}),
        ...(research !== undefined ? { research } : {}),
      });
    }
    const estimatedComplexity = GoalCompiler.normalizeComplexity(obj.estimatedComplexity);
    const requiresSubagents =
      typeof obj.requiresSubagents === "boolean"
        ? obj.requiresSubagents
        : steps.some((s) => s.kind === "subagent");
    const id = typeof obj.id === "string" ? obj.id : ulid();
    return {
      id,
      goal,
      context,
      steps,
      estimatedComplexity,
      requiresSubagents,
    };
  }

  private static normalizeComplexity(v: unknown): RunPlan["estimatedComplexity"] {
    if (v === "simple" || v === "moderate" || v === "complex") return v;
    return "moderate";
  }

  private static normalizeKind(v: unknown): TaskNodeKind {
    const allowed = new Set<TaskNodeKind>([
      "plan",
      "subagent",
      "research",
      "tool",
      "skill-load",
      "approval",
      "merge",
      "synthesize",
    ]);
    if (typeof v === "string" && allowed.has(v as TaskNodeKind)) return v as TaskNodeKind;
    return "plan";
  }

  private static parseResearchTaskContract(value: unknown): ResearchTaskContract | undefined {
    if (!value || typeof value !== "object") return undefined;
    const raw = value as Record<string, unknown>;
    const question = stringField(raw.question);
    const subquestions = parseStringArray(raw.subquestions);
    const constraints = parseStringArray(raw.constraints);
    const audience = stringField(raw.audience);
    const requiredSourceKinds = GoalCompiler.parseResearchSourceKinds(raw.requiredSourceKinds);
    const config = GoalCompiler.parseDeepResearchConfig(raw.config);
    const metadata = plainRecord(raw.metadata);
    const contract: ResearchTaskContract = {
      ...(question !== undefined ? { question } : {}),
      ...(subquestions !== undefined ? { subquestions } : {}),
      ...(constraints !== undefined ? { constraints } : {}),
      ...(audience !== undefined ? { audience } : {}),
      ...(requiredSourceKinds !== undefined ? { requiredSourceKinds } : {}),
      ...(config !== undefined ? { config } : {}),
      ...(metadata !== undefined ? { metadata } : {}),
    };
    return Object.keys(contract).length > 0 ? contract : {};
  }

  private static parseResearchSourceKinds(value: unknown): ResearchSourceKind[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const out: ResearchSourceKind[] = [];
    for (const item of value) {
      if (typeof item !== "string") continue;
      if (!RESEARCH_SOURCE_KINDS.has(item as ResearchSourceKind)) continue;
      const kind = item as ResearchSourceKind;
      if (!out.includes(kind)) out.push(kind);
    }
    return out.length > 0 ? out : undefined;
  }

  private static parseDeepResearchConfig(value: unknown): DeepResearchConfig | undefined {
    if (!value || typeof value !== "object") return undefined;
    const raw = value as Record<string, unknown>;
    const sourcePolicy =
      typeof raw.source_policy === "string" &&
      RESEARCH_SOURCE_POLICIES.has(raw.source_policy as NonNullable<DeepResearchConfig["source_policy"]>)
        ? (raw.source_policy as DeepResearchConfig["source_policy"])
        : undefined;
    const config: DeepResearchConfig = {
      ...(typeof raw.enabled === "boolean" ? { enabled: raw.enabled } : {}),
      ...(numberField(raw.max_depth) !== undefined ? { max_depth: numberField(raw.max_depth) } : {}),
      ...(numberField(raw.max_breadth) !== undefined
        ? { max_breadth: numberField(raw.max_breadth) }
        : {}),
      ...(numberField(raw.max_tool_calls) !== undefined
        ? { max_tool_calls: numberField(raw.max_tool_calls) }
        : {}),
      ...(typeof raw.require_citations === "boolean"
        ? { require_citations: raw.require_citations }
        : {}),
      ...(sourcePolicy !== undefined ? { source_policy: sourcePolicy } : {}),
      ...(stringField(raw.workspace_dir) !== undefined
        ? { workspace_dir: stringField(raw.workspace_dir) }
        : {}),
    };
    return Object.keys(config).length > 0 ? config : undefined;
  }
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numberField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function plainRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

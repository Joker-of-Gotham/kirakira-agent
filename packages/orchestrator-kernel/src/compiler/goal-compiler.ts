import type { ModelPlannerClient } from "@kirakira/agent-runtime";
import { ulid } from "ulid";
import { OrchestratorKernelError } from "../errors.js";
import { parseStringArray, parseSubagentTaskContract } from "../subagent/contract.js";
import type { PlanContext, PlanStep, RunPlan, TaskNodeKind } from "../types.js";

const PLAN_VERSION = "kirakira.runplan.v1";

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
      `    "kind": "plan" | "subagent" | "tool" | "skill-load" | "approval" | "merge" | "synthesize",`,
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
      `  }>,`,
      `  "estimatedComplexity": "simple" | "moderate" | "complex",`,
      `  "requiresSubagents": boolean`,
      `}`,
      "Rules:",
      "- steps[].id must be unique.",
      "- dependsOn must reference earlier step ids only (DAG).",
      '- Use kind "subagent" when work should be delegated.',
      "- For subagent steps, prefer least-privilege toolScope/skillScope/mcpServers or explicit subagent.capabilities.",
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
      "tool",
      "skill-load",
      "approval",
      "merge",
      "synthesize",
    ]);
    if (typeof v === "string" && allowed.has(v as TaskNodeKind)) return v as TaskNodeKind;
    return "plan";
  }
}

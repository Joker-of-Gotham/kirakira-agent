import type { SubagentCapability, WorkerConfig } from "@kirakira/agent-runtime";
import { OrchestratorKernelError } from "../errors.js";
import type {
  PlanContext,
  PlanStep,
  SubagentSpec,
  SubagentTaskContract,
  TaskNode,
} from "../types.js";

const CAPABILITY_KINDS = new Set<SubagentCapability["kind"]>([
  "tool",
  "skill",
  "mcp",
]);

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function normalizeCapabilities(value: unknown): SubagentCapability[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new OrchestratorKernelError(
      "SUBAGENT_CAPABILITY",
      "Subagent capabilities must be an array",
    );
  }
  const out: SubagentCapability[] = [];
  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== "object") {
      throw new OrchestratorKernelError(
        "SUBAGENT_CAPABILITY",
        `Invalid subagent capability at index ${index}`,
      );
    }
    const candidate = item as Record<string, unknown>;
    const kind = candidate.kind;
    const name = candidate.name;
    if (
      typeof kind === "string" &&
      CAPABILITY_KINDS.has(kind as SubagentCapability["kind"]) &&
      typeof name === "string" &&
      name.trim().length > 0
    ) {
      out.push({ kind: kind as SubagentCapability["kind"], name: name.trim() });
      continue;
    }
    throw new OrchestratorKernelError(
      "SUBAGENT_CAPABILITY",
      `Invalid subagent capability at index ${index}`,
    );
  }
  return out;
}

function assertCapabilitiesKnown(
  capabilities: SubagentCapability[],
  context: PlanContext,
): void {
  const tools = new Set(context.availableTools);
  const skills = new Set(context.availableSkills);
  const mcpServers = context.availableMcpServers
    ? new Set(context.availableMcpServers)
    : undefined;
  for (const cap of capabilities) {
    if (cap.kind === "tool" && !tools.has(cap.name)) {
      throw new OrchestratorKernelError(
        "SUBAGENT_CAPABILITY",
        `Unknown tool capability for subagent: ${cap.name}`,
      );
    }
    if (cap.kind === "skill" && !skills.has(cap.name)) {
      throw new OrchestratorKernelError(
        "SUBAGENT_CAPABILITY",
        `Unknown skill capability for subagent: ${cap.name}`,
      );
    }
    if (cap.kind === "mcp" && mcpServers && !mcpServers.has(cap.name)) {
      throw new OrchestratorKernelError(
        "SUBAGENT_CAPABILITY",
        `Unknown MCP server capability for subagent: ${cap.name}`,
      );
    }
  }
}

function capabilitiesFromScopes(step: PlanStep): SubagentCapability[] {
  const toolNames = step.toolScope ?? [];
  const skillNames = step.skillScope ?? [];
  const mcpNames = step.mcpServers ?? [];
  return [
    ...toolNames.map((name): SubagentCapability => ({ kind: "tool", name })),
    ...skillNames.map((name): SubagentCapability => ({ kind: "skill", name })),
    ...mcpNames.map((name): SubagentCapability => ({ kind: "mcp", name })),
  ];
}

export function normalizeSubagentTaskContract(
  step: PlanStep,
  context: PlanContext,
): SubagentTaskContract | undefined {
  if (step.kind !== "subagent") return undefined;
  const raw = step.subagent ?? {};
  const taskBrief =
    typeof raw.taskBrief === "string" && raw.taskBrief.trim().length > 0
      ? raw.taskBrief.trim()
      : step.description;
  const explicitCapabilities = Object.prototype.hasOwnProperty.call(raw, "capabilities")
    ? normalizeCapabilities(raw.capabilities) ?? []
    : undefined;
  const capabilities = explicitCapabilities ?? capabilitiesFromScopes(step);
  assertCapabilitiesKnown(capabilities, context);
  return {
    taskBrief,
    capabilities,
    ...(raw.modelPreference !== undefined
      ? { modelPreference: raw.modelPreference }
      : step.model !== undefined
        ? { modelPreference: step.model }
        : {}),
    ...(raw.runtimePolicy !== undefined ? { runtimePolicy: raw.runtimePolicy } : {}),
    ...(raw.policyCeiling !== undefined ? { policyCeiling: raw.policyCeiling } : {}),
    ...(step.inputArtifactRefs !== undefined ? { inputArtifactRefs: [...step.inputArtifactRefs] } : {}),
    ...(raw.outputSchema !== undefined && raw.outputSchema && typeof raw.outputSchema === "object"
      ? { outputSchema: raw.outputSchema as Record<string, unknown> }
      : {}),
  };
}

export function parseSubagentTaskContract(value: unknown): Partial<SubagentTaskContract> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const capabilities = normalizeCapabilities(raw.capabilities);
  return {
    ...(typeof raw.taskBrief === "string" ? { taskBrief: raw.taskBrief } : {}),
    ...(capabilities !== undefined ? { capabilities } : {}),
    ...(typeof raw.modelPreference === "string" ? { modelPreference: raw.modelPreference } : {}),
    ...(raw.runtimePolicy && typeof raw.runtimePolicy === "object"
      ? { runtimePolicy: raw.runtimePolicy as SubagentTaskContract["runtimePolicy"] }
      : {}),
    ...(raw.policyCeiling && typeof raw.policyCeiling === "object"
      ? { policyCeiling: raw.policyCeiling as WorkerConfig["policyCeiling"] }
      : {}),
    ...(raw.outputSchema && typeof raw.outputSchema === "object"
      ? { outputSchema: raw.outputSchema as Record<string, unknown> }
      : {}),
  };
}

export function subagentSpecFromTaskNode(
  node: TaskNode,
  request: {
    runId: string;
    parentWorkerId: string;
    workspaceRoot: string;
    traceId?: string;
  },
): SubagentSpec {
  if (node.kind !== "subagent") {
    throw new OrchestratorKernelError("SUBAGENT_SPEC", `Node ${node.id} is not a subagent task`);
  }
  const contract = node.spec.subagent;
  if (!contract) {
    throw new OrchestratorKernelError(
      "SUBAGENT_SPEC",
      `Subagent node ${node.id} is missing a normalized subagent contract`,
    );
  }
  return {
    taskBrief: contract.taskBrief,
    capabilities: contract.capabilities,
    ...(contract.modelPreference !== undefined
      ? { modelPreference: contract.modelPreference }
      : node.spec.model !== undefined
        ? { modelPreference: node.spec.model }
        : {}),
    ...(contract.runtimePolicy !== undefined ? { runtimePolicy: contract.runtimePolicy } : {}),
    parentWorkerId: request.parentWorkerId,
    parentTaskId: node.id,
    runId: request.runId,
    ...(request.traceId !== undefined ? { traceId: request.traceId } : {}),
    workspaceRoot: request.workspaceRoot,
    ...(contract.policyCeiling !== undefined ? { policyCeiling: contract.policyCeiling } : {}),
    ...(contract.inputArtifactRefs !== undefined
      ? { inputArtifactRefs: [...contract.inputArtifactRefs] }
      : {}),
    ...(contract.outputSchema !== undefined ? { outputSchema: contract.outputSchema } : {}),
  };
}

export function parseStringArray(value: unknown): string[] | undefined {
  return stringArray(value);
}

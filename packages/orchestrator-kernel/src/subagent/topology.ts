import type {
  PlanContext,
  SubagentHandoffMetadata,
  SubagentLineageMetadata,
  SubagentTopologyMetadata,
} from "../types.js";

type OrchestrationState = NonNullable<PlanContext["orchestration"]>;
type TopologyHandoff = NonNullable<OrchestrationState["handoffs"]>[number];

function edgePart(value: string): string {
  return encodeURIComponent(value);
}

export function topologyHandoffEdgeId(handoff: TopologyHandoff, index: number): string {
  return `handoff:${edgePart(handoff.from)}:${edgePart(handoff.to)}:${handoff.mode ?? "default"}:${index}`;
}

function handoffMetadata(handoff: TopologyHandoff, index: number): SubagentHandoffMetadata {
  return {
    id: topologyHandoffEdgeId(handoff, index),
    from: handoff.from,
    to: handoff.to,
    ...(handoff.mode !== undefined ? { mode: handoff.mode } : {}),
    ...(handoff.input_filter !== undefined ? { inputFilter: handoff.input_filter } : {}),
    ...(handoff.approval_required !== undefined
      ? { approvalRequired: handoff.approval_required }
      : {}),
    ...(handoff.conditions !== undefined ? { conditions: [...handoff.conditions] } : {}),
  };
}

export function inferSubagentRoleFromTopology(context: PlanContext): string | undefined {
  const handoffs = context.orchestration?.handoffs ?? [];
  if (handoffs.length === 0) return undefined;
  const parentRole = context.orchestration?.default_role;
  const candidates = parentRole
    ? handoffs.filter((handoff) => handoff.from === parentRole).map((handoff) => handoff.to)
    : handoffs.map((handoff) => handoff.to);
  const uniqueTargets = [...new Set(candidates)];
  return uniqueTargets.length === 1 ? uniqueTargets[0] : undefined;
}

export function resolveSubagentTopology(
  context: PlanContext,
  role: string | undefined,
): SubagentTopologyMetadata | undefined {
  const parentRole = context.orchestration?.default_role;
  if (!role && !parentRole) return undefined;
  const handoffs = context.orchestration?.handoffs ?? [];
  const matchingHandoffs = handoffs
    .map((handoff, index) => ({ handoff, index }))
    .filter(({ handoff }) => role !== undefined && handoff.to === role);
  const preferred =
    parentRole !== undefined
      ? matchingHandoffs.find(({ handoff }) => handoff.from === parentRole)
      : matchingHandoffs.length === 1
        ? matchingHandoffs[0]
        : undefined;
  const handoff = preferred ? handoffMetadata(preferred.handoff, preferred.index) : undefined;
  const topology: SubagentTopologyMetadata = {
    ...(parentRole !== undefined ? { parentRole } : {}),
    ...(handoff !== undefined ? { handoffEdgeId: handoff.id, handoff } : {}),
  };
  return Object.keys(topology).length > 0 ? topology : undefined;
}

export function subagentLineageMetadata(input: {
  runId: string;
  parentWorkerId: string;
  parentTaskId: string;
}): SubagentLineageMetadata {
  return {
    rootLineageId: input.runId,
    parentLineageId: `${input.runId}:worker:${input.parentWorkerId}`,
    lineageId: `${input.runId}:task:${input.parentTaskId}:subagent`,
  };
}

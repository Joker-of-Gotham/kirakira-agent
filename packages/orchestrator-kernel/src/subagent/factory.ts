import type { EphemeralAgentConfig, SubagentCapability } from "@kirakira/agent-runtime";
import { ulid } from "ulid";
import type { SubagentSpec } from "../types.js";

export class SubagentFactory {
  create(spec: SubagentSpec): EphemeralAgentConfig {
    const workerId = ulid();
    const extra = {
      ...(spec.runtimePolicy !== undefined ? { runtimePolicy: spec.runtimePolicy } : {}),
      ...(spec.permissions !== undefined ? { permissions: spec.permissions } : {}),
      ...(spec.topology !== undefined ? { topology: spec.topology } : {}),
      ...(spec.lineage !== undefined ? { lineage: spec.lineage } : {}),
    };
    return {
      workerId,
      workspaceRoot: spec.workspaceRoot,
      parentWorkerId: spec.parentWorkerId,
      runId: spec.runId,
      ...(spec.traceId !== undefined ? { traceId: spec.traceId } : {}),
      ...(spec.policyCeiling !== undefined ? { policyCeiling: spec.policyCeiling } : {}),
      taskBrief: spec.taskBrief,
      capabilities: spec.capabilities,
      ...(spec.modelPreference !== undefined ? { modelPreference: spec.modelPreference } : {}),
      ...(Object.keys(extra).length > 0 ? { extra } : {}),
      allowedToolNames: spec.capabilities.filter((c: SubagentCapability) => c.kind === "tool").map((c) => c.name),
      mcpServerAllowlist: spec.capabilities
        .filter((c: SubagentCapability) => c.kind === "mcp")
        .map((c) => c.name),
      skillAllowlist: spec.capabilities
        .filter((c: SubagentCapability) => c.kind === "skill")
        .map((c) => c.name),
    };
  }
}

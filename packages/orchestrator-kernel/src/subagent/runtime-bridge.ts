import type { DelegateRunner } from "@kirakira/agent-runtime";
import { ulid } from "ulid";
import { OrchestratorKernelError } from "../errors.js";
import type {
  RuntimeSubagentBridge,
  RuntimeSubagentBridgeRequest,
  TaskResult,
} from "../types.js";

export class DelegateRunnerSubagentBridge implements RuntimeSubagentBridge {
  constructor(private readonly delegateRunner: DelegateRunner) {}

  async run(request: RuntimeSubagentBridgeRequest): Promise<TaskResult> {
    const subagentId = ulid();
    const result = await this.delegateRunner({
      subagentId,
      parentTaskId: request.parentTaskId,
      parentWorkerId: request.parentWorkerId,
      lane: request.lane,
      ...(request.spec.traceId !== undefined ? { traceId: request.spec.traceId } : {}),
      parentConfig: request.parentConfig,
      runId: request.runId,
      task: request.spec.taskBrief,
      capabilities: request.spec.capabilities,
      ...(request.spec.role !== undefined ? { role: request.spec.role } : {}),
      ...(request.spec.lane !== undefined ? { requestedLane: request.spec.lane } : {}),
      ...(request.spec.modelPreference !== undefined
        ? { modelPreference: request.spec.modelPreference }
        : {}),
      ...(request.spec.policyCeiling !== undefined
        ? { policyCeiling: request.spec.policyCeiling }
        : {}),
      ...(request.spec.runtimePolicy !== undefined
        ? { runtimePolicy: request.spec.runtimePolicy }
        : {}),
      inputArtifactRefs: request.spec.inputArtifactRefs,
      outputSchema: request.spec.outputSchema,
      ...(request.spec.permissions !== undefined ? { permissions: request.spec.permissions } : {}),
      ...(request.spec.topology !== undefined ? { topology: request.spec.topology } : {}),
      ...(request.spec.lineage !== undefined ? { lineage: request.spec.lineage } : {}),
      action: {
        kind: "delegate",
        args: {
          task: request.spec.taskBrief,
          parentTaskId: request.parentTaskId,
          ...(request.spec.role !== undefined ? { role: request.spec.role } : {}),
          ...(request.spec.lane !== undefined ? { requestedLane: request.spec.lane } : {}),
          lane: request.lane,
          ...(request.spec.traceId !== undefined ? { traceId: request.spec.traceId } : {}),
          ...(request.spec.modelPreference !== undefined
            ? { modelPreference: request.spec.modelPreference }
            : {}),
          ...(request.spec.runtimePolicy !== undefined
            ? { runtimePolicy: request.spec.runtimePolicy }
            : {}),
          ...(request.spec.policyCeiling !== undefined
            ? { policyCeiling: request.spec.policyCeiling }
            : {}),
          ...(request.spec.permissions !== undefined
            ? { permissions: request.spec.permissions }
            : {}),
          ...(request.spec.lineage !== undefined ? { lineage: request.spec.lineage } : {}),
          ...(request.spec.topology !== undefined ? { topology: request.spec.topology } : {}),
          ...(request.spec.topology?.handoffEdgeId !== undefined
            ? { handoffEdgeId: request.spec.topology.handoffEdgeId }
            : {}),
          capabilities: request.spec.capabilities,
          inputArtifactRefs: request.spec.inputArtifactRefs,
          outputSchema: request.spec.outputSchema,
        },
      },
    });
    if (!result.success) {
      throw new OrchestratorKernelError(
        "SUBAGENT_FAILED",
        result.workerId !== undefined
          ? `Subagent ${result.workerId} failed: ${result.error}`
          : result.error,
      );
    }
    return {
      output: result.finalText,
      ...(result.artifactRefs !== undefined ? { artifactRefs: result.artifactRefs } : {}),
    };
  }
}

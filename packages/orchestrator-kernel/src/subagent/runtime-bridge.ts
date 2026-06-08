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
      action: {
        kind: "delegate",
        args: {
          task: request.spec.taskBrief,
          parentTaskId: request.parentTaskId,
          lane: request.lane,
          ...(request.spec.traceId !== undefined ? { traceId: request.spec.traceId } : {}),
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

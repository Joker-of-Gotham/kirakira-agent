import { ResumeError } from "../errors.js";
import type { CheckpointManager } from "../checkpoint/checkpoint-manager.js";
import type { InterruptToken, KernelState, ResumeAction } from "../types.js";

export class ResumeHandler {
  constructor(private readonly checkpoints: CheckpointManager) {}

  async resume(token: InterruptToken, payload?: unknown): Promise<ResumeAction> {
    if (!token.checkpointRef) {
      throw new ResumeError("Interrupt token missing checkpointRef");
    }
    const state = (await this.checkpoints.restore(token.checkpointRef)) as KernelState;

    if (payload !== undefined) {
      const resumeContext =
        typeof payload === "string"
          ? payload
          : JSON.stringify(payload);
      state.resumeContext = resumeContext;
    }

    return {
      type: "continue_from",
      nodeId: token.nodeId,
      state,
    };
  }
}

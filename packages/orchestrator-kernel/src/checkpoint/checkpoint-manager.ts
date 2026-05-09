import type { CheckpointRepository } from "@kirakira/event-store";
import { ulid } from "ulid";
import { CheckpointError } from "../errors.js";
import type { CheckpointContext, DurabilityLevel, KernelState } from "../types.js";

export class CheckpointManager {
  constructor(
    private readonly repo: CheckpointRepository,
    private durability: DurabilityLevel,
  ) {}

  getDurability(): DurabilityLevel {
    return this.durability;
  }

  setDurability(level: DurabilityLevel): void {
    this.durability = level;
  }

  shouldCheckpoint(context: CheckpointContext): boolean {
    if (context.durability === "sync") return context.nextHasSideEffect;
    if (context.durability === "async") return context.superstepBoundary;
    return context.durability === "exit" && context.runInterruptRequested;
  }

  async save(state: KernelState): Promise<string> {
    const id = ulid();
    const envelope = {
      id,
      runId: state.runId,
      createdAt: new Date().toISOString(),
      version: "kirakira.checkpoint.v1" as const,
      payload: state,
    };
    await this.repo.save(envelope);
    return id;
  }

  async restore(checkpointId: string): Promise<KernelState> {
    const env = await this.repo.load(checkpointId);
    if (!env) throw new CheckpointError(`Checkpoint not found: ${checkpointId}`);
    if (env.version !== "kirakira.checkpoint.v1") {
      throw new CheckpointError(`Unsupported checkpoint version: ${env.version}`);
    }
    return env.payload as KernelState;
  }
}

import PQueue from "p-queue";

export function createOrchestratorQueue(concurrency: number): PQueue {
  return new PQueue({ concurrency });
}

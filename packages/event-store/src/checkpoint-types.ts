export interface CheckpointEnvelope {
  id: string;
  runId: string;
  createdAt: string;
  payload: unknown;
  version: "kirakira.checkpoint.v1";
}

export interface CheckpointRepository {
  save(envelope: CheckpointEnvelope): Promise<void>;
  load(id: string): Promise<CheckpointEnvelope | undefined>;
  delete(id: string): Promise<void>;
}

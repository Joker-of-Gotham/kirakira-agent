export interface MemoryCheckpoint {
  id: string;
  tenantId: string;
  runId: string;
  taskId?: string;
  stepNo: number;
  stateJson: Record<string, unknown>;
  artifactManifest: Record<string, unknown>;
  parentCheckpointId?: string;
  createdAt: string;
}

export interface CheckpointRef {
  id: string;
  runId: string;
  stepNo: number;
  createdAt: string;
}

export interface RestoredState {
  checkpoint: MemoryCheckpoint;
  artifactRefs: string[];
  hydratedAt: string;
}

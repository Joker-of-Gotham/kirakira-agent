export type MemoryKind =
  | "episode"
  | "fact"
  | "belief"
  | "observation"
  | "preference"
  | "checkpoint"
  | "artifact_meta";

export type RetentionClass = "default" | "regulated" | "ephemeral";
export type PiiLevel = "none" | "low" | "high";
export type MemoryNamespace = "user" | "project" | "org" | "agent" | "shared";

export interface MemoryRecord {
  id: string;
  tenantId: string;
  workspaceId: string;
  actorId?: string;
  namespace: MemoryNamespace;
  kind: MemoryKind;
  text?: string;
  summaryL0?: string;
  overviewL1?: string;
  metadata: Record<string, unknown>;
  confidence?: number;
  evidenceIds: string[];
  entityIds: string[];
  validFrom?: string;
  validTo?: string;
  txFrom: string;
  txTo?: string;
  retentionClass: RetentionClass;
  piiLevel: PiiLevel;
  redacted: boolean;
  tombstonedAt?: string;
  createdAt: string;
}

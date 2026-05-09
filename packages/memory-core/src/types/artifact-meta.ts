export interface ArtifactMeta {
  id: string;
  tenantId: string;
  uri: string;
  sha256: string;
  mediaType: string;
  bytes: number;
  worm: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

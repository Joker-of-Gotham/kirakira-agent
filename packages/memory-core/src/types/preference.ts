export interface Preference {
  id: string;
  key: string;
  value: string;
  actorId: string;
  sourceEpisodeId?: string;
  confidence: number;
  validFrom?: string;
  validTo?: string;
  txFrom: string;
  txTo?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

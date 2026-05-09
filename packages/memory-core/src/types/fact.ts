export interface Fact {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  canonicalText: string;
  sourceEpisodeId: string;
  sourceSegmentId?: string;
  confidence: number;
  validFrom?: string;
  validTo?: string;
  txFrom: string;
  txTo?: string;
  entityIds: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
}

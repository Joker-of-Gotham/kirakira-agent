export interface Observation {
  id: string;
  summary: string;
  derivedFromFacts: string[];
  derivedFromEpisodes: string[];
  confidence: number;
  scope: string;
  validFrom?: string;
  validTo?: string;
  txFrom: string;
  txTo?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

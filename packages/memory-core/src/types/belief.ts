export interface Belief {
  id: string;
  statement: string;
  confidence: number;
  supportedBy: string[];
  refutedBy: string[];
  lastEvaluatedAt: string;
  validFrom?: string;
  validTo?: string;
  txFrom: string;
  txTo?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

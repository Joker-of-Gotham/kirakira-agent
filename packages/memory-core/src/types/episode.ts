export type EpisodeSourceType = "chat" | "tool" | "file" | "web" | "sandbox";

export interface Episode {
  id: string;
  tenantId: string;
  workspaceId: string;
  sessionId?: string;
  sourceType: EpisodeSourceType;
  startAt: string;
  endAt: string;
  bodyBlobUri: string;
  segmentationScore: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface EpisodeSegment {
  id: string;
  episodeId: string;
  offsetStart: number;
  offsetEnd: number;
  text: string;
  entityRefs: string[];
  createdAt: string;
}

import { z } from "zod";

export const episodeSourceTypeSchema = z.enum(["chat", "tool", "file", "web", "sandbox"]);

export const episodeSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  sessionId: z.string().optional(),
  sourceType: episodeSourceTypeSchema,
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  bodyBlobUri: z.string().min(1),
  segmentationScore: z.number().min(0).max(1),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string().datetime(),
});

export const episodeSegmentSchema = z.object({
  id: z.string().min(1),
  episodeId: z.string().min(1),
  offsetStart: z.number().int().min(0),
  offsetEnd: z.number().int().min(0),
  text: z.string(),
  entityRefs: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
});

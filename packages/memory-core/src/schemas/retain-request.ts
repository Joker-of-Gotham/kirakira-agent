import { z } from "zod";
import { memoryNamespaceSchema, retentionClassSchema, piiLevelSchema } from "./memory-record.js";
import { episodeSourceTypeSchema } from "./episode.js";

export const retainRequestSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  actorId: z.string().optional(),
  namespace: memoryNamespaceSchema,
  sourceType: episodeSourceTypeSchema,
  content: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
  sessionId: z.string().optional(),
  runId: z.string().optional(),
  retentionClass: retentionClassSchema.optional(),
  piiLevel: piiLevelSchema.optional(),
});

export const retainReceiptSchema = z.object({
  episodeId: z.string().min(1),
  memoryRecordIds: z.array(z.string()),
  factIds: z.array(z.string()),
  outboxEventId: z.string().min(1),
  retainedAt: z.string().datetime(),
});

import { z } from "zod";
import { memoryNamespaceSchema } from "./memory-record.js";

export const forgetRequestSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  recordIds: z.array(z.string()).optional(),
  actorId: z.string().optional(),
  namespace: memoryNamespaceSchema.optional(),
  beforeDate: z.string().datetime().optional(),
  reason: z.string().min(1),
  dryRun: z.boolean().optional(),
});

export const forgetReceiptSchema = z.object({
  tombstonedIds: z.array(z.string()),
  indexesDeleted: z.number().int().min(0),
  cacheKeysEvicted: z.number().int().min(0),
  graphEdgesInvalidated: z.number().int().min(0),
  dryRun: z.boolean(),
  forgotAt: z.string().datetime(),
});

export const exportRequestSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().optional(),
  actorId: z.string().optional(),
  format: z.enum(["jsonl", "json"]),
  includeBlobs: z.boolean().optional(),
});

export const exportReceiptSchema = z.object({
  exportId: z.string().min(1),
  blobUri: z.string().min(1),
  recordCount: z.number().int().min(0),
  totalBytes: z.number().int().min(0),
  exportedAt: z.string().datetime(),
});

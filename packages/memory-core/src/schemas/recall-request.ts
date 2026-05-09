import { z } from "zod";
import { memoryKindSchema, memoryNamespaceSchema } from "./memory-record.js";

export const contextLevelSchema = z.enum(["L0", "L1", "L2", "L3"]);

export const recallRequestSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  query: z.string().min(1),
  namespace: memoryNamespaceSchema.optional(),
  kinds: z.array(memoryKindSchema).optional(),
  entityIds: z.array(z.string()).optional(),
  timeWindow: z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  }).optional(),
  runId: z.string().optional(),
  sessionId: z.string().optional(),
  tokenBudget: z.number().int().min(100).optional(),
  level: contextLevelSchema.optional(),
  limit: z.number().int().min(1).max(200).optional(),
  includeRedacted: z.boolean().optional(),
});

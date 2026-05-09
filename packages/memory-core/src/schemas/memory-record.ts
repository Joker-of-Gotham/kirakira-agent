import { z } from "zod";

export const memoryKindSchema = z.enum([
  "episode", "fact", "belief", "observation",
  "preference", "checkpoint", "artifact_meta",
]);

export const retentionClassSchema = z.enum(["default", "regulated", "ephemeral"]);
export const piiLevelSchema = z.enum(["none", "low", "high"]);
export const memoryNamespaceSchema = z.enum(["user", "project", "org", "agent", "shared"]);

export const memoryRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  actorId: z.string().optional(),
  namespace: memoryNamespaceSchema,
  kind: memoryKindSchema,
  text: z.string().optional(),
  summaryL0: z.string().optional(),
  overviewL1: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
  confidence: z.number().min(0).max(1).optional(),
  evidenceIds: z.array(z.string()).default([]),
  entityIds: z.array(z.string()).default([]),
  validFrom: z.string().datetime().optional(),
  validTo: z.string().datetime().optional(),
  txFrom: z.string().datetime(),
  txTo: z.string().datetime().optional(),
  retentionClass: retentionClassSchema.default("default"),
  piiLevel: piiLevelSchema.default("none"),
  redacted: z.boolean().default(false),
  tombstonedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});

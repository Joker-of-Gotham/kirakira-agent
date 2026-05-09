import { z } from "zod";

export const checkpointRequestSchema = z.object({
  tenantId: z.string().min(1),
  runId: z.string().min(1),
  taskId: z.string().optional(),
  stepNo: z.number().int().min(0),
  state: z.record(z.unknown()),
  artifactManifest: z.record(z.unknown()).optional(),
  parentCheckpointId: z.string().optional(),
});

export const checkpointRefSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  stepNo: z.number().int().min(0),
  createdAt: z.string().datetime(),
});

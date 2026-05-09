import type { z } from "zod";
import {
  auditCheckpointSchema,
  auditEventKindSchema,
  auditEventSchema,
  auditSignerTypeSchema,
} from "../schemas/audit.js";

export type AuditEventKind = z.infer<typeof auditEventKindSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type AuditCheckpoint = z.infer<typeof auditCheckpointSchema>;
export type AuditSignerType = z.infer<typeof auditSignerTypeSchema>;

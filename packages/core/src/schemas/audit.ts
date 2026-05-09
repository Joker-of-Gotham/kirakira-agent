import { z } from "zod";

export const auditEventKindSchema = z.enum([
  "policy.decision",
  "approval.request",
  "approval.decision",
  "tool.exec",
  "tool.result",
  "sandbox.transition",
  "config.change",
  "session.start",
  "session.end",
  "error",
]);

export const auditResultEffectSchema = z.enum(["allow", "deny", "escalate"]);

export const auditApprovalStatusSchema = z.enum([
  "pending",
  "approved",
  "denied",
  "expired",
  "revoked",
]);

export const auditResultStatusSchema = z.enum(["success", "error", "pending"]);

export const auditSignerTypeSchema = z.literal("ed25519");

export const auditActorSchema = z.object({
  user_id: z.string(),
  interactive: z.boolean(),
  agent_id: z.string().optional(),
  subagent_id: z.string().optional(),
});

export const auditSubjectSchema = z.object({
  tool_type: z.string().optional(),
  tool_name: z.string().optional(),
  command_base: z.string().optional(),
  mcp_server_id: z.string().optional(),
  skill_id: z.string().optional(),
  model_provider: z.string().optional(),
  model_name: z.string().optional(),
});

export const auditResultSchema = z.object({
  effect: auditResultEffectSchema.optional(),
  approval_required: z.boolean().optional(),
  approval_status: auditApprovalStatusSchema.optional(),
  sandbox_profile: z.string().optional(),
  reason_codes: z.array(z.string()).optional(),
  status: auditResultStatusSchema.optional(),
  error_message: z.string().optional(),
});

export const auditMetricsSchema = z.object({
  token_in: z.number().optional(),
  token_out: z.number().optional(),
  cost_usd: z.number().optional(),
  latency_ms: z.number().optional(),
});

export const auditIntegritySchema = z.object({
  bundle_id: z.string().optional(),
  bundle_digest: z.string().optional(),
  input_hash: z.string().optional(),
  output_hash: z.string().optional(),
});

export const auditEventSchema = z.object({
  version: z.literal("kirakira.audit.v1").default("kirakira.audit.v1"),
  event_id: z.string(),
  ts: z.string().datetime(),
  segment: z.string(),
  prev_hash: z.string(),
  entry_hash: z.string(),
  trace_id: z.string(),
  decision_id: z.string().optional(),
  kind: auditEventKindSchema,
  actor: auditActorSchema,
  subject: auditSubjectSchema,
  result: auditResultSchema,
  metrics: auditMetricsSchema.optional(),
  integrity: auditIntegritySchema.optional(),
});

export const auditCheckpointSchema = z.object({
  version: z
    .literal("kirakira.audit.checkpoint.v1")
    .default("kirakira.audit.checkpoint.v1"),
  segment: z.string(),
  first_event_id: z.string(),
  last_event_id: z.string(),
  entries: z.number().int().nonnegative(),
  root_hash: z.string(),
  signed_at: z.string().datetime(),
  signer: z.object({
    type: auditSignerTypeSchema,
    key_id: z.string(),
  }),
  signature: z.string(),
});

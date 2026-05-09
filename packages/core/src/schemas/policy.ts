import { z } from "zod";

export const actionKindSchema = z.enum([
  "tool.call",
  "file.write",
  "shell.exec",
  "model.invoke",
  "package.install",
  "network.request",
]);

export const toolTypeSchema = z.enum([
  "shell",
  "mcp",
  "skill-script",
  "file",
  "model",
  "registry",
]);

export const obligationTypeSchema = z.enum([
  "sandbox",
  "approval",
  "trace_redaction",
  "audit_append",
  "reason_required",
  "copyout_review",
  "network_allowlist",
  "secret_projection",
  "notify",
]);

export const policyScopeSchema = z.enum([
  "once",
  "session",
  "workspace",
  "policy-window",
]);

export const policyEffectSchema = z.enum(["allow", "deny", "escalate"]);

export const approvalStatusSchema = z.enum([
  "pending",
  "approved",
  "denied",
  "expired",
  "revoked",
]);

export const approvalResolutionOutcomeSchema = z.enum(["approved", "denied"]);

export const approvalModeSchema = z.enum(["none", "human", "auto", "template"]);

export const principalAuthnMethodSchema = z.enum(["sso", "api_key", "token"]);

export const deviceTrustSchema = z.enum(["managed", "unmanaged", "unknown"]);

export const sideEffectLevelSchema = z.enum([
  "none",
  "low",
  "medium",
  "high",
]);

export const riskLevelSchema = z.enum(["none", "low", "medium", "high"]);

export const airiskClaimSeveritySchema = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);

export const sandboxPlatformSchema = z.enum(["linux", "macos", "windows"]);

export const sandboxFilesystemRootModeSchema = z.enum([
  "workspace",
  "temp",
  "none",
]);

export const sandboxNetworkModeSchema = z.enum([
  "off",
  "allowlist",
  "per-server",
  "full",
]);

export const sandboxSeccompSchema = z.enum(["default-deny", "permissive"]);

const policyInputPrincipalSchema = z.object({
  user_id: z.string(),
  org_id: z.string().optional(),
  roles: z.array(z.string()),
  groups: z.array(z.string()).optional(),
  authn_method: principalAuthnMethodSchema,
  device_trust: deviceTrustSchema,
  interactive: z.boolean(),
});

const policyInputWorkspaceLabelsSchema = z.object({
  data_classification: z.string().optional(),
  repo_trust: z.string().optional(),
});

const policyInputWorkspaceSchema = z.object({
  workspace_id: z.string(),
  root: z.string(),
  vcs: z
    .object({
      provider: z.string(),
      branch: z.string(),
      dirty: z.boolean(),
    })
    .optional(),
  labels: policyInputWorkspaceLabelsSchema.optional(),
});

const policyActionRawSchema = z.object({
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
});

const policyActionNormalizedNetworkSchema = z.object({
  required: z.boolean(),
  domains: z.array(z.string()),
  protocol: z.string().optional(),
});

const policyActionNormalizedSchema = z.object({
  command_ast_hash: z.string().optional(),
  command_base: z.string().optional(),
  flags: z.array(z.string()),
  subcommands: z.array(z.string()),
  write_paths: z.array(z.string()),
  read_paths: z.array(z.string()),
  network: policyActionNormalizedNetworkSchema.optional(),
  destructive: z.boolean(),
  interpreter_handoff: z.boolean(),
  pipeline_depth: z.number(),
  redirection_targets: z.array(z.string()),
});

const policyInputActionSchema = z.object({
  kind: actionKindSchema,
  tool_type: toolTypeSchema,
  tool_name: z.string(),
  operation: z.string(),
  raw: policyActionRawSchema.optional(),
  normalized: policyActionNormalizedSchema.optional(),
});

const policyTargetResourceSchema = z.object({
  id: z.string(),
  owner: z.string().optional(),
  classification: z.string().optional(),
});

const policyInputTargetSchema = z.object({
  resource_type: z.string(),
  resources: z.array(policyTargetResourceSchema),
});

const policyInputContextSchema = z.object({
  source: z.string().optional(),
  invoker: z.string().optional(),
  subagent_id: z.string().optional(),
  mcp_server: z
    .object({
      id: z.string().optional(),
      issuer: z.string().optional(),
      trust_tier: z.string().optional(),
    })
    .optional(),
  skill: z
    .object({
      id: z.string().optional(),
      version: z.string().optional(),
      fingerprint: z.string().optional(),
    })
    .optional(),
  model: z
    .object({
      provider: z.string().optional(),
      model: z.string().optional(),
    })
    .optional(),
  prior_decisions: z
    .object({
      fingerprint_hit: z.boolean(),
      approval_template_hit: z.boolean(),
    })
    .optional(),
});

const policyInputRiskSchema = z.object({
  interpreter_summary: z.string().optional(),
  signals: z.array(z.string()),
});

export const policyInputSchema = z.object({
  version: z.string().default("kirakira.policyinput.v1"),
  request_id: z.string(),
  session_id: z.string(),
  trace_id: z.string(),
  timestamp: z.string(),
  principal: policyInputPrincipalSchema,
  workspace: policyInputWorkspaceSchema,
  action: policyInputActionSchema,
  target: policyInputTargetSchema.optional(),
  context: policyInputContextSchema.optional(),
  risk: policyInputRiskSchema.optional(),
});

const airiskClassificationSchema = z.object({
  action_family: z.string(),
  side_effect_level: sideEffectLevelSchema,
  destructive: z.boolean(),
  network_required: z.boolean(),
  external_content_dependency: z.boolean(),
  secret_exposure_risk: riskLevelSchema,
  workspace_escape_risk: riskLevelSchema,
  supply_chain_risk: riskLevelSchema,
});

const airiskClaimSchema = z.object({
  code: z.string(),
  severity: airiskClaimSeveritySchema,
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
});

const canonicalFingerprintMaterialSchema = z.object({
  action_family: z.string(),
  write_paths: z.array(z.string()),
  network_domains: z.array(z.string()),
  tool_type: z.string(),
});

export const airiskOutputSchema = z.object({
  version: z.string().default("kirakira.airisk.v1"),
  request_id: z.string(),
  classification: airiskClassificationSchema,
  claims: z.array(airiskClaimSchema),
  recommended_obligations: z.array(z.string()),
  canonical_fingerprint_material: canonicalFingerprintMaterialSchema.optional(),
});

export const obligationSchema = z.object({
  type: obligationTypeSchema,
  profile: z.string().optional(),
  policy: z.string().optional(),
  channel: z.string().optional(),
  required: z.boolean().optional(),
  scope: policyScopeSchema.optional(),
  min_length: z.number().optional(),
  domains: z.array(z.string()).optional(),
});

export const policyDecisionSchema = z.object({
  version: z.string().default("kirakira.decision.v1"),
  decision_id: z.string(),
  request_id: z.string(),
  effect: policyEffectSchema,
  reason_codes: z.array(z.string()),
  policy: z.object({
    bundle_id: z.string(),
    revision: z.string(),
    package: z.string(),
  }),
  approval: z.object({
    required: z.boolean(),
    mode: approvalModeSchema,
    template_id: z.string().optional(),
    cacheable: z.boolean(),
    ttl_seconds: z.number().optional(),
  }),
  obligations: z.array(obligationSchema),
  explain: z.object({
    summary: z.string(),
    matched_rules: z.array(z.string()),
  }),
});

export const approvalRecordSchema = z.object({
  version: z.string().default("kirakira.approval.v1"),
  approval_id: z.string(),
  status: approvalStatusSchema,
  scope: policyScopeSchema,
  requested_at: z.string().optional(),
  resolved_at: z.string().optional(),
  principal: z.object({
    user_id: z.string(),
    interactive: z.boolean(),
  }),
  decision_id: z.string(),
  fingerprint: z.object({
    exact: z.string(),
    template: z.string(),
  }),
  request_summary: z.object({
    title: z.string(),
    risk: z.string(),
    requested_permissions: z.array(z.string()),
  }),
  resolution: z
    .object({
      outcome: approvalResolutionOutcomeSchema.optional(),
      reviewer: z.string().optional(),
      comment: z.string().optional(),
    })
    .optional(),
});

export const sandboxProfileSchema = z.object({
  version: z.string().default("kirakira.sandbox.v1"),
  name: z.string(),
  platforms: z.array(sandboxPlatformSchema),
  filesystem: z.object({
    root_mode: sandboxFilesystemRootModeSchema,
    read_only_mounts: z.array(z.string()),
    read_write_mounts: z.array(z.string()),
    deny_paths: z.array(z.string()),
  }),
  network: z.object({
    mode: sandboxNetworkModeSchema,
    domains: z.array(z.string()).optional(),
  }),
  process: z.object({
    seccomp: sandboxSeccompSchema,
    max_cpu_seconds: z.number(),
    max_memory_mb: z.number(),
    allow_exec: z.array(z.string()),
  }),
  secrets: z.object({
    exposed: z.array(z.string()),
  }),
  egress_proxy: z.string().optional(),
  copyout: z.object({
    require_post_review: z.boolean(),
  }),
});

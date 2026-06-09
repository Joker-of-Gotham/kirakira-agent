import { z } from "zod";

const providerTypeSchema = z.enum([
  "openai",
  "aliyun-bailian",
  "volcengine-ark",
  "deepseek",
  "azure",
  "anthropic",
  "ollama",
  "vllm",
  "litellm",
  "compatible",
]);

const modelProviderDeclSchema = z.object({
  name: z.string().min(1),
  type: providerTypeSchema,
  base_url: z.string().optional(),
  api_key_env: z.string().optional(),
  models: z.array(z.string()).optional(),
  default_model: z.string().optional(),
  timeout: z.number().int().positive().optional(),
  max_retries: z.number().int().nonnegative().optional(),
  capabilities: z.record(z.boolean()).optional(),
});

const registrySourceSchema = z.object({
  name: z.string().min(1),
  url: z.string(),
  type: z.enum(["npm", "oci", "kirakira"]).optional(),
  auth_token_env: z.string().optional(),
  priority: z.number().int().optional(),
});

const runtimeServiceDeclSchema = z.object({
  name: z.string().min(1),
  url_env: z.string().optional(),
  required: z.boolean().optional(),
});

const runtimeProfileDeclSchema = z.object({
  name: z.string().min(1),
  mode: z.enum(["container", "host", "hybrid"]),
  compose_profiles: z.array(z.string()).optional(),
  env_files: z.array(z.string()).optional(),
  workspace_root_env: z.string().optional(),
  services: z.array(runtimeServiceDeclSchema).optional(),
});

const orchestrationLaneNameSchema = z.enum(["foreground", "queued", "background", "delegated"]);

const orchestrationTopologySchema = z.object({
  mode: z.enum(["tool", "supervisor", "swarm"]).optional(),
  default_role: z.string().min(1).optional(),
  lanes: z.record(
    orchestrationLaneNameSchema,
    z.object({
      capacity: z.number().int().nonnegative().optional(),
    }),
  ).optional(),
  roles: z.array(z.object({
    id: z.string().min(1),
    description: z.string().optional(),
    lane: orchestrationLaneNameSchema.optional(),
    model: z.string().optional(),
    max_turns: z.number().int().positive().optional(),
    system_preamble: z.string().optional(),
    context: z.enum(["isolated", "filtered", "inherit"]).optional(),
    tool_scope: z.array(z.string()).optional(),
    skill_scope: z.array(z.string()).optional(),
    mcp_servers: z.array(z.string()).optional(),
    permissions: z.array(z.string()).optional(),
  })).optional(),
  handoffs: z.array(z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    mode: z.enum(["tool", "supervisor", "swarm"]).optional(),
    input_filter: z.string().optional(),
    approval_required: z.boolean().optional(),
    conditions: z.array(z.string()).optional(),
  })).optional(),
});

export const agentTomlSchema = z.object({
  schema_version: z.number().int().positive(),
  workspace_name: z.string().optional(),
  trust: z.enum(["trusted", "untrusted", "ask"]).optional(),

  model: z
    .object({
      default: z.string(),
      fallback: z.string().optional(),
      providers: z.array(modelProviderDeclSchema).optional(),
      max_cost_per_session_usd: z.number().positive().optional(),
    })
    .optional(),

  ui: z
    .object({
      theme: z.string().optional(),
      vim_mode: z.boolean().optional(),
      show_trace_ids: z.boolean().optional(),
    })
    .optional(),

  output: z
    .object({
      default: z.enum(["human", "json", "jsonl"]).optional(),
      exec_default: z.enum(["human", "json", "jsonl"]).optional(),
    })
    .optional(),

  approvals: z
    .object({
      mode: z.enum(["ask", "auto", "deny"]).optional(),
      auto_run_readonly: z.boolean().optional(),
    })
    .optional(),

  sandbox: z
    .object({
      mode: z.enum(["container", "host", "none"]).optional(),
      network: z.enum(["restricted", "full", "none"]).optional(),
    })
    .optional(),

  skills: z
    .object({
      discover: z.array(z.string()).optional(),
    })
    .optional(),

  mcp: z
    .object({
      config_files: z.array(z.string()).optional(),
      tool_search: z.boolean().optional(),
      lazy_schema: z.boolean().optional(),
    })
    .optional(),

  compat: z
    .object({
      read_claude: z.boolean().optional(),
      read_codex: z.boolean().optional(),
      read_cursor: z.boolean().optional(),
      read_copilot: z.boolean().optional(),
      read_gemini: z.boolean().optional(),
    })
    .optional(),

  registry: z
    .object({
      sources: z.array(registrySourceSchema).optional(),
      default_source: z.string().optional(),
      install_scope: z.enum(["workspace", "user"]).optional(),
    })
    .optional(),

  orchestration: z
    .object({
      handoff_mode: z.enum(["tool", "supervisor", "swarm"]).optional(),
      max_concurrency: z.number().int().positive().optional(),
      default_subagent_turns: z.number().int().positive().optional(),
      subagent_system_preamble: z.string().optional(),
      subagent_context: z.enum(["isolated", "filtered", "inherit"]).optional(),
      trace_handoffs: z.boolean().optional(),
      topology: orchestrationTopologySchema.optional(),
    })
    .optional(),

  deep_research: z
    .object({
      enabled: z.boolean().optional(),
      max_depth: z.number().int().positive().optional(),
      max_breadth: z.number().int().positive().optional(),
      max_tool_calls: z.number().int().positive().optional(),
      require_citations: z.boolean().optional(),
      source_policy: z.enum(["workspace", "web", "hybrid", "verified"]).optional(),
      workspace_dir: z.string().optional(),
    })
    .optional(),

  runtime: z
    .object({
      default_profile: z.string().optional(),
      profiles: z.array(runtimeProfileDeclSchema).optional(),
    })
    .optional(),

  presentation: z
    .object({
      web: z
        .object({
          enabled: z.boolean().optional(),
          dev_url_env: z.string().optional(),
          api_base_url_env: z.string().optional(),
        })
        .optional(),
      desktop: z
        .object({
          enabled: z.boolean().optional(),
          web_url_env: z.string().optional(),
          preload_contract: z.enum(["strict-ipc"]).optional(),
        })
        .optional(),
    })
    .optional(),

  features: z
    .object({
      tool_search: z.boolean().optional(),
      lazy_schema_injection: z.boolean().optional(),
      progressive_skill_loading: z.boolean().optional(),
      cost_tracking: z.boolean().optional(),
    })
    .optional(),

  telemetry: z
    .object({
      mode: z.enum(["off", "local", "remote"]).optional(),
      otel: z.boolean().optional(),
    })
    .optional(),
});

export const policyYamlSchema = z.object({
  schemaVersion: z.number().int().positive(),
  workspaceTrust: z.enum(["trusted", "untrusted", "ask"]).optional(),

  shell: z
    .object({
      hostExecution: z.enum(["allow", "deny", "ask"]).optional(),
      allowlist: z.array(z.string()).optional(),
      denylist: z.array(z.string()).optional(),
    })
    .optional(),

  mcp: z
    .object({
      allowRemoteHttp: z.boolean().optional(),
      allowLegacySse: z.enum(["allow", "deny", "ask"]).optional(),
      approvedServers: z.array(z.string()).optional(),
      deniedServers: z.array(z.string()).optional(),
      readonlyTools: z.array(z.string()).optional(),
    })
    .optional(),

  skills: z
    .object({
      allowExternalScripts: z.enum(["allow", "deny", "ask"]).optional(),
      allowAllowedToolsField: z.enum(["allow", "deny", "ask"]).optional(),
    })
    .optional(),

  privacy: z
    .object({
      redactEnv: z.array(z.string()).optional(),
      disablePromptLogging: z.boolean().optional(),
    })
    .optional(),

  budget: z
    .object({
      max_cost_per_session_usd: z.number().positive().optional(),
      max_cost_per_day_usd: z.number().positive().optional(),
      alert_threshold_pct: z.number().min(0).max(100).optional(),
    })
    .optional(),

  network: z
    .object({
      allowed_domains: z.array(z.string()).optional(),
      denied_domains: z.array(z.string()).optional(),
    })
    .optional(),

  registry: z
    .object({
      allowed_sources: z.array(z.string()).optional(),
      denied_sources: z.array(z.string()).optional(),
      require_provenance: z.boolean().optional(),
      require_signature: z.boolean().optional(),
    })
    .optional(),

  model: z
    .object({
      allowed_providers: z.array(z.string()).optional(),
      allowed_models: z.array(z.string()).optional(),
      denied_models: z.array(z.string()).optional(),
    })
    .optional(),

  filesystem: z
    .object({
      allowWrite: z.enum(["allow", "deny", "ask"]).optional(),
      allowScripts: z.enum(["allow", "deny", "ask"]).optional(),
      allowBrowser: z.enum(["allow", "deny", "ask"]).optional(),
      allowExternalHttp: z.enum(["allow", "deny", "ask"]).optional(),
    })
    .optional(),
});

export const localConfigSchema = z.object({
  model_override: z.string().optional(),
  env_overrides: z.record(z.string()).optional(),
  feature_overrides: z.record(z.boolean()).optional(),
});

export {
  providerTypeSchema,
  modelProviderDeclSchema,
  registrySourceSchema,
  runtimeProfileDeclSchema,
  runtimeServiceDeclSchema,
};

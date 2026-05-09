export type ProviderType =
  | "openai"
  | "aliyun-bailian"
  | "volcengine-ark"
  | "deepseek"
  | "azure"
  | "anthropic"
  | "ollama"
  | "vllm"
  | "litellm"
  | "compatible";

export interface ModelProviderDecl {
  name: string;
  type: ProviderType;
  base_url?: string;
  api_key_env?: string;
  models?: string[];
  default_model?: string;
  timeout?: number;
  max_retries?: number;
  capabilities?: Record<string, boolean>;
}

export interface RegistrySource {
  name: string;
  url: string;
  type?: "npm" | "oci" | "kirakira";
  auth_token_env?: string;
  priority?: number;
}

export interface AgentToml {
  schema_version: number;
  workspace_name?: string;
  trust?: "trusted" | "untrusted" | "ask";

  model?: {
    default: string;
    fallback?: string;
    providers?: ModelProviderDecl[];
    max_cost_per_session_usd?: number;
  };

  ui?: {
    theme?: string;
    vim_mode?: boolean;
    show_trace_ids?: boolean;
  };

  output?: {
    default?: "human" | "json" | "jsonl";
    exec_default?: "human" | "json" | "jsonl";
  };

  approvals?: {
    mode?: "ask" | "auto" | "deny";
    auto_run_readonly?: boolean;
  };

  sandbox?: {
    mode?: "container" | "host" | "none";
    network?: "restricted" | "full" | "none";
  };

  skills?: {
    discover?: string[];
  };

  mcp?: {
    config_files?: string[];
    tool_search?: boolean;
    lazy_schema?: boolean;
  };

  compat?: {
    read_claude?: boolean;
    read_codex?: boolean;
    read_cursor?: boolean;
    read_copilot?: boolean;
    read_gemini?: boolean;
  };

  registry?: {
    sources?: RegistrySource[];
    default_source?: string;
    install_scope?: "workspace" | "user";
  };

  features?: {
    tool_search?: boolean;
    lazy_schema_injection?: boolean;
    progressive_skill_loading?: boolean;
    cost_tracking?: boolean;
  };

  telemetry?: {
    mode?: "off" | "local" | "remote";
    otel?: boolean;
  };
}

export interface PolicyYaml {
  schemaVersion: number;
  workspaceTrust?: "trusted" | "untrusted" | "ask";

  shell?: {
    hostExecution?: "allow" | "deny" | "ask";
    allowlist?: string[];
    denylist?: string[];
  };

  mcp?: {
    allowRemoteHttp?: boolean;
    allowLegacySse?: "allow" | "deny" | "ask";
    approvedServers?: string[];
    deniedServers?: string[];
    readonlyTools?: string[];
  };

  skills?: {
    allowExternalScripts?: "allow" | "deny" | "ask";
    allowAllowedToolsField?: "allow" | "deny" | "ask";
  };

  privacy?: {
    redactEnv?: string[];
    disablePromptLogging?: boolean;
  };

  budget?: {
    max_cost_per_session_usd?: number;
    max_cost_per_day_usd?: number;
    alert_threshold_pct?: number;
  };

  network?: {
    allowed_domains?: string[];
    denied_domains?: string[];
  };

  registry?: {
    allowed_sources?: string[];
    denied_sources?: string[];
    require_provenance?: boolean;
    require_signature?: boolean;
  };

  model?: {
    allowed_providers?: string[];
    allowed_models?: string[];
    denied_models?: string[];
  };

  filesystem?: {
    allowWrite?: "allow" | "deny" | "ask";
    allowScripts?: "allow" | "deny" | "ask";
    allowBrowser?: "allow" | "deny" | "ask";
    allowExternalHttp?: "allow" | "deny" | "ask";
  };
}

export interface LocalConfig {
  model_override?: string;
  env_overrides?: Record<string, string>;
  feature_overrides?: Record<string, boolean>;
}

export type ConfigLayerName = "system" | "user" | "repo" | "workspace";

export interface ConfigLayer {
  name: ConfigLayerName;
  path?: string;
  data: Partial<AgentToml>;
}

export interface ResolvedConfig {
  agentToml: Required<AgentToml>;
  policyYaml: Required<PolicyYaml>;
  localConfig?: LocalConfig;
  layers: ConfigLayer[];
  configPaths: {
    agentToml?: string;
    policyYaml?: string;
    localConfig?: string;
  };
  fingerprint: string;
  resolvedAt: string;
}

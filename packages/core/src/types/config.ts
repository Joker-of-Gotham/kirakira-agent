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

export type HandoffMode = "tool" | "supervisor" | "swarm";
export type SubagentContextMode = "isolated" | "filtered" | "inherit";

export interface OrchestrationConfig {
  handoff_mode?: HandoffMode;
  max_concurrency?: number;
  default_subagent_turns?: number;
  subagent_system_preamble?: string;
  subagent_context?: SubagentContextMode;
  trace_handoffs?: boolean;
}

export type ResearchSourcePolicy = "workspace" | "web" | "hybrid" | "verified";

export interface DeepResearchConfig {
  enabled?: boolean;
  max_depth?: number;
  max_breadth?: number;
  max_tool_calls?: number;
  require_citations?: boolean;
  source_policy?: ResearchSourcePolicy;
  workspace_dir?: string;
}

export interface RuntimeServiceDecl {
  name: string;
  url_env?: string;
  required?: boolean;
}

export interface RuntimeProfileDecl {
  name: string;
  mode: "container" | "host" | "hybrid";
  compose_profiles?: string[];
  env_files?: string[];
  workspace_root_env?: string;
  services?: RuntimeServiceDecl[];
}

export interface PresentationConfig {
  web?: {
    enabled?: boolean;
    dev_url_env?: string;
    api_base_url_env?: string;
  };
  desktop?: {
    enabled?: boolean;
    web_url_env?: string;
    preload_contract?: "strict-ipc";
  };
}

export interface ResolvedRuntimeServiceState {
  name: string;
  url_env?: string;
  required?: boolean;
  compose_service?: string;
}

export interface ResolvedRuntimeMcpServerState {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface ResolvedRuntimePresentationState {
  web?: {
    url?: string;
    host?: string;
    port?: string | number;
  };
  desktop?: {
    renderer_url?: string;
    host?: string;
    port?: string | number;
  };
}

export interface ResolvedRuntimeBrowserGatewayState {
  enabled?: boolean;
  endpoint?: string;
  host?: string;
  port?: string | number;
  path?: string;
}

export interface ResolvedRuntimeMemoryState {
  enabled?: boolean;
  services?: ResolvedRuntimeServiceState[];
  vector?: {
    backend?: "qdrant" | "pgvector";
    url_env?: string;
    host_env?: string;
    port_env?: string;
    api_key_env?: string;
    collection?: string;
  };
  graph?: {
    backend?: "neo4j" | "kuzu";
    uri_env?: string;
    username_env?: string;
    password_env?: string;
    database?: string;
  };
  blob?: {
    backend?: "s3";
    endpoint_env?: string;
    bucket?: string;
    region?: string;
    access_key_id_env?: string;
    secret_access_key_env?: string;
  };
  embedding?: {
    model?: string;
    api_key_env?: string;
    base_url_env?: string;
  };
  recall?: {
    token_budget?: number;
    limit?: number;
    level?: string;
  };
}

export interface ResolvedRuntimeProfileState {
  name: string;
  mode: "container" | "host" | "hybrid";
  workspace_root?: string;
  app_root?: string;
  compose_files?: string[];
  compose_profiles?: string[];
  env_files?: string[];
  service_groups?: string[];
  services?: ResolvedRuntimeServiceState[];
  runtime_services?: string[];
  workbench_infra_services?: string[];
  mcp_workspace_root?: string;
  mcp_app_root?: string;
  mcp_server_groups?: string[];
  mcp_servers?: ResolvedRuntimeMcpServerState[];
  presentation?: ResolvedRuntimePresentationState;
  browser_gateway?: ResolvedRuntimeBrowserGatewayState;
  memory?: ResolvedRuntimeMemoryState;
}

export interface ResolvedRuntimeState {
  default_profile?: string;
  profiles: ResolvedRuntimeProfileState[];
  service_catalog?: {
    groups?: Record<string, string[]>;
    services?: Record<string, { compose_service?: string }>;
  };
  mcp_catalog?: {
    default_server_groups?: string[];
    groups?: Record<string, string[]>;
    servers?: string[];
  };
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

  orchestration?: OrchestrationConfig;
  deep_research?: DeepResearchConfig;
  runtime?: {
    default_profile?: string;
    profiles?: RuntimeProfileDecl[];
  };
  presentation?: PresentationConfig;

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
    runtimeProfiles?: string;
  };
  runtimeState?: ResolvedRuntimeState;
  fingerprint: string;
  resolvedAt: string;
}

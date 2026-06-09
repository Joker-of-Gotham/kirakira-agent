import type { AgentToml, PolicyYaml } from "@kirakira/core";
import { SCHEMA_VERSIONS, SKILL_DISCOVERY_DIRS } from "@kirakira/core";

export function defaultAgentToml(): Required<AgentToml> {
  return {
    schema_version: SCHEMA_VERSIONS.agentToml,
    workspace_name: "default",
    trust: "ask",
    model: {
      default: "",
      fallback: "",
      providers: [],
      max_cost_per_session_usd: undefined as unknown as number,
    },
    ui: {
      theme: "default",
      vim_mode: false,
      show_trace_ids: false,
    },
    output: {
      default: "human",
      exec_default: "json",
    },
    approvals: {
      mode: "ask",
      auto_run_readonly: false,
    },
    sandbox: {
      mode: "container",
      network: "restricted",
    },
    skills: {
      discover: [...SKILL_DISCOVERY_DIRS],
    },
    mcp: {
      config_files: [".mcp.json", ".cursor/mcp.json"],
      tool_search: true,
      lazy_schema: true,
    },
    compat: {
      read_claude: true,
      read_codex: true,
      read_cursor: true,
      read_copilot: true,
      read_gemini: true,
    },
    registry: {
      sources: [],
      default_source: undefined as unknown as string,
      install_scope: "workspace",
    },
    orchestration: {
      handoff_mode: "tool",
      max_concurrency: 4,
      default_subagent_turns: 32,
      subagent_system_preamble:
        "Operate as a bounded specialist subagent. Stay within the delegated scope, use only granted tools and skills, and return concise evidence-backed results.",
      subagent_context: "filtered",
      trace_handoffs: true,
      topology: {
        mode: "tool",
        default_role: "supervisor",
        lanes: {
          delegated: { capacity: 4 },
        },
        roles: [
          {
            id: "supervisor",
            description: "Plans work, decides handoffs, and synthesizes results.",
            lane: "foreground",
            context: "filtered",
          },
          {
            id: "delegate",
            description: "Executes bounded specialist tasks with explicit capability scope.",
            lane: "delegated",
            context: "isolated",
          },
        ],
        handoffs: [
          {
            from: "supervisor",
            to: "delegate",
            mode: "tool",
            input_filter: "scoped-task-brief",
          },
        ],
      },
    },
    deep_research: {
      enabled: false,
      max_depth: 3,
      max_breadth: 4,
      max_tool_calls: 24,
      require_citations: true,
      source_policy: "hybrid",
      workspace_dir: ".kirakira/research",
    },
    runtime: {
      default_profile: "container",
      profiles: [
        {
          name: "container",
          mode: "container",
          compose_profiles: ["cli"],
          env_files: [".env"],
          workspace_root_env: "KIRAKIRA_WORKSPACE_ROOT",
          services: [
            { name: "postgres", url_env: "DATABASE_URL", required: true },
            { name: "redis", url_env: "REDIS_URL", required: true },
            { name: "qdrant", url_env: "QDRANT_URL", required: true },
            { name: "neo4j", url_env: "NEO4J_URI", required: true },
            { name: "minio", url_env: "S3_ENDPOINT", required: true },
            { name: "kirakirad", url_env: "KIRAKIRA_PDP_ENDPOINT", required: true },
          ],
        },
        {
          name: "host",
          mode: "host",
          env_files: [".env"],
          workspace_root_env: "KIRAKIRA_WORKSPACE_ROOT",
          services: [
            { name: "kirakirad", url_env: "KIRAKIRA_PDP_ENDPOINT", required: false },
          ],
        },
      ],
    },
    presentation: {
      web: {
        enabled: false,
        dev_url_env: "KIRAKIRA_WEB_URL",
        api_base_url_env: "KIRAKIRA_API_BASE_URL",
      },
      desktop: {
        enabled: false,
        web_url_env: "KIRAKIRA_WEB_URL",
        preload_contract: "strict-ipc",
      },
    },
    features: {
      tool_search: true,
      lazy_schema_injection: true,
      progressive_skill_loading: true,
      cost_tracking: false,
    },
    telemetry: {
      mode: "off",
      otel: false,
    },
  };
}

export function defaultPolicyYaml(): Required<PolicyYaml> {
  return {
    schemaVersion: SCHEMA_VERSIONS.policyYaml,
    workspaceTrust: "ask",
    shell: {
      hostExecution: "deny",
      allowlist: ["git:*", "pytest:*", "python -m pytest:*"],
      denylist: ["rm:*", "sudo:*", "curl * | bash"],
    },
    mcp: {
      allowRemoteHttp: true,
      allowLegacySse: "ask",
      approvedServers: [],
      deniedServers: [],
    },
    skills: {
      allowExternalScripts: "ask",
      allowAllowedToolsField: "ask",
    },
    privacy: {
      redactEnv: [
        "OPENAI_API_KEY",
        "GITHUB_TOKEN",
        "AWS_SECRET_ACCESS_KEY",
        "LLM_API_KEY",
      ],
      disablePromptLogging: false,
    },
    budget: {
      max_cost_per_session_usd: undefined as unknown as number,
      max_cost_per_day_usd: undefined as unknown as number,
      alert_threshold_pct: 80,
    },
    network: {
      allowed_domains: [],
      denied_domains: [],
    },
    registry: {
      allowed_sources: [],
      denied_sources: [],
      require_provenance: false,
      require_signature: false,
    },
    model: {
      allowed_providers: [],
      allowed_models: [],
      denied_models: [],
    },
    filesystem: {
      allowWrite: "ask",
      allowScripts: "ask",
      allowBrowser: "ask",
      allowExternalHttp: "ask",
    },
  };
}

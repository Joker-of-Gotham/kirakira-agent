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

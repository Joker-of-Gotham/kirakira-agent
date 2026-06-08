/**
 * Compute the final resolved config by merging all layers, applying local
 * overrides, and generating a deterministic fingerprint for cache invalidation.
 * Supports persisting the resolved state to disk for audit and reproducibility.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { sha256Hex, SCHEMA_VERSIONS } from "@kirakira/core";

import type {
  AgentToml,
  ConfigLayer,
  LocalConfig,
  PolicyYaml,
  ResolvedConfig,
} from "./types.js";
import { deepMerge } from "./merger.js";

const DEFAULT_AGENT_TOML: Required<AgentToml> = {
  schema_version: SCHEMA_VERSIONS.agentToml,
  workspace_name: "",
  trust: "ask",
  model: {
    default: "gpt-4o-mini",
    fallback: "gpt-4o-mini",
    providers: [],
    max_cost_per_session_usd: undefined as unknown as number,
  },
  ui: { theme: "default", vim_mode: false, show_trace_ids: false },
  output: { default: "human", exec_default: "json" },
  approvals: { mode: "ask", auto_run_readonly: false },
  sandbox: { mode: "container", network: "restricted" },
  skills: { discover: [".kirakira/skills"] },
  mcp: { config_files: [".mcp.json"], tool_search: true, lazy_schema: true },
  compat: {
    read_claude: true,
    read_codex: true,
    read_cursor: true,
    read_copilot: true,
    read_gemini: true,
  },
  registry: { sources: [], default_source: undefined as unknown as string, install_scope: "workspace" },
  orchestration: {
    handoff_mode: "tool",
    max_concurrency: 4,
    default_subagent_turns: 32,
    subagent_system_preamble: "Operate as a bounded specialist subagent. Stay within the delegated scope, use only granted tools and skills, and return concise evidence-backed results.",
    subagent_context: "filtered",
    trace_handoffs: true,
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
  telemetry: { mode: "off", otel: false },
};

const DEFAULT_POLICY_YAML: Required<PolicyYaml> = {
  schemaVersion: SCHEMA_VERSIONS.policyYaml,
  workspaceTrust: "ask",
  shell: { hostExecution: "deny", allowlist: [], denylist: [] },
  mcp: {
    allowRemoteHttp: true,
    allowLegacySse: "ask",
    approvedServers: [],
    deniedServers: [],
    readonlyTools: [],
  },
  skills: { allowExternalScripts: "ask", allowAllowedToolsField: "ask" },
  privacy: { redactEnv: [], disablePromptLogging: false },
  budget: {
    max_cost_per_session_usd: undefined as unknown as number,
    max_cost_per_day_usd: undefined as unknown as number,
    alert_threshold_pct: 80,
  },
  network: { allowed_domains: [], denied_domains: [] },
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
    allowBrowser: "deny",
    allowExternalHttp: "ask",
  },
};

export interface ResolveConfigOptions {
  policyYamlPath?: string;
}

export function resolveConfig(
  layers: ConfigLayer[],
  policyYaml: PolicyYaml | undefined,
  localConfig: LocalConfig | undefined,
  options?: ResolveConfigOptions,
): ResolvedConfig {
  const partials = layers.map((l) => l.data);
  const merged = deepMerge(DEFAULT_AGENT_TOML as Record<string, unknown>, ...partials) as Required<AgentToml>;

  if (localConfig?.model_override && merged.model) {
    merged.model.default = localConfig.model_override;
  }

  const resolvedPolicy = policyYaml
    ? deepMerge(DEFAULT_POLICY_YAML as Record<string, unknown>, policyYaml as unknown as Record<string, unknown>) as Required<PolicyYaml>
    : { ...DEFAULT_POLICY_YAML };

  const agentTomlPath = layers.find((l) => l.name === "repo")?.path;
  const policyYamlPath = options?.policyYamlPath ?? layers.find((l) => l.name === "repo" && l.path)?.path?.replace(/agent\.toml$/, "policy.yaml");
  const localConfigPath = layers.find((l) => l.name === "workspace")?.path;

  const fingerprint = computeFingerprint(merged, resolvedPolicy);

  return {
    agentToml: merged,
    policyYaml: resolvedPolicy,
    localConfig,
    layers,
    configPaths: {
      agentToml: agentTomlPath,
      policyYaml: policyYamlPath,
      localConfig: localConfigPath,
    },
    fingerprint,
    resolvedAt: new Date().toISOString(),
  };
}

function computeFingerprint(
  agentToml: Required<AgentToml>,
  policyYaml: Required<PolicyYaml>,
): string {
  const payload = JSON.stringify({ agentToml, policyYaml }, null, 0);
  return sha256Hex(payload).slice(0, 16);
}

const RESOLVED_STATE_FILENAME = ".kirakira/resolved-state.json";

export function persistResolvedState(
  workspaceRoot: string,
  config: ResolvedConfig,
): string {
  const outPath = join(workspaceRoot, RESOLVED_STATE_FILENAME);
  const outDir = dirname(outPath);
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }
  const payload = {
    fingerprint: config.fingerprint,
    resolvedAt: config.resolvedAt,
    agentToml: config.agentToml,
    policyYaml: config.policyYaml,
    layerSources: config.layers.map((l) => ({
      name: l.name,
      path: l.path,
    })),
    configPaths: config.configPaths,
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf-8");
  return outPath;
}

export function loadPersistedResolvedState(
  workspaceRoot: string,
): { fingerprint: string; resolvedAt: string } | null {
  const filePath = join(workspaceRoot, RESOLVED_STATE_FILENAME);
  if (!existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf-8")) as {
      fingerprint?: string;
      resolvedAt?: string;
    };
    if (raw.fingerprint && raw.resolvedAt) {
      return { fingerprint: raw.fingerprint, resolvedAt: raw.resolvedAt };
    }
    return null;
  } catch {
    return null;
  }
}

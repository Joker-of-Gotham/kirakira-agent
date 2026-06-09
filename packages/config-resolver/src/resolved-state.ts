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
  ResolvedRuntimeMcpServerState,
  ResolvedRuntimeProfileState,
  ResolvedRuntimeState,
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
  runtimeProfilesPath?: string;
  runtimeProfilesConfig?: unknown;
  runtimeEnv?: Record<string, string | undefined>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function recordMap(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function envNames(target: unknown): string[] {
  if (typeof target === "string") return [target];
  if (Array.isArray(target)) return target.filter((name): name is string => typeof name === "string");
  if (isRecord(target)) return envNames(target.env);
  return [];
}

function firstEnvValue(target: unknown, env: Record<string, string | undefined>): string | undefined {
  for (const name of envNames(target)) {
    const value = env[name];
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

function configuredValue(spec: unknown, env: Record<string, string | undefined>): unknown {
  if (!isRecord(spec)) return spec;
  const envValue = firstEnvValue(spec.env, env);
  if (envValue !== undefined) return envValue;
  if (Object.prototype.hasOwnProperty.call(spec, "default")) return spec.default;
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return String(value);
}

function portValue(value: unknown): string | number | undefined {
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

function groupRefs(groups: unknown): string[] {
  return stringArray(groups).map((group) => `@${group}`);
}

function expandRefs(refs: string[], groups: Record<string, unknown>): string[] {
  const expanded: string[] = [];
  for (const ref of refs) {
    if (!ref.startsWith("@")) {
      expanded.push(ref);
      continue;
    }
    expanded.push(...stringArray(groups[ref.slice(1)]));
  }
  return [...new Set(expanded)];
}

function runtimeProfilesPathFromLayers(layers: ConfigLayer[]): string | undefined {
  const repoPath = layers.find((layer) => layer.name === "repo")?.path;
  return repoPath ? join(dirname(repoPath), "configs", "runtime", "profiles.json") : undefined;
}

function loadRuntimeProfilesConfig(options: ResolveConfigOptions | undefined, layers: ConfigLayer[]) {
  if (options?.runtimeProfilesConfig !== undefined) {
    return {
      config: isRecord(options.runtimeProfilesConfig) ? options.runtimeProfilesConfig : undefined,
      path: options.runtimeProfilesPath,
    };
  }
  const candidatePath = options?.runtimeProfilesPath ?? runtimeProfilesPathFromLayers(layers);
  if (!candidatePath || !existsSync(candidatePath)) return { config: undefined, path: candidatePath };
  const parsed = JSON.parse(readFileSync(candidatePath, "utf-8")) as unknown;
  return { config: isRecord(parsed) ? parsed : undefined, path: candidatePath };
}

function renderAuthority(host: string, port: unknown): string {
  const hostPart = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  const portPart = port === undefined || port === "" ? "" : `:${port}`;
  return `${hostPart}${portPart}`;
}

function resolveEndpoint(
  endpoint: unknown,
  env: Record<string, string | undefined>,
  options: { protocol: "http" | "ws"; urlField: string },
): Record<string, string | number | boolean> | undefined {
  if (!isRecord(endpoint)) return undefined;
  const resolved: Record<string, unknown> = { ...endpoint };
  for (const key of ["protocol", "host", "port", "path", options.urlField, "enabled"]) {
    const value = configuredValue(endpoint[key], env);
    if (value !== undefined) resolved[key] = value;
  }
  if (
    typeof resolved[options.urlField] !== "string"
    && typeof resolved.host === "string"
    && resolved.port !== undefined
  ) {
    const protocol = stringValue(resolved.protocol) ?? options.protocol;
    const path = typeof resolved.path === "string"
      ? (resolved.path.startsWith("/") ? resolved.path : `/${resolved.path}`)
      : "";
    resolved[options.urlField] = `${protocol}://${renderAuthority(resolved.host, resolved.port)}${path}`;
  }
  return Object.fromEntries(
    Object.entries(resolved).filter(([, value]) =>
      ["string", "number", "boolean"].includes(typeof value),
    ),
  ) as Record<string, string | number | boolean>;
}

function renderTemplate(value: string, context: Record<string, string | undefined>): string {
  return value.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/gu, (_match, key) => {
    const replacement = context[key];
    if (replacement === undefined) {
      throw new Error(`Unknown runtime MCP template variable "${key}"`);
    }
    return replacement;
  });
}

function renderDescriptorValue(value: unknown, context: Record<string, string | undefined>): string {
  if (typeof value === "string") return renderTemplate(value, context);
  if (isRecord(value) && typeof value.value === "string") {
    const resolved = context[value.value];
    if (resolved === undefined) throw new Error(`Unknown runtime MCP value "${value.value}"`);
    return resolved;
  }
  if (isRecord(value) && Array.isArray(value.join)) {
    const [rootKey, ...segments] = value.join;
    if (typeof rootKey !== "string" || context[rootKey] === undefined) {
      throw new Error(`Unknown runtime MCP join root "${String(rootKey)}"`);
    }
    return [context[rootKey], ...segments.map((segment) => renderDescriptorValue(segment, context))]
      .filter((segment): segment is string => Boolean(segment))
      .join("/")
      .replace(/\/+/gu, "/")
      .replace(/^\.\//u, "");
  }
  return String(value);
}

function renderMcpServerState(
  name: string,
  descriptor: unknown,
  context: Record<string, string | undefined>,
): ResolvedRuntimeMcpServerState | undefined {
  if (!isRecord(descriptor) || descriptor.command === undefined) return undefined;
  const args = Array.isArray(descriptor.args)
    ? descriptor.args.map((arg) => renderDescriptorValue(arg, context))
    : undefined;
  const env = isRecord(descriptor.env)
    ? Object.fromEntries(
        Object.entries(descriptor.env).map(([key, value]) => [key, renderDescriptorValue(value, context)]),
      )
    : undefined;
  return {
    name,
    command: renderDescriptorValue(descriptor.command, context),
    ...(args ? { args } : {}),
    ...(env ? { env } : {}),
  };
}

function runtimeStateFromAgentToml(runtime: Required<AgentToml>["runtime"]): ResolvedRuntimeState {
  return {
    default_profile: runtime.default_profile,
    profiles: (runtime.profiles ?? []).map((profile) => ({
      name: profile.name,
      mode: profile.mode,
      compose_profiles: profile.compose_profiles,
      env_files: profile.env_files,
      services: profile.services,
    })),
  };
}

function serviceEnvBindings(config: Record<string, unknown>): Record<string, unknown> {
  const envBindings = recordMap(config.envBindings);
  return recordMap(envBindings.services);
}

function serviceCatalog(config: Record<string, unknown>) {
  return recordMap(config.serviceCatalog);
}

function mcpCatalog(config: Record<string, unknown>) {
  return recordMap(config.mcpCatalog);
}

function projectRuntimeProfile(
  name: string,
  rawProfile: Record<string, unknown>,
  config: Record<string, unknown>,
  env: Record<string, string | undefined>,
): ResolvedRuntimeProfileState {
  const serviceGroups = stringArray(rawProfile.serviceEndpointGroups);
  const servicesByName = recordMap(serviceCatalog(config).services);
  const serviceGroupMap = recordMap(serviceCatalog(config).groups);
  const endpointNames = expandRefs(
    [
      ...groupRefs(rawProfile.serviceEndpointGroups),
      ...Object.keys(recordMap(rawProfile.serviceEndpoints)),
      ...Object.keys(recordMap(rawProfile.services)),
    ],
    serviceGroupMap,
  );
  const serviceEnv = serviceEnvBindings(config);
  const mcp = recordMap(rawProfile.mcp);
  const mcpWorkspaceRoot = stringValue(env.KIRAKIRA_MCP_WORKSPACE_ROOT)
    ?? stringValue(env.KIRAKIRA_WORKSPACE_ROOT)
    ?? stringValue(mcp.workspaceRoot)
    ?? stringValue(rawProfile.workspaceRoot);
  const mcpAppRoot = stringValue(env.KIRAKIRA_MCP_APP_ROOT)
    ?? stringValue(env.KIRAKIRA_APP_ROOT)
    ?? stringValue(mcp.appRoot)
    ?? stringValue(rawProfile.appRoot);
  const catalog = mcpCatalog(config);
  const mcpGroups = recordMap(catalog.groups);
  const explicitMcpRefs = stringArray(mcp.serverRefs);
  const mcpServerRefs = explicitMcpRefs.length > 0
    ? explicitMcpRefs
    : [
        ...groupRefs(stringArray(mcp.serverGroups).length > 0 ? mcp.serverGroups : catalog.defaultServerGroups),
        ...stringArray(mcp.servers),
      ];
  const mcpServerNames = expandRefs(mcpServerRefs, mcpGroups);
  const mcpServers = recordMap(catalog.servers);
  const mcpContext = {
    profileName: name,
    mode: stringValue(rawProfile.mode),
    workspaceRoot: mcpWorkspaceRoot,
    appRoot: mcpAppRoot,
  };
  const daemon = recordMap(rawProfile.daemon);
  const browserGateway = resolveEndpoint(recordMap(daemon.browserGateway), env, {
    protocol: "ws",
    urlField: "endpoint",
  });
  const presentation = recordMap(rawProfile.presentation);
  const web = resolveEndpoint(recordMap(presentation.web), env, { protocol: "http", urlField: "url" });
  const desktop = resolveEndpoint(recordMap(presentation.desktop), env, {
    protocol: "http",
    urlField: "rendererUrl",
  });
  const containerStartup = recordMap(rawProfile.containerStartup);
  const workbench = recordMap(rawProfile.workbench);

  return {
    name,
    mode: rawProfile.mode === "hybrid" ? "hybrid" : rawProfile.mode === "host" ? "host" : "container",
    workspace_root: stringValue(env.KIRAKIRA_WORKSPACE_ROOT) ?? stringValue(rawProfile.workspaceRoot),
    app_root: stringValue(env.KIRAKIRA_APP_ROOT) ?? stringValue(rawProfile.appRoot),
    compose_files: stringArray(rawProfile.composeFiles),
    compose_profiles: stringArray(rawProfile.composeProfiles),
    env_files: stringArray(rawProfile.envFiles),
    service_groups: serviceGroups,
    services: endpointNames.map((serviceName) => {
      const catalogEntry = recordMap(servicesByName[serviceName]);
      return {
        name: serviceName,
        url_env: stringValue(serviceEnv[serviceName]),
        required: true,
        compose_service: stringValue(catalogEntry.composeService),
      };
    }),
    runtime_services: expandRefs(
      [...groupRefs(containerStartup.runtimeServiceGroups), ...stringArray(containerStartup.runtimeServices)],
      serviceGroupMap,
    ),
    workbench_infra_services: expandRefs(
      [...groupRefs(workbench.infraServiceGroups), ...stringArray(workbench.infraServices)],
      serviceGroupMap,
    ),
    mcp_workspace_root: mcpWorkspaceRoot,
    mcp_app_root: mcpAppRoot,
    mcp_server_groups: stringArray(mcp.serverGroups).length > 0
      ? stringArray(mcp.serverGroups)
      : stringArray(catalog.defaultServerGroups),
    mcp_servers: mcpServerNames
      .map((serverName) => renderMcpServerState(serverName, mcpServers[serverName], mcpContext))
      .filter((server): server is ResolvedRuntimeMcpServerState => Boolean(server)),
    presentation: {
      ...(web ? {
        web: {
          url: stringValue(web.url),
          host: stringValue(web.host),
          port: portValue(web.port),
        },
      } : {}),
      ...(desktop ? {
        desktop: {
          renderer_url: stringValue(desktop.rendererUrl),
          host: stringValue(desktop.host),
          port: portValue(desktop.port),
        },
      } : {}),
    },
    ...(browserGateway ? {
      browser_gateway: {
        enabled: typeof browserGateway.enabled === "boolean" ? browserGateway.enabled : undefined,
        endpoint: stringValue(browserGateway.endpoint),
        host: stringValue(browserGateway.host),
        port: portValue(browserGateway.port),
        path: stringValue(browserGateway.path),
      },
    } : {}),
  };
}

function projectRuntimeState(
  runtime: Required<AgentToml>["runtime"],
  runtimeProfilesConfig: Record<string, unknown> | undefined,
  env: Record<string, string | undefined>,
): ResolvedRuntimeState {
  if (!runtimeProfilesConfig || !isRecord(runtimeProfilesConfig.profiles)) {
    return runtimeStateFromAgentToml(runtime);
  }
  const profiles = Object.entries(runtimeProfilesConfig.profiles)
    .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
    .map(([name, rawProfile]) => projectRuntimeProfile(name, rawProfile, runtimeProfilesConfig, env));
  const services = recordMap(serviceCatalog(runtimeProfilesConfig).services);
  return {
    default_profile: stringValue(runtimeProfilesConfig.defaultProfile) ?? runtime.default_profile,
    profiles,
    service_catalog: {
      groups: Object.fromEntries(
        Object.entries(recordMap(serviceCatalog(runtimeProfilesConfig).groups))
          .map(([groupName, group]) => [groupName, stringArray(group)]),
      ),
      services: Object.fromEntries(
        Object.entries(services).map(([serviceName, service]) => [
          serviceName,
          { compose_service: stringValue(recordMap(service).composeService) },
        ]),
      ),
    },
    mcp_catalog: {
      default_server_groups: stringArray(mcpCatalog(runtimeProfilesConfig).defaultServerGroups),
      groups: Object.fromEntries(
        Object.entries(recordMap(mcpCatalog(runtimeProfilesConfig).groups))
          .map(([groupName, group]) => [groupName, stringArray(group)]),
      ),
      servers: Object.keys(recordMap(mcpCatalog(runtimeProfilesConfig).servers)),
    },
  };
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
  const policyYamlPath = options?.policyYamlPath
    ?? (policyYaml
      ? layers.find((l) => l.name === "repo" && l.path)?.path?.replace(/agent\.toml$/, "policy.yaml")
      : undefined);
  const localConfigPath = layers.find((l) => l.name === "workspace")?.path;
  const runtimeProfiles = loadRuntimeProfilesConfig(options, layers);
  const runtimeState = projectRuntimeState(
    merged.runtime,
    runtimeProfiles.config,
    options?.runtimeEnv ?? process.env,
  );

  const fingerprint = computeFingerprint(merged, resolvedPolicy, runtimeState);

  return {
    agentToml: merged,
    policyYaml: resolvedPolicy,
    localConfig,
    layers,
    configPaths: {
      agentToml: agentTomlPath,
      policyYaml: policyYamlPath,
      localConfig: localConfigPath,
      runtimeProfiles: runtimeProfiles.path,
    },
    runtimeState,
    fingerprint,
    resolvedAt: new Date().toISOString(),
  };
}

function computeFingerprint(
  agentToml: Required<AgentToml>,
  policyYaml: Required<PolicyYaml>,
  runtimeState: ResolvedRuntimeState,
): string {
  const payload = JSON.stringify({ agentToml, policyYaml, runtimeState }, null, 0);
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
    runtimeState: config.runtimeState,
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

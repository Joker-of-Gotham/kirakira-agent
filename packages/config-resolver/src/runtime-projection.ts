import type {
  ResolvedRuntimeMcpServerState,
  ResolvedRuntimeProfileState,
  ResolvedRuntimeServiceState,
  ResolvedRuntimeState,
} from "./types.js";

export interface RuntimeProjectionMcpConfigPlan {
  schemaVersion: 1;
  profile: string;
  mode: ResolvedRuntimeProfileState["mode"];
  source: "resolved-runtime-state.mcp";
  roots: {
    workspaceRoot?: string;
    appRoot?: string;
  };
  servers: string[];
  config: {
    mcpServers: Record<string, {
      command: string;
      args?: string[];
      env?: Record<string, string>;
    }>;
  };
}

export interface RuntimeProjectionMcpServerPlan {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface RuntimeProjectionMcpPlan {
  roots: RuntimeProjectionMcpConfigPlan["roots"];
  servers: RuntimeProjectionMcpServerPlan[];
  config: RuntimeProjectionMcpConfigPlan["config"];
}

export interface RuntimeProjectionEnvVariable {
  name: string;
  generated: boolean;
  value?: string;
}

export interface RuntimeProjectionEnvPlan {
  schemaVersion: 1;
  profile: string;
  mode: ResolvedRuntimeProfileState["mode"];
  source: "resolved-runtime-state.env";
  envFiles: string[];
  variables: RuntimeProjectionEnvVariable[];
  values: Record<string, string>;
}

export interface RuntimeProjectionReadinessCheck {
  name: string;
  type: string;
  source: string;
  required: boolean;
  service?: string;
  composeService?: string;
  target?: string;
  endpoint?: string;
  urlEnv?: string;
  topology?: unknown;
}

export interface RuntimeProjectionReadinessPlan {
  schemaVersion: 1;
  profile: string;
  mode: ResolvedRuntimeProfileState["mode"];
  source: "resolved-runtime-state.readiness";
  compose?: {
    command: "docker";
    args: string[];
    services: string[];
    wait: "running|healthy";
  };
  checks: RuntimeProjectionReadinessCheck[];
}

export interface RuntimeProjectionMemoryStackService {
  name: string;
  composeService?: string;
  source?: "memory.services";
  required: boolean;
  urlEnv?: string;
  env?: string[];
  target?: string;
  primaryPort?: string;
}

export interface RuntimeProjectionMemoryStackPlan {
  schemaVersion: 1;
  profile: string;
  mode: ResolvedRuntimeProfileState["mode"];
  source: "resolved-runtime-state.memory";
  enabled: boolean;
  services: RuntimeProjectionMemoryStackService[];
  compose?: {
    command: "docker";
    args: string[];
    services: string[];
    wait: "running|healthy";
  };
  env: Array<{
    name: string;
    generated: boolean;
  }>;
}

export interface RuntimeProjectionStartupStep {
  name: string;
  kind: "compose" | "daemon" | "presentation";
  mode: "run" | "background" | "foreground";
  surface?: string;
  command?: string;
  args?: string[];
  waitFor?: string[];
  readiness?: string[];
}

export interface RuntimeProjectionSurfaceStartupPlan {
  schemaVersion: 1;
  profile: string;
  mode: ResolvedRuntimeProfileState["mode"];
  source: "resolved-runtime-state.startup.surface";
  surface: string;
  readiness: RuntimeProjectionReadinessPlan;
  steps: RuntimeProjectionStartupStep[];
}

export interface RuntimeProjectionStartupPlan {
  schemaVersion: 1;
  profile: string;
  mode: ResolvedRuntimeProfileState["mode"];
  source: "resolved-runtime-state.startup";
  env: RuntimeProjectionEnvPlan;
  compose?: RuntimeProjectionReadinessPlan["compose"];
  readiness: {
    checks: string[];
  };
  mcp: {
    roots: RuntimeProjectionMcpConfigPlan["roots"];
    servers: string[];
  };
  memory: {
    enabled: boolean;
    services: string[];
    compose?: RuntimeProjectionMemoryStackPlan["compose"];
    env: string[];
  };
  surfaces?: Record<string, RuntimeProjectionSurfaceStartupPlan>;
}

export interface RuntimeProjectionServicePlan {
  name: string;
  composeService?: string;
  required: boolean;
  sources?: string[];
  endpoint?: {
    urlEnv?: string;
    target?: string;
  };
  readiness?: Omit<RuntimeProjectionReadinessCheck, "service" | "composeService">;
  memoryStack?: {
    enabled: boolean;
    source: "memory.services";
    required: boolean;
    urlEnv?: string;
    env?: string[];
    target?: string;
    primaryPort?: string;
  };
}

export interface RuntimeProfileProjection {
  schemaVersion: 1;
  profile: string;
  mode: ResolvedRuntimeProfileState["mode"];
  services: RuntimeProjectionServicePlan[];
  mcp: RuntimeProjectionMcpPlan;
  fragments: {
    env: RuntimeProjectionEnvPlan;
    readiness: RuntimeProjectionReadinessPlan;
    mcpConfig: RuntimeProjectionMcpConfigPlan;
    memoryStack: RuntimeProjectionMemoryStackPlan;
    startup: RuntimeProjectionStartupPlan;
  };
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function runtimeComposeArgs(profile: ResolvedRuntimeProfileState): string[] {
  const args: string[] = [];
  for (const file of profile.compose_files ?? []) {
    args.push("-f", file);
  }
  for (const composeProfile of profile.compose_profiles ?? []) {
    args.push("--profile", composeProfile);
  }
  return args;
}

function serviceStateMap(profile: ResolvedRuntimeProfileState): Map<string, ResolvedRuntimeServiceState> {
  return new Map((profile.services ?? []).map((service) => [service.name, service]));
}

function mcpConfigServer(server: ResolvedRuntimeMcpServerState) {
  return {
    command: server.command,
    ...(server.args !== undefined ? { args: server.args } : {}),
    ...(server.env !== undefined ? { env: server.env } : {}),
  };
}

function memoryServices(profile: ResolvedRuntimeProfileState): ResolvedRuntimeServiceState[] {
  if (profile.memory?.enabled === false) return [];
  const services = profile.memory?.services ?? [];
  return services.length > 0 ? services : profile.services ?? [];
}

function memoryEnvNames(services: ResolvedRuntimeServiceState[]): Array<{ name: string; generated: boolean }> {
  return uniqueStrings(services.map((service) => service.url_env))
    .sort()
    .map((name) => ({ name, generated: false }));
}

function mergeEnvVariables(variables: RuntimeProjectionEnvVariable[]): RuntimeProjectionEnvVariable[] {
  const byName = new Map<string, RuntimeProjectionEnvVariable>();
  for (const variable of variables) {
    const existing = byName.get(variable.name);
    if (!existing) {
      byName.set(variable.name, variable);
      continue;
    }
    byName.set(variable.name, {
      ...existing,
      generated: existing.generated || variable.generated,
      ...(existing.value !== undefined ? { value: existing.value } : variable.value !== undefined ? { value: variable.value } : {}),
    });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function envVariable(name: string | undefined, value?: string): RuntimeProjectionEnvVariable | undefined {
  if (!name) return undefined;
  return {
    name,
    generated: value !== undefined,
    ...(value !== undefined ? { value } : {}),
  };
}

function sanitizedUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

function browserGatewayHealthUrl(endpoint: string | undefined): string | undefined {
  if (!endpoint) return undefined;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "ws:" && url.protocol !== "wss:") return undefined;
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    url.pathname = "/healthz";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function readinessServiceNames(profile: ResolvedRuntimeProfileState): string[] {
  return uniqueStrings([
    ...(profile.services ?? []).map((service) => service.name),
    ...(profile.runtime_services ?? []),
    ...(profile.workbench_infra_services ?? []),
  ]);
}

function composeServiceName(
  serviceName: string,
  servicesByName: Map<string, ResolvedRuntimeServiceState>,
): string {
  return servicesByName.get(serviceName)?.compose_service ?? serviceName;
}

function serviceReadinessCheck(
  serviceName: string,
  composeEnabled: boolean,
  servicesByName: Map<string, ResolvedRuntimeServiceState>,
): RuntimeProjectionReadinessCheck {
  const service = servicesByName.get(serviceName);
  return {
    name: `service:${serviceName}`,
    type: composeEnabled ? "compose-service" : "external-service",
    service: serviceName,
    composeService: composeServiceName(serviceName, servicesByName),
    source: "services",
    required: service?.required !== false,
    ...(service?.url_env !== undefined ? { urlEnv: service.url_env } : {}),
  };
}

function topologySummary(profile: ResolvedRuntimeProfileState): unknown | undefined {
  const topology = profile.orchestration;
  if (!topology) return undefined;
  return {
    ...(topology.handoff_mode !== undefined ? { handoffMode: topology.handoff_mode } : {}),
    ...(topology.default_role !== undefined ? { defaultRole: topology.default_role } : {}),
    ...(topology.lanes !== undefined ? { lanes: topology.lanes } : {}),
    ...(topology.roles !== undefined ? { roles: topology.roles } : {}),
    ...(topology.handoffs !== undefined ? { handoffs: topology.handoffs } : {}),
  };
}

export function selectResolvedRuntimeProfile(
  runtimeState: ResolvedRuntimeState,
  profileName?: string,
): ResolvedRuntimeProfileState {
  const selectedName = profileName ?? runtimeState.default_profile;
  const profile = selectedName
    ? runtimeState.profiles.find((candidate) => candidate.name === selectedName)
    : undefined;
  const selected = profile ?? runtimeState.profiles[0];
  if (!selected) {
    throw new Error("Resolved runtime state does not contain any profiles");
  }
  if (selectedName && !profile) {
    throw new Error(`Resolved runtime profile "${selectedName}" was not found`);
  }
  return selected;
}

export function buildResolvedMcpConfigPlan(
  profile: ResolvedRuntimeProfileState,
): RuntimeProjectionMcpConfigPlan {
  return {
    schemaVersion: 1,
    profile: profile.name,
    mode: profile.mode,
    source: "resolved-runtime-state.mcp",
    roots: {
      workspaceRoot: profile.mcp_workspace_root ?? profile.workspace_root,
      appRoot: profile.mcp_app_root ?? profile.app_root,
    },
    servers: (profile.mcp_servers ?? []).map((server) => server.name),
    config: {
      mcpServers: Object.fromEntries(
        (profile.mcp_servers ?? []).map((server) => [server.name, mcpConfigServer(server)]),
      ),
    },
  };
}

export function buildResolvedRuntimeEnvPlan(
  profile: ResolvedRuntimeProfileState,
): RuntimeProjectionEnvPlan {
  const variables = mergeEnvVariables([
    envVariable("KIRAKIRA_RUNTIME_PROFILE", profile.name),
    envVariable("KIRAKIRA_WORKSPACE_ROOT", profile.workspace_root),
    envVariable("KIRAKIRA_APP_ROOT", profile.app_root),
    envVariable("KIRAKIRA_MCP_WORKSPACE_ROOT", profile.mcp_workspace_root ?? profile.workspace_root),
    envVariable("KIRAKIRA_MCP_APP_ROOT", profile.mcp_app_root ?? profile.app_root),
    ...(profile.services ?? []).map((service) => envVariable(service.url_env)),
    ...memoryEnvNames(memoryServices(profile)).map((entry) => ({
      name: entry.name,
      generated: entry.generated,
    })),
  ].filter((variable): variable is RuntimeProjectionEnvVariable => Boolean(variable)));
  const values = Object.fromEntries(
    variables
      .filter((variable): variable is RuntimeProjectionEnvVariable & { value: string } =>
        variable.value !== undefined,
      )
      .map((variable) => [variable.name, variable.value]),
  );
  return {
    schemaVersion: 1,
    profile: profile.name,
    mode: profile.mode,
    source: "resolved-runtime-state.env",
    envFiles: profile.env_files ?? [],
    variables,
    values,
  };
}

export function buildResolvedRuntimeMcpProjection(
  profile: ResolvedRuntimeProfileState,
): RuntimeProjectionMcpPlan {
  const configPlan = buildResolvedMcpConfigPlan(profile);
  return {
    roots: configPlan.roots,
    servers: (profile.mcp_servers ?? []).map((server) => ({
      name: server.name,
      ...mcpConfigServer(server),
    })),
    config: configPlan.config,
  };
}

export function buildResolvedRuntimeReadinessPlan(
  profile: ResolvedRuntimeProfileState,
): RuntimeProjectionReadinessPlan {
  const servicesByName = serviceStateMap(profile);
  const serviceNames = readinessServiceNames(profile);
  const composeArgs = runtimeComposeArgs(profile);
  const composeServices = uniqueStrings(
    serviceNames.map((serviceName) => composeServiceName(serviceName, servicesByName)),
  );
  const composeEnabled = composeArgs.length > 0 && composeServices.length > 0;
  const checks = serviceNames.map((serviceName) =>
    serviceReadinessCheck(serviceName, composeEnabled, servicesByName),
  );

  const browserGatewayEndpoint = sanitizedUrl(profile.browser_gateway?.endpoint);
  const browserGatewayHealth = browserGatewayHealthUrl(browserGatewayEndpoint);
  if (browserGatewayHealth) {
    checks.push({
      name: "daemon:browser-gateway",
      type: "http-health",
      source: "browser_gateway",
      target: browserGatewayHealth,
      ...(browserGatewayEndpoint ? { endpoint: browserGatewayEndpoint } : {}),
      required: true,
    });
  }

  const webUrl = sanitizedUrl(profile.presentation?.web?.url);
  if (webUrl) {
    checks.push({
      name: "presentation:web",
      type: "http",
      source: "presentation.web.url",
      target: webUrl,
      required: true,
    });
  }

  const desktopUrl = sanitizedUrl(profile.presentation?.desktop?.renderer_url);
  if (desktopUrl) {
    checks.push({
      name: "presentation:desktop",
      type: "http",
      source: "presentation.desktop.renderer_url",
      target: desktopUrl,
      required: true,
    });
  }

  const topology = topologySummary(profile);
  if (topology && typeof topology === "object" && Object.keys(topology).length > 0) {
    checks.push({
      name: "orchestration:topology",
      type: "orchestration-topology",
      source: "orchestration",
      required: true,
      topology,
    });
  }

  return {
    schemaVersion: 1,
    profile: profile.name,
    mode: profile.mode,
    source: "resolved-runtime-state.readiness",
    ...(composeEnabled
      ? {
          compose: {
            command: "docker",
            args: ["compose", ...composeArgs, "up", "-d", "--wait", ...composeServices],
            services: composeServices,
            wait: "running|healthy",
          },
        }
      : {}),
    checks,
  };
}

export function buildResolvedMemoryStackPlan(
  profile: ResolvedRuntimeProfileState,
): RuntimeProjectionMemoryStackPlan {
  const services = memoryServices(profile);
  const composeArgs = runtimeComposeArgs(profile);
  const composeServices = uniqueStrings(services.map((service) => service.compose_service ?? service.name));
  const composeEnabled = composeArgs.length > 0 && composeServices.length > 0;
  return {
    schemaVersion: 1,
    profile: profile.name,
    mode: profile.mode,
    source: "resolved-runtime-state.memory",
    enabled: profile.memory?.enabled !== false && services.length > 0,
    services: services.map((service) => ({
      name: service.name,
      ...(service.compose_service !== undefined ? { composeService: service.compose_service } : {}),
      source: "memory.services",
      required: service.required !== false,
      ...(service.url_env !== undefined ? { urlEnv: service.url_env } : {}),
      ...(service.url_env !== undefined ? { env: [service.url_env] } : {}),
    })),
    ...(composeEnabled
      ? {
          compose: {
            command: "docker",
            args: ["compose", ...composeArgs, "up", "-d", "--wait", ...composeServices],
            services: composeServices,
            wait: "running|healthy",
          },
        }
      : {}),
    env: memoryEnvNames(services),
  };
}

function checksByService(checks: RuntimeProjectionReadinessCheck[]): Map<string, RuntimeProjectionReadinessCheck> {
  return new Map(
    checks
      .filter((check) => check.service !== undefined)
      .map((check) => [check.service as string, check]),
  );
}

function memoryServicesByName(
  services: RuntimeProjectionMemoryStackService[],
): Map<string, RuntimeProjectionMemoryStackService> {
  return new Map(services.map((service) => [service.name, service]));
}

function serviceEndpointProjection(
  service: ResolvedRuntimeServiceState | undefined,
): RuntimeProjectionServicePlan["endpoint"] | undefined {
  if (!service?.url_env) return undefined;
  return { urlEnv: service.url_env };
}

function serviceReadinessProjection(
  check: RuntimeProjectionReadinessCheck | undefined,
): RuntimeProjectionServicePlan["readiness"] | undefined {
  if (!check) return undefined;
  return {
    name: check.name,
    type: check.type,
    source: check.source,
    required: check.required,
    ...(check.target !== undefined ? { target: check.target } : {}),
    ...(check.endpoint !== undefined ? { endpoint: check.endpoint } : {}),
    ...(check.urlEnv !== undefined ? { urlEnv: check.urlEnv } : {}),
    ...(check.topology !== undefined ? { topology: check.topology } : {}),
  };
}

function serviceMemoryStackProjection(
  service: RuntimeProjectionMemoryStackService | undefined,
  memoryStackPlan: RuntimeProjectionMemoryStackPlan,
): RuntimeProjectionServicePlan["memoryStack"] | undefined {
  if (!service) return undefined;
  return {
    enabled: memoryStackPlan.enabled,
    source: service.source ?? "memory.services",
    required: service.required,
    ...(service.urlEnv !== undefined ? { urlEnv: service.urlEnv } : {}),
    ...(service.env !== undefined ? { env: service.env } : {}),
    ...(service.target !== undefined ? { target: service.target } : {}),
    ...(service.primaryPort !== undefined ? { primaryPort: service.primaryPort } : {}),
  };
}

export function buildResolvedRuntimeServiceProjection(
  profile: ResolvedRuntimeProfileState,
  options: {
    readinessPlan?: RuntimeProjectionReadinessPlan;
    memoryStackPlan?: RuntimeProjectionMemoryStackPlan;
  } = {},
): RuntimeProjectionServicePlan[] {
  const servicesByName = serviceStateMap(profile);
  const readinessPlan = options.readinessPlan ?? buildResolvedRuntimeReadinessPlan(profile);
  const memoryStackPlan = options.memoryStackPlan ?? buildResolvedMemoryStackPlan(profile);
  const readinessByService = checksByService(readinessPlan.checks);
  const memoryByService = memoryServicesByName(memoryStackPlan.services);
  const serviceNames = uniqueStrings([
    ...servicesByName.keys(),
    ...readinessByService.keys(),
    ...memoryByService.keys(),
  ]);

  return serviceNames.map((serviceName) => {
    const service = servicesByName.get(serviceName);
    const readiness = serviceReadinessProjection(readinessByService.get(serviceName));
    const memoryStack = serviceMemoryStackProjection(memoryByService.get(serviceName), memoryStackPlan);
    const endpoint = serviceEndpointProjection(service);
    const sources = uniqueStrings([
      endpoint ? "services" : undefined,
      readiness ? "readiness" : undefined,
      memoryStack ? "memory-stack" : undefined,
    ]);
    const required = readiness?.required ?? memoryStack?.required ?? (service?.required !== false);
    return {
      name: serviceName,
      composeService: composeServiceName(serviceName, servicesByName),
      required,
      ...(sources.length > 0 ? { sources } : {}),
      ...(endpoint ? { endpoint } : {}),
      ...(readiness ? { readiness } : {}),
      ...(memoryStack ? { memoryStack } : {}),
    };
  });
}

function readinessHasCheck(readiness: RuntimeProjectionReadinessPlan, checkName: string): boolean {
  return readiness.checks.some((check) => check.name === checkName);
}

function surfaceReadinessChecks(
  readiness: RuntimeProjectionReadinessPlan,
  surface: "web" | "desktop",
): string[] {
  const daemonChecks = (surface === "desktop"
    ? ["daemon:socket", "daemon:browser-gateway"]
    : ["daemon:browser-gateway"])
    .filter((check) => readinessHasCheck(readiness, check));
  const presentationCheck = `presentation:${surface}`;
  return [
    ...daemonChecks,
    ...(readinessHasCheck(readiness, presentationCheck) ? [presentationCheck] : []),
  ];
}

function resolvedSurfaceStartupStep(
  name: string,
  kind: RuntimeProjectionStartupStep["kind"],
  mode: RuntimeProjectionStartupStep["mode"],
  options: {
    surface?: string;
    waitFor?: string[];
    readiness?: string[];
  } = {},
): RuntimeProjectionStartupStep {
  return {
    name,
    kind,
    mode,
    ...(options.surface ? { surface: options.surface } : {}),
    ...(options.waitFor && options.waitFor.length > 0 ? { waitFor: options.waitFor } : {}),
    ...(options.readiness && options.readiness.length > 0 ? { readiness: options.readiness } : {}),
  };
}

function buildResolvedSurfaceStartupPlans(
  profile: ResolvedRuntimeProfileState,
  readiness: RuntimeProjectionReadinessPlan,
): Record<string, RuntimeProjectionSurfaceStartupPlan> {
  const surfaces: Record<string, RuntimeProjectionSurfaceStartupPlan> = {};
  if (profile.presentation?.web?.url) {
    const webChecks = surfaceReadinessChecks(readiness, "web");
    const waits = webChecks.filter((check) => check !== "presentation:web");
    surfaces.web = {
      schemaVersion: 1,
      profile: profile.name,
      mode: profile.mode,
      source: "resolved-runtime-state.startup.surface",
      surface: "web",
      readiness,
      steps: [
        ...(readinessHasCheck(readiness, "daemon:browser-gateway")
          ? [resolvedSurfaceStartupStep("daemon", "daemon", "background", {
              readiness: ["daemon:browser-gateway"],
            })]
          : []),
        resolvedSurfaceStartupStep("web", "presentation", "foreground", {
          surface: "web",
          waitFor: waits,
          readiness: ["presentation:web"],
        }),
      ],
    };
  }
  if (profile.presentation?.desktop?.renderer_url) {
    const desktopChecks = surfaceReadinessChecks(readiness, "desktop");
    const waits = desktopChecks.filter((check) => check !== "presentation:desktop");
    surfaces.desktop = {
      schemaVersion: 1,
      profile: profile.name,
      mode: profile.mode,
      source: "resolved-runtime-state.startup.surface",
      surface: "desktop",
      readiness,
      steps: [
        ...(readinessHasCheck(readiness, "daemon:browser-gateway")
          ? [resolvedSurfaceStartupStep("daemon", "daemon", "background", {
              readiness: ["daemon:browser-gateway"],
            })]
          : []),
        resolvedSurfaceStartupStep("desktop-renderer", "presentation", "background", {
          surface: "desktop",
          readiness: ["presentation:desktop"],
        }),
        resolvedSurfaceStartupStep("desktop-shell", "presentation", "foreground", {
          surface: "desktop",
          waitFor: waits,
          readiness: ["presentation:desktop"],
        }),
      ],
    };
  }
  return surfaces;
}

export function buildResolvedRuntimeStartupPlan(
  profile: ResolvedRuntimeProfileState,
  options: {
    envPlan?: RuntimeProjectionEnvPlan;
    readinessPlan?: RuntimeProjectionReadinessPlan;
    mcpConfigPlan?: RuntimeProjectionMcpConfigPlan;
    memoryStackPlan?: RuntimeProjectionMemoryStackPlan;
  } = {},
): RuntimeProjectionStartupPlan {
  const env = options.envPlan ?? buildResolvedRuntimeEnvPlan(profile);
  const readiness = options.readinessPlan ?? buildResolvedRuntimeReadinessPlan(profile);
  const mcpConfig = options.mcpConfigPlan ?? buildResolvedMcpConfigPlan(profile);
  const memoryStack = options.memoryStackPlan ?? buildResolvedMemoryStackPlan(profile);
  const surfaces = buildResolvedSurfaceStartupPlans(profile, readiness);
  return {
    schemaVersion: 1,
    profile: profile.name,
    mode: profile.mode,
    source: "resolved-runtime-state.startup",
    env,
    compose: readiness.compose,
    readiness: {
      checks: readiness.checks.map((check) => check.name),
    },
    mcp: {
      roots: mcpConfig.roots,
      servers: mcpConfig.servers,
    },
    memory: {
      enabled: memoryStack.enabled,
      services: memoryStack.services.map((service) => service.name),
      compose: memoryStack.compose,
      env: memoryStack.env.map((entry) => entry.name),
    },
    ...(Object.keys(surfaces).length > 0 ? { surfaces } : {}),
  };
}

export function buildResolvedRuntimeProfileProjection(
  runtimeState: ResolvedRuntimeState,
  profileName?: string,
): RuntimeProfileProjection {
  const profile = selectResolvedRuntimeProfile(runtimeState, profileName);
  const env = buildResolvedRuntimeEnvPlan(profile);
  const readiness = buildResolvedRuntimeReadinessPlan(profile);
  const mcpConfig = buildResolvedMcpConfigPlan(profile);
  const memoryStack = buildResolvedMemoryStackPlan(profile);
  const startup = buildResolvedRuntimeStartupPlan(profile, {
    envPlan: env,
    readinessPlan: readiness,
    mcpConfigPlan: mcpConfig,
    memoryStackPlan: memoryStack,
  });
  return {
    schemaVersion: 1,
    profile: profile.name,
    mode: profile.mode,
    services: buildResolvedRuntimeServiceProjection(profile, { readinessPlan: readiness, memoryStackPlan: memoryStack }),
    mcp: {
      roots: mcpConfig.roots,
      servers: (profile.mcp_servers ?? []).map((server) => ({
        name: server.name,
        ...mcpConfigServer(server),
      })),
      config: mcpConfig.config,
    },
    fragments: {
      env,
      readiness,
      mcpConfig,
      memoryStack,
      startup,
    },
  };
}

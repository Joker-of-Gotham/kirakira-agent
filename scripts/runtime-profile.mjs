#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, posix, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const defaultProfilesPath = join(repoRoot, "configs", "runtime", "profiles.json");
const resolvedProfileConfigs = new WeakMap();
const ROOT_OVERRIDE_ENV_KEYS = [
  "KIRAKIRA_RUNTIME_PROFILE",
  "KIRAKIRA_WORKSPACE_ROOT",
  "KIRAKIRA_APP_ROOT",
  "KIRAKIRA_MCP_WORKSPACE_ROOT",
  "KIRAKIRA_MCP_APP_ROOT",
];

function browserGatewayEndpoint(gateway) {
  if (!gateway || gateway.enabled === false) return undefined;
  if (typeof gateway.endpoint === "string" && gateway.endpoint.length > 0) {
    return gateway.endpoint;
  }
  const protocol = gateway.protocol ?? "ws";
  if (
    typeof gateway.host !== "string" ||
    gateway.port === undefined ||
    typeof gateway.path !== "string"
  ) {
    throw new Error("Browser gateway profile requires host, port, and path");
  }
  const host = gateway.host;
  const port = gateway.port;
  const path = gateway.path;
  return `${protocol}://${host}:${port}${path.startsWith("/") ? path : `/${path}`}`;
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function mergeRecordMap(base = {}, override = {}) {
  return { ...(isRecord(base) ? base : {}), ...(isRecord(override) ? override : {}) };
}

function mergeEnvBindings(base = {}, override = {}) {
  return {
    services: mergeRecordMap(base.services, override.services),
    values: mergeRecordMap(base.values, override.values),
    booleans: mergeRecordMap(base.booleans, override.booleans),
    joined: mergeRecordMap(base.joined, override.joined),
    computed: mergeRecordMap(base.computed, override.computed),
  };
}

function pathValue(root, path) {
  if (typeof path !== "string" || path.length === 0) return undefined;
  return path.split(".").reduce((value, segment) => {
    if (!isRecord(value)) return undefined;
    return value[segment];
  }, root);
}

function envNames(target) {
  if (typeof target === "string") return [target];
  if (Array.isArray(target)) return target.filter((name) => typeof name === "string");
  if (isRecord(target)) return envNames(target.env);
  return [];
}

function setEnvValue(env, target, value) {
  if (value === undefined || value === null) return;
  for (const name of envNames(target)) {
    env[name] = String(value);
  }
}

function isWindowsNamedPipePath(value) {
  const normalized = String(value).replace(/\//gu, "\\").toLowerCase();
  return normalized.startsWith("\\\\.\\pipe\\") || normalized.startsWith("\\\\?\\pipe\\");
}

function sanitizePipeName(value) {
  return String(value).replace(/[^A-Za-z0-9_.-]+/gu, "-").replace(/^-+|-+$/gu, "") || "daemon";
}

function resolveDaemonSocketPath(value, options = {}) {
  const platform = options.platform ?? process.platform;
  const configured = typeof value === "string" ? value.trim() : "";
  if (platform !== "win32") {
    return configured || join(options.homeDir ?? homedir(), ".kirakira-agent", "daemon.sock");
  }
  if (configured && isWindowsNamedPipePath(configured)) {
    return configured;
  }
  const pathForName = configured || join(options.homeDir ?? homedir(), ".kirakira-agent", "daemon.sock");
  const cwd = options.cwd ?? repoRoot;
  const absoluteBasis = isAbsolute(pathForName) ? pathForName : resolve(cwd, pathForName);
  const base = sanitizePipeName(basename(pathForName).replace(/\.sock$/iu, ""));
  const digest = createHash("sha256").update(absoluteBasis).digest("hex").slice(0, 12);
  return `\\\\.\\pipe\\kirakira-agent-${base}-${digest}`;
}

function resolveBindingValue(target, value) {
  if (isRecord(target) && target.resolve === "daemonSocketPath") {
    return resolveDaemonSocketPath(value);
  }
  return value;
}

function firstConfiguredEnvValue(target, env) {
  for (const name of envNames(target)) {
    const value = env[name];
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

function resolveConfiguredValue(spec, env) {
  if (!isRecord(spec)) return spec;
  const envValue = firstConfiguredEnvValue(spec.env, env);
  if (envValue !== undefined) return envValue;
  if (Object.prototype.hasOwnProperty.call(spec, "default")) return spec.default;
  return undefined;
}

function collectConfiguredEnv(output, spec, value) {
  if (value === undefined || value === null || !isRecord(spec)) return;
  for (const name of envNames(spec.env)) {
    output[name] = String(value);
  }
}

function mergeSpecRecord(...records) {
  const merged = {};
  for (const record of records) {
    if (!isRecord(record)) continue;
    for (const [key, value] of Object.entries(record)) {
      if (isRecord(value) && isRecord(merged[key])) {
        merged[key] = { ...merged[key], ...value };
      } else {
        merged[key] = value;
      }
    }
  }
  return merged;
}

function hostForUrl(host) {
  const value = String(host);
  return value.includes(":") && !value.startsWith("[") ? `[${value}]` : value;
}

function renderAuthority({ host, port, username, password, authInUrl }) {
  const userInfo = authInUrl === true && username !== undefined
    ? `${encodeURIComponent(String(username))}${
        password === undefined ? "" : `:${encodeURIComponent(String(password))}`
      }@`
    : "";
  const portPart = port === undefined || port === "" ? "" : `:${port}`;
  return `${userInfo}${hostForUrl(host)}${portPart}`;
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))];
}

function runtimeServiceGroups(config) {
  const catalog = isRecord(config.serviceCatalog) ? config.serviceCatalog : {};
  return isRecord(catalog.groups) ? catalog.groups : {};
}

function runtimeServiceCatalog(config) {
  const catalog = isRecord(config.serviceCatalog) ? config.serviceCatalog : {};
  return isRecord(catalog.services) ? catalog.services : {};
}

function runtimeServiceCatalogEntry(config, serviceName) {
  const entry = runtimeServiceCatalog(config)[serviceName];
  return isRecord(entry) ? entry : undefined;
}

function runtimeMcpCatalog(config) {
  return isRecord(config.mcpCatalog) ? config.mcpCatalog : {};
}

function runtimeMcpServerGroups(config) {
  const groups = runtimeMcpCatalog(config).groups;
  return isRecord(groups) ? groups : {};
}

function runtimeMcpServerCatalog(config) {
  const servers = runtimeMcpCatalog(config).servers;
  return isRecord(servers) ? servers : {};
}

function runtimeMemoryConfig(config, profile) {
  const memory = mergeSpecRecord(config.memory, profile.memory);
  if (Object.keys(memory).length === 0) return undefined;
  const serviceRefs = [
    ...serviceGroupRefs(memory.serviceGroups),
    ...(Array.isArray(memory.services) ? memory.services : []),
  ];
  return {
    ...memory,
    ...(serviceRefs.length > 0
      ? { services: expandRuntimeServiceRefs(serviceRefs, config) }
      : {}),
  };
}

function runtimeOrchestrationConfig(config, profile) {
  const orchestration = mergeSpecRecord(config.orchestration, profile.orchestration);
  return Object.keys(orchestration).length > 0 ? orchestration : undefined;
}

function runtimeComposeServiceName(config, serviceName) {
  const entry = runtimeServiceCatalogEntry(config, serviceName);
  return typeof entry?.composeService === "string" && entry.composeService.length > 0
    ? entry.composeService
    : serviceName;
}

export function expandRuntimeServiceRefs(refs = [], config = loadRuntimeProfiles()) {
  if (!Array.isArray(refs)) {
    throw new Error("Runtime service references must be a string array");
  }
  const groups = runtimeServiceGroups(config);
  const expanded = [];
  for (const ref of refs) {
    if (typeof ref !== "string" || ref.length === 0) {
      throw new Error("Runtime service references must be non-empty strings");
    }
    if (!ref.startsWith("@")) {
      expanded.push(ref);
      continue;
    }
    const groupName = ref.slice(1);
    const group = groups[groupName];
    if (!Array.isArray(group)) {
      throw new Error(`Unknown runtime service group "${groupName}"`);
    }
    expanded.push(...group);
  }
  return uniqueStrings(expanded);
}

export function expandMcpServerRefs(refs = [], config = loadRuntimeProfiles()) {
  if (!Array.isArray(refs)) {
    throw new Error("MCP server references must be a string array");
  }
  const groups = runtimeMcpServerGroups(config);
  const expanded = [];
  for (const ref of refs) {
    if (typeof ref !== "string" || ref.length === 0) {
      throw new Error("MCP server references must be non-empty strings");
    }
    if (!ref.startsWith("@")) {
      expanded.push(ref);
      continue;
    }
    const groupName = ref.slice(1);
    const group = groups[groupName];
    if (!Array.isArray(group)) {
      throw new Error(`Unknown MCP server group "${groupName}"`);
    }
    expanded.push(...group);
  }
  return uniqueStrings(expanded);
}

function serviceGroupRefs(groups = []) {
  if (!Array.isArray(groups)) return [];
  return groups.map((group) => `@${group}`);
}

function catalogPrimaryPortSpec(config, serviceName, endpointMode) {
  const service = runtimeServiceCatalog(config)[serviceName];
  if (!isRecord(service) || !isRecord(service.ports)) return undefined;
  const primaryPort = service.primaryPort;
  const portSpec = typeof primaryPort === "string"
    ? service.ports[primaryPort]
    : Object.values(service.ports)[0];
  if (!isRecord(portSpec)) return undefined;
  if (endpointMode === "published") {
    return {
      env: portSpec.env,
      default: portSpec.default ?? portSpec.target,
    };
  }
  return {
    default: portSpec.target ?? portSpec.default,
  };
}

function serviceUrlPath(descriptor, resolved) {
  const path = resolved.database ?? resolved.path;
  if (path === undefined || path === null || path === "") return "";
  const pathText = String(path);
  if (resolved.database === undefined && pathText.startsWith("/")) return pathText;
  return `/${encodeURIComponent(pathText)}`;
}

function resolveServiceDescriptor(name, config, profile, env) {
  const base = config.serviceBindings?.[name];
  if (!isRecord(base)) {
    throw new Error(`Runtime profile service "${name}" is missing a serviceBindings descriptor`);
  }
  const catalogPortSpec = catalogPrimaryPortSpec(config, name, profile.serviceEndpointMode);
  const catalogPort = catalogPortSpec ? { port: catalogPortSpec } : {};
  const descriptor = mergeSpecRecord(
    base,
    profile.serviceEndpointDefaults,
    catalogPort,
    profile.serviceEndpoints?.[name],
  );
  const serviceEnv = {};
  const resolved = {};
  for (const key of ["scheme", "host", "port", "username", "password", "database", "path"]) {
    const value = resolveConfiguredValue(descriptor[key], env);
    if (value !== undefined) resolved[key] = value;
    collectConfiguredEnv(serviceEnv, descriptor[key], value);
  }
  if (resolved.scheme === undefined || resolved.host === undefined) {
    throw new Error(`Runtime profile service "${name}" requires scheme and host`);
  }
  const url = `${resolved.scheme}://${renderAuthority({
    host: resolved.host,
    port: resolved.port,
    username: resolved.username,
    password: resolved.password,
    authInUrl: descriptor.authInUrl,
  })}${serviceUrlPath(descriptor, resolved)}`;
  return { url, serviceEnv };
}

function serviceEndpointSpecs(config, profile) {
  const specs = {};
  const groupRefs = serviceGroupRefs(profile.serviceEndpointGroups);
  for (const serviceName of expandRuntimeServiceRefs(groupRefs, config)) {
    specs[serviceName] = {};
  }
  if (isRecord(profile.serviceEndpoints)) {
    Object.assign(specs, profile.serviceEndpoints);
  }
  return specs;
}

function resolveServiceEndpoints(config, profile, env) {
  const services = {};
  const serviceEnv = {};
  const specs = serviceEndpointSpecs(config, profile);
  if (Object.keys(specs).length > 0) {
    for (const serviceName of Object.keys(specs)) {
      const rendered = resolveServiceDescriptor(serviceName, config, profile, env);
      services[serviceName] = rendered.url;
      Object.assign(serviceEnv, rendered.serviceEnv);
    }
    return { services, serviceEnv };
  }

  for (const [serviceName, url] of Object.entries(profile.services ?? {})) {
    if (typeof url === "string") services[serviceName] = url;
  }
  return { services, serviceEnv };
}

function resolveContainerStartupRefs(startup, config) {
  if (!isRecord(startup)) return startup;
  const refs = [
    ...serviceGroupRefs(startup.runtimeServiceGroups),
    ...(Array.isArray(startup.runtimeServices) ? startup.runtimeServices : []),
  ];
  if (refs.length === 0) return startup;
  return {
    ...startup,
    runtimeServices: expandRuntimeServiceRefs(refs, config),
  };
}

function resolveWorkbenchRefs(workbench, config) {
  if (!isRecord(workbench)) return workbench;
  const refs = [
    ...serviceGroupRefs(workbench.infraServiceGroups),
    ...(Array.isArray(workbench.infraServices) ? workbench.infraServices : []),
  ];
  if (refs.length === 0) return workbench;
  return {
    ...workbench,
    infraServices: expandRuntimeServiceRefs(refs, config),
  };
}

function resolveEndpointSpecs(endpoint, env, options = {}) {
  if (!isRecord(endpoint)) return { endpoint, endpointEnv: {} };
  const endpointEnv = {};
  const resolved = { ...endpoint };
  for (const key of ["protocol", "host", "port", "path", options.urlField ?? "url"]) {
    const value = resolveConfiguredValue(endpoint[key], env);
    if (value !== undefined) resolved[key] = value;
    collectConfiguredEnv(endpointEnv, endpoint[key], value);
  }

  const urlField = options.urlField ?? "url";
  if (
    typeof resolved[urlField] !== "string"
    && typeof resolved.host === "string"
    && resolved.port !== undefined
  ) {
    const protocol = resolved.protocol ?? options.protocol ?? "http";
    const path = typeof resolved.path === "string"
      ? (resolved.path.startsWith("/") ? resolved.path : `/${resolved.path}`)
      : "";
    resolved[urlField] = `${protocol}://${hostForUrl(resolved.host)}:${resolved.port}${path}`;
  }

  return { endpoint: resolved, endpointEnv };
}

function resolveDynamicProfile(config, profile, env) {
  const { services, serviceEnv } = resolveServiceEndpoints(config, profile, env);
  const resolvedEnv = { ...serviceEnv };

  const webResult = resolveEndpointSpecs(profile.presentation?.web, env, {
    protocol: "http",
    urlField: "url",
  });
  Object.assign(resolvedEnv, webResult.endpointEnv);

  const desktopResult = resolveEndpointSpecs(profile.presentation?.desktop, env, {
    protocol: "http",
    urlField: "rendererUrl",
  });
  Object.assign(resolvedEnv, desktopResult.endpointEnv);

  const gatewayResult = resolveEndpointSpecs(profile.daemon?.browserGateway, env, {
    protocol: "ws",
    urlField: "endpoint",
  });
  if (
    isRecord(gatewayResult.endpoint)
    && gatewayResult.endpoint.allowedOrigins === undefined
  ) {
    const allowedOrigins = [
      webResult.endpoint?.url,
      desktopResult.endpoint?.rendererUrl,
    ].filter((value) => typeof value === "string" && value.length > 0);
    if (allowedOrigins.length > 0) {
      gatewayResult.endpoint = {
        ...gatewayResult.endpoint,
        allowedOrigins,
      };
    }
  }
  Object.assign(resolvedEnv, gatewayResult.endpointEnv);

  return {
    services,
    resolvedEnv,
    daemon: profile.daemon
      ? {
          ...profile.daemon,
          browserGateway: gatewayResult.endpoint,
        }
      : profile.daemon,
    presentation: profile.presentation
      ? {
          ...profile.presentation,
          web: webResult.endpoint,
          desktop: desktopResult.endpoint,
        }
      : profile.presentation,
  };
}

function renderBoundEnv(env, profile) {
  const bindings = profile.envBindings ?? {};
  for (const [serviceName, url] of Object.entries(profile.services ?? {})) {
    setEnvValue(env, bindings.services?.[serviceName], typeof url === "string" ? url : undefined);
  }
  for (const [path, target] of Object.entries(bindings.values ?? {})) {
    setEnvValue(env, target, resolveBindingValue(target, pathValue(profile, path)));
  }
  for (const [path, target] of Object.entries(bindings.booleans ?? {})) {
    const value = pathValue(profile, path);
    if (value === undefined) continue;
    const trueValue = isRecord(target) && target.true !== undefined ? target.true : "1";
    const falseValue = isRecord(target) && target.false !== undefined ? target.false : "0";
    setEnvValue(env, target, value === false ? falseValue : trueValue);
  }
  for (const [path, target] of Object.entries(bindings.joined ?? {})) {
    const value = pathValue(profile, path);
    if (!Array.isArray(value)) continue;
    const separator = isRecord(target) && typeof target.separator === "string" ? target.separator : ",";
    setEnvValue(env, target, value.join(separator));
  }

  const gatewayBinding = bindings.computed?.browserGatewayEndpoint;
  if (gatewayBinding) {
    const gateway = pathValue(profile, gatewayBinding.source ?? "daemon.browserGateway");
    const endpoint = browserGatewayEndpoint(gateway);
    if (endpoint) {
      setEnvValue(env, gatewayBinding.urlEnv, endpoint);
      setEnvValue(env, gatewayBinding.modeEnv, gatewayBinding.mode ?? "gateway");
    }
  }
}

function readinessServiceNames(profile) {
  return uniqueStrings([
    ...Object.keys(profile.services ?? {}),
    ...(Array.isArray(profile.containerStartup?.runtimeServices)
      ? profile.containerStartup.runtimeServices
      : []),
    ...(Array.isArray(profile.workbench?.infraServices) ? profile.workbench.infraServices : []),
  ]);
}

function sanitizedReadinessUrl(value) {
  if (typeof value !== "string" || value.length === 0) return undefined;
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

function browserGatewayHealthUrl(endpoint) {
  if (typeof endpoint !== "string" || endpoint.length === 0) return undefined;
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

const ORCHESTRATION_LANE_NAMES = ["foreground", "queued", "background", "delegated"];
const ORCHESTRATION_MODES = ["tool", "supervisor", "swarm"];
const ORCHESTRATION_CONTEXT_MODES = ["isolated", "filtered", "inherit"];

function publicTopologySummary(topology) {
  if (!isRecord(topology)) return undefined;
  const lanes = isRecord(topology.lanes)
    ? Object.fromEntries(
        Object.entries(topology.lanes)
          .filter(([lane, value]) => ORCHESTRATION_LANE_NAMES.includes(lane) && isRecord(value))
          .map(([lane, value]) => [
            lane,
            {
              ...(Number.isInteger(value.capacity) && value.capacity >= 0
                ? { capacity: value.capacity }
                : {}),
            },
          ]),
      )
    : undefined;
  const roles = Array.isArray(topology.roles)
    ? topology.roles
        .filter((role) => isRecord(role) && typeof role.id === "string" && role.id.length > 0)
        .map((role) => ({
          id: role.id,
          ...(typeof role.description === "string" ? { description: role.description } : {}),
          ...(ORCHESTRATION_LANE_NAMES.includes(role.lane) ? { lane: role.lane } : {}),
          ...(ORCHESTRATION_CONTEXT_MODES.includes(role.context) ? { context: role.context } : {}),
          ...(typeof role.model === "string" ? { model: role.model } : {}),
          ...(Number.isInteger(role.maxTurns ?? role.max_turns) && (role.maxTurns ?? role.max_turns) > 0
            ? { maxTurns: role.maxTurns ?? role.max_turns }
            : {}),
          ...(Array.isArray(role.toolScope ?? role.tool_scope)
            ? { toolScope: uniqueStrings(role.toolScope ?? role.tool_scope) }
            : {}),
          ...(Array.isArray(role.skillScope ?? role.skill_scope)
            ? { skillScope: uniqueStrings(role.skillScope ?? role.skill_scope) }
            : {}),
          ...(Array.isArray(role.mcpServers ?? role.mcp_servers)
            ? { mcpServers: uniqueStrings(role.mcpServers ?? role.mcp_servers) }
            : {}),
          ...(Array.isArray(role.permissions) ? { permissionLabels: uniqueStrings(role.permissions) } : {}),
        }))
    : undefined;
  const handoffs = Array.isArray(topology.handoffs)
    ? topology.handoffs
        .filter((handoff) =>
          isRecord(handoff) &&
          typeof handoff.from === "string" &&
          typeof handoff.to === "string",
        )
        .map((handoff) => ({
          from: handoff.from,
          to: handoff.to,
          ...(ORCHESTRATION_MODES.includes(handoff.mode) ? { mode: handoff.mode } : {}),
          ...(typeof (handoff.inputFilter ?? handoff.input_filter) === "string"
            ? { inputFilter: handoff.inputFilter ?? handoff.input_filter }
            : {}),
          ...(typeof (handoff.approvalRequired ?? handoff.approval_required) === "boolean"
            ? { approvalRequired: handoff.approvalRequired ?? handoff.approval_required }
            : {}),
          ...(Array.isArray(handoff.conditions) ? { conditions: uniqueStrings(handoff.conditions) } : {}),
        }))
    : undefined;
  return {
    ...(ORCHESTRATION_MODES.includes(topology.mode) ? { handoffMode: topology.mode } : {}),
    ...(typeof (topology.defaultRole ?? topology.default_role) === "string"
      ? { defaultRole: topology.defaultRole ?? topology.default_role }
      : {}),
    ...(lanes && Object.keys(lanes).length > 0 ? { lanes } : {}),
    ...(roles && roles.length > 0 ? { roles } : {}),
    ...(handoffs && handoffs.length > 0 ? { handoffs } : {}),
  };
}

function serviceReadinessCheck(config, profile, serviceName, composeEnabled) {
  const target = sanitizedReadinessUrl(profile.services?.[serviceName]);
  const composeService = runtimeComposeServiceName(config, serviceName);
  return {
    name: `service:${serviceName}`,
    type: composeEnabled ? "compose-service" : "external-service",
    service: serviceName,
    composeService,
    source: "services",
    required: true,
    ...(target ? { target } : {}),
  };
}

export function buildRuntimeReadinessPlan(profile = resolveRuntimeProfile(), options = {}) {
  const config = options.config ?? loadRuntimeProfiles();
  const composeArgs = renderComposeArgs(profile);
  const serviceNames = uniqueStrings(
    Array.isArray(options.services) ? options.services : readinessServiceNames(profile),
  );
  const composeServiceNames = uniqueStrings(
    serviceNames.map((serviceName) => runtimeComposeServiceName(config, serviceName)),
  );
  const composeEnabled = composeArgs.length > 0 && composeServiceNames.length > 0;
  const checks = serviceNames.map((serviceName) =>
    serviceReadinessCheck(config, profile, serviceName, composeEnabled),
  );
  const env = renderRuntimeEnv(profile);
  const daemonSocket = env.KIRAKIRA_DAEMON_SOCKET;
  if (
    pathValue(profile, "daemon.socketPath") !== undefined
    && typeof daemonSocket === "string"
    && daemonSocket.length > 0
  ) {
    checks.push({
      name: "daemon:socket",
      type: "socket",
      source: "daemon.socketPath",
      target: daemonSocket,
      required: true,
    });
  }

  const gatewayEndpoint = browserGatewayEndpoint(profile.daemon?.browserGateway);
  const gatewayHealth = browserGatewayHealthUrl(gatewayEndpoint);
  if (gatewayHealth) {
    checks.push({
      name: "daemon:browser-gateway",
      type: "http-health",
      source: "daemon.browserGateway",
      target: gatewayHealth,
      endpoint: sanitizedReadinessUrl(gatewayEndpoint),
      required: true,
    });
  }

  const webUrl = sanitizedReadinessUrl(profile.presentation?.web?.url);
  if (webUrl) {
    checks.push({
      name: "presentation:web",
      type: "http",
      source: "presentation.web.url",
      target: webUrl,
      required: true,
    });
  }

  const desktopUrl = sanitizedReadinessUrl(profile.presentation?.desktop?.rendererUrl);
  if (desktopUrl) {
    checks.push({
      name: "presentation:desktop",
      type: "http",
      source: "presentation.desktop.rendererUrl",
      target: desktopUrl,
      required: true,
    });
  }

  const topology = publicTopologySummary(profile.orchestration?.topology);
  if (topology && Object.keys(topology).length > 0) {
    checks.push({
      name: "orchestration:topology",
      type: "orchestration-topology",
      source: "orchestration.topology",
      required: true,
      topology,
    });
  }

  return {
    schemaVersion: 1,
    profile: profile.name,
    mode: profile.mode,
    compose: composeEnabled
      ? {
          command: "docker",
          args: ["compose", ...composeArgs, "up", "-d", "--wait", ...composeServiceNames],
          services: composeServiceNames,
          wait: "running|healthy",
        }
      : undefined,
    checks,
  };
}

export function loadRuntimeProfiles(configPath = defaultProfilesPath) {
  if (!existsSync(configPath)) {
    throw new Error(`Runtime profile config not found: ${configPath}`);
  }
  const data = JSON.parse(readFileSync(configPath, "utf8"));
  if (!data || typeof data !== "object" || !data.profiles) {
    throw new Error(`Invalid runtime profile config: ${configPath}`);
  }
  return data;
}

export function resolveRuntimeProfile(
  profileName = undefined,
  config = loadRuntimeProfiles(),
  env = process.env,
) {
  const name = profileName || env.KIRAKIRA_RUNTIME_PROFILE || config.defaultProfile;
  const profile = config.profiles?.[name];
  if (!profile) {
    const available = Object.keys(config.profiles ?? {}).sort().join(", ");
    throw new Error(`Unknown runtime profile "${name}". Available profiles: ${available}`);
  }
  const envBindings = mergeEnvBindings(config.envBindings, profile.envBindings);
  const dynamicProfile = resolveDynamicProfile(config, profile, env);
  const memory = runtimeMemoryConfig(config, profile);
  const orchestration = runtimeOrchestrationConfig(config, profile);
  const resolvedProfile = {
    name,
    ...profile,
    ...dynamicProfile,
    ...(memory ? { memory } : {}),
    ...(orchestration ? { orchestration } : {}),
    envBindings,
    containerStartup: resolveContainerStartupRefs(profile.containerStartup, config),
    workbench: resolveWorkbenchRefs(profile.workbench, config),
    workspaceRoot: env.KIRAKIRA_WORKSPACE_ROOT ?? profile.workspaceRoot,
    appRoot: env.KIRAKIRA_APP_ROOT ?? profile.appRoot,
    mcp: {
      ...(profile.mcp ?? {}),
      workspaceRoot: env.KIRAKIRA_MCP_WORKSPACE_ROOT
        ?? env.KIRAKIRA_WORKSPACE_ROOT
        ?? profile.mcp?.workspaceRoot
        ?? profile.workspaceRoot,
      appRoot: env.KIRAKIRA_MCP_APP_ROOT
        ?? env.KIRAKIRA_APP_ROOT
        ?? profile.mcp?.appRoot
        ?? profile.appRoot,
    },
  };
  resolvedProfileConfigs.set(resolvedProfile, config);
  return resolvedProfile;
}

export function runtimeProfileEnv(env = process.env, options = {}) {
  const output = { ...env };
  if (options.dropRootOverrides === true) {
    for (const key of ROOT_OVERRIDE_ENV_KEYS) {
      delete output[key];
    }
  }
  return output;
}

export function renderRuntimeEnv(profile = resolveRuntimeProfile()) {
  const env = {
    KIRAKIRA_RUNTIME_PROFILE: profile.name,
    KIRAKIRA_WORKSPACE_ROOT: profile.workspaceRoot,
    KIRAKIRA_APP_ROOT: profile.appRoot,
    KIRAKIRA_MCP_WORKSPACE_ROOT: profile.mcp?.workspaceRoot ?? profile.workspaceRoot,
    KIRAKIRA_MCP_APP_ROOT: profile.mcp?.appRoot ?? profile.appRoot,
    ...(profile.resolvedEnv ?? {}),
  };
  renderBoundEnv(env, profile);
  return env;
}

export function renderComposeArgs(profile = resolveRuntimeProfile()) {
  const args = [];
  for (const file of profile.composeFiles ?? []) {
    args.push("-f", file);
  }
  for (const composeProfile of profile.composeProfiles ?? []) {
    args.push("--profile", composeProfile);
  }
  return args;
}

function runtimeConfigForProfile(profile, options = {}) {
  return options.config
    ?? (isRecord(profile) ? resolvedProfileConfigs.get(profile) : undefined)
    ?? loadRuntimeProfiles();
}

function defaultMcpServerRefs(config) {
  const catalog = runtimeMcpCatalog(config);
  return [
    ...serviceGroupRefs(catalog.defaultServerGroups),
    ...(Array.isArray(catalog.defaultServers) ? catalog.defaultServers : []),
  ];
}

function mcpServerRefs(profile, config) {
  const mcp = isRecord(profile.mcp) ? profile.mcp : {};
  if (Array.isArray(mcp.serverRefs)) return mcp.serverRefs;
  const refs = [
    ...serviceGroupRefs(mcp.serverGroups),
    ...(Array.isArray(mcp.servers) ? mcp.servers : []),
  ];
  return refs.length > 0 ? refs : defaultMcpServerRefs(config);
}

function mcpRenderContext(profile) {
  return {
    profileName: profile.name,
    mode: profile.mode,
    workspaceRoot: profile.mcp?.workspaceRoot ?? profile.workspaceRoot,
    appRoot: profile.mcp?.appRoot ?? profile.appRoot,
  };
}

function renderMcpTemplate(value, context, label) {
  return value.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/gu, (_match, key) => {
    const replacement = context[key];
    if (replacement === undefined || replacement === null) {
      throw new Error(`Unknown MCP template variable "${key}" in ${label}`);
    }
    return String(replacement);
  });
}

function renderMcpValue(value, context, label) {
  if (typeof value === "string") {
    return renderMcpTemplate(value, context, label);
  }
  if (isRecord(value) && typeof value.value === "string") {
    const resolved = context[value.value];
    if (resolved === undefined || resolved === null) {
      throw new Error(`Unknown MCP value reference "${value.value}" in ${label}`);
    }
    return String(resolved);
  }
  if (isRecord(value) && Array.isArray(value.join)) {
    const [rootKey, ...segments] = value.join;
    if (typeof rootKey !== "string" || context[rootKey] === undefined || context[rootKey] === null) {
      throw new Error(`Unknown MCP join root "${rootKey}" in ${label}`);
    }
    return posix.join(
      String(context[rootKey]),
      ...segments.map((segment, index) =>
        renderMcpValue(segment, context, `${label}.join[${index + 1}]`),
      ),
    );
  }
  throw new Error(`Invalid MCP descriptor value in ${label}`);
}

function renderMcpArgs(args, context, serverName) {
  if (args === undefined) return undefined;
  if (!Array.isArray(args)) {
    throw new Error(`MCP server "${serverName}" args must be an array`);
  }
  return args.map((arg, index) => renderMcpValue(arg, context, `server "${serverName}" arg ${index}`));
}

function renderMcpEnv(env, context, serverName) {
  if (env === undefined) return undefined;
  if (!isRecord(env)) {
    throw new Error(`MCP server "${serverName}" env must be an object`);
  }
  const rendered = {};
  for (const [key, value] of Object.entries(env)) {
    rendered[key] = renderMcpValue(value, context, `server "${serverName}" env ${key}`);
  }
  return Object.keys(rendered).length > 0 ? rendered : undefined;
}

function renderMcpServerDescriptor(serverName, descriptor, context) {
  if (!isRecord(descriptor)) {
    throw new Error(`MCP server "${serverName}" is missing a catalog descriptor`);
  }
  if (descriptor.command === undefined) {
    throw new Error(`MCP server "${serverName}" requires a command`);
  }
  const command = renderMcpValue(descriptor.command, context, `server "${serverName}" command`);
  const args = renderMcpArgs(descriptor.args, context, serverName);
  const env = renderMcpEnv(descriptor.env, context, serverName);
  return {
    command,
    ...(args !== undefined ? { args } : {}),
    ...(env !== undefined ? { env } : {}),
  };
}

export function renderMcpServers(profile = resolveRuntimeProfile(), options = {}) {
  const config = runtimeConfigForProfile(profile, options);
  const serverNames = expandMcpServerRefs(options.serverRefs ?? mcpServerRefs(profile, config), config);
  const catalog = runtimeMcpServerCatalog(config);
  const overrides = isRecord(profile.mcp?.serverOverrides) ? profile.mcp.serverOverrides : {};
  const context = mcpRenderContext(profile);
  const rendered = {};
  for (const serverName of serverNames) {
    const descriptor = catalog[serverName];
    const override = overrides[serverName];
    rendered[serverName] = renderMcpServerDescriptor(
      serverName,
      isRecord(override) ? mergeSpecRecord(descriptor, override) : descriptor,
      context,
    );
  }
  return rendered;
}

export function renderMcpConfig(profile = resolveRuntimeProfile(), options = {}) {
  return { mcpServers: renderMcpServers(profile, options) };
}

function printEnv(env) {
  for (const [name, value] of Object.entries(env)) {
    console.log(`${name}=${value}`);
  }
}

const PROFILE_ACTIONS = {
  show(profile) {
    console.log(JSON.stringify(profile, null, 2));
  },
  env(profile) {
    printEnv(renderRuntimeEnv(profile));
  },
  "compose-args"(profile) {
    console.log(renderComposeArgs(profile).join(" "));
  },
  readiness(profile) {
    console.log(JSON.stringify(buildRuntimeReadinessPlan(profile), null, 2));
  },
  mcp(profile) {
    console.log(JSON.stringify(renderMcpConfig(profile), null, 2));
  },
};

function parseProfileArgs(argv) {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const options = {
    command: "show",
    profileName: undefined,
  };
  let commandSet = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--profile") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--profile requires a profile name");
      options.profileName = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown runtime profile argument: ${arg}`);
    }
    if (!commandSet) {
      if (!PROFILE_ACTIONS[arg]) {
        const available = Object.keys(PROFILE_ACTIONS).sort().join(", ");
        throw new Error(`Unknown runtime profile command "${arg}". Available commands: ${available}`);
      }
      options.command = arg;
      commandSet = true;
      continue;
    }
    if (options.profileName === undefined) {
      options.profileName = arg;
      continue;
    }
    throw new Error(`Unknown runtime profile argument: ${arg}`);
  }
  return options;
}

function main(argv) {
  const options = parseProfileArgs(argv);
  const profile = resolveRuntimeProfile(options.profileName);
  PROFILE_ACTIONS[options.command](profile);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

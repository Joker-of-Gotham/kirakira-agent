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

export interface RuntimeProjectionMemoryStackService {
  name: string;
  composeService?: string;
  required: boolean;
  urlEnv?: string;
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

export interface RuntimeProfileProjection {
  schemaVersion: 1;
  profile: string;
  mode: ResolvedRuntimeProfileState["mode"];
  fragments: {
    mcpConfig: RuntimeProjectionMcpConfigPlan;
    memoryStack: RuntimeProjectionMemoryStackPlan;
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
      required: service.required !== false,
      ...(service.url_env !== undefined ? { urlEnv: service.url_env } : {}),
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

export function buildResolvedRuntimeProfileProjection(
  runtimeState: ResolvedRuntimeState,
  profileName?: string,
): RuntimeProfileProjection {
  const profile = selectResolvedRuntimeProfile(runtimeState, profileName);
  return {
    schemaVersion: 1,
    profile: profile.name,
    mode: profile.mode,
    fragments: {
      mcpConfig: buildResolvedMcpConfigPlan(profile),
      memoryStack: buildResolvedMemoryStackPlan(profile),
    },
  };
}

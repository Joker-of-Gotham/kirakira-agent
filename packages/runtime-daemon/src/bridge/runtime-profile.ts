import type {
  OrchestrationTopologyConfig,
  ResolvedConfig,
  ResolvedRuntimeDeepResearchState,
  ResolvedRuntimeMcpServerState,
  ResolvedRuntimeMemoryState,
  ResolvedRuntimeOrchestrationState,
  ResolvedRuntimeProfileState,
} from "@kirakira/core";
import type {
  RuntimeMcpManifest,
  RuntimeOrchestrationManifest,
} from "@kirakira/runtime-contracts";

export type RuntimeProfileTopology =
  | ResolvedRuntimeOrchestrationState
  | OrchestrationTopologyConfig;

export interface RuntimeProfileCompositionInput {
  resolvedConfig?: Pick<ResolvedConfig, "runtimeState"> &
    Partial<Pick<ResolvedConfig, "agentToml">>;
  runtimeProfileName?: string;
}

export interface RuntimeProfileComposition {
  profile?: ResolvedRuntimeProfileState;
  mcpServers: ResolvedRuntimeMcpServerState[];
  mcpServerNames: string[];
  memory?: ResolvedRuntimeMemoryState;
  topology?: RuntimeProfileTopology;
  deepResearch?: ResolvedRuntimeDeepResearchState;
  mcpManifest?: RuntimeMcpManifest;
  orchestrationManifest?: RuntimeOrchestrationManifest;
}

export function activeRuntimeProfile(
  resolvedConfig: Pick<ResolvedConfig, "runtimeState"> | undefined,
  runtimeProfileName: string | undefined,
): ResolvedRuntimeProfileState | undefined {
  const runtimeState = resolvedConfig?.runtimeState;
  const profiles = runtimeState?.profiles ?? [];
  const profileName = runtimeProfileName ?? runtimeState?.default_profile;
  return profiles.find((profile) => profile.name === profileName) ?? profiles[0];
}

function runtimeMcpManifest(
  profile: ResolvedRuntimeProfileState | undefined,
  catalog: NonNullable<ResolvedConfig["runtimeState"]>["mcp_catalog"] | undefined,
): RuntimeMcpManifest | undefined {
  const servers = profile?.mcp_servers ?? [];
  if (servers.length === 0 && !catalog) return undefined;
  return {
    ...(profile?.name ? { profileName: profile.name } : {}),
    ...(profile?.mcp_server_groups ? { serverGroups: profile.mcp_server_groups } : {}),
    servers: servers.map((server) => ({
      name: server.name,
      command: server.command,
      ...(server.args ? { args: server.args } : {}),
      ...(server.env ? { envKeys: Object.keys(server.env).sort() } : {}),
    })),
    ...(catalog
      ? {
          catalog: {
            ...(catalog.default_server_groups
              ? { defaultServerGroups: catalog.default_server_groups }
              : {}),
            ...(catalog.groups ? { groups: catalog.groups } : {}),
            ...(catalog.servers ? { servers: catalog.servers } : {}),
          },
        }
      : {}),
  };
}

function runtimeOrchestrationManifest(
  profile: ResolvedRuntimeProfileState | undefined,
): RuntimeOrchestrationManifest | undefined {
  const orchestration = profile?.orchestration;
  if (!profile || !orchestration) return undefined;
  return {
    profileName: profile.name,
    ...(orchestration.handoff_mode ? { handoffMode: orchestration.handoff_mode } : {}),
    ...(orchestration.default_role ? { defaultRole: orchestration.default_role } : {}),
    ...(orchestration.lanes ? { lanes: orchestration.lanes } : {}),
    ...(orchestration.roles
      ? {
          roles: orchestration.roles.map((role) => ({
            id: role.id,
            ...(role.description ? { description: role.description } : {}),
            ...(role.lane ? { lane: role.lane } : {}),
            ...(role.model ? { model: role.model } : {}),
            ...(role.max_turns ? { maxTurns: role.max_turns } : {}),
            ...(role.context ? { context: role.context } : {}),
            ...(role.tool_scope ? { toolScope: role.tool_scope } : {}),
            ...(role.skill_scope ? { skillScope: role.skill_scope } : {}),
            ...(role.mcp_servers ? { mcpServers: role.mcp_servers } : {}),
            ...(role.permissions ? { permissionLabels: role.permissions } : {}),
          })),
        }
      : {}),
    ...(orchestration.handoffs
      ? {
          handoffs: orchestration.handoffs.map((handoff) => ({
            from: handoff.from,
            to: handoff.to,
            ...(handoff.mode ? { mode: handoff.mode } : {}),
            ...(handoff.input_filter ? { inputFilter: handoff.input_filter } : {}),
            ...(handoff.approval_required !== undefined
              ? { approvalRequired: handoff.approval_required }
              : {}),
            ...(handoff.conditions ? { conditions: handoff.conditions } : {}),
          })),
        }
      : {}),
  };
}

export function runtimeProfileComposition(
  input: RuntimeProfileCompositionInput,
): RuntimeProfileComposition {
  const profile = activeRuntimeProfile(
    input.resolvedConfig,
    input.runtimeProfileName,
  );
  const topology =
    profile?.orchestration ?? input.resolvedConfig?.agentToml?.orchestration?.topology;
  const mcpServers = profile?.mcp_servers ?? [];
  const memory = profile?.memory;
  const deepResearch = profile?.deep_research;
  const mcpManifest = runtimeMcpManifest(
    profile,
    input.resolvedConfig?.runtimeState?.mcp_catalog,
  );
  const orchestrationManifest = runtimeOrchestrationManifest(profile);
  return {
    ...(profile ? { profile } : {}),
    mcpServers,
    mcpServerNames: mcpServers.map((server) => server.name),
    ...(memory ? { memory } : {}),
    ...(topology ? { topology } : {}),
    ...(deepResearch ? { deepResearch } : {}),
    ...(mcpManifest ? { mcpManifest } : {}),
    ...(orchestrationManifest ? { orchestrationManifest } : {}),
  };
}

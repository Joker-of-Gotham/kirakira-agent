import type {
  ReactWorkerConfig,
  RuntimeCapabilityScope,
  SubagentCapability,
} from "./types.js";

export function runtimeCapabilityScopeFromCapabilities(
  capabilities: readonly SubagentCapability[] | undefined,
): RuntimeCapabilityScope | undefined {
  if (capabilities === undefined) return undefined;
  const toolNames: string[] = [];
  const skillNames: string[] = [];
  const mcpServers: string[] = [];
  for (const capability of capabilities) {
    if (capability.kind === "tool") toolNames.push(capability.name);
    if (capability.kind === "skill") skillNames.push(capability.name);
    if (capability.kind === "mcp") mcpServers.push(capability.name);
  }
  return { toolNames, skillNames, mcpServers };
}

export function runtimeCapabilityScopeFromConfig(
  config: Pick<ReactWorkerConfig, "toolScope" | "skillScope" | "mcpServers">,
): RuntimeCapabilityScope | undefined {
  if (
    config.toolScope === undefined &&
    config.skillScope === undefined &&
    config.mcpServers === undefined
  ) {
    return undefined;
  }
  return {
    ...(config.toolScope !== undefined ? { toolNames: [...config.toolScope] } : {}),
    ...(config.skillScope !== undefined ? { skillNames: [...config.skillScope] } : {}),
    ...(config.mcpServers !== undefined ? { mcpServers: [...config.mcpServers] } : {}),
  };
}

export function applyRuntimeCapabilityScope(
  config: ReactWorkerConfig,
  scope: RuntimeCapabilityScope | undefined,
): ReactWorkerConfig {
  if (scope === undefined) return config;
  return {
    ...config,
    ...(scope.toolNames !== undefined ? { toolScope: [...scope.toolNames] } : {}),
    ...(scope.skillNames !== undefined ? { skillScope: [...scope.skillNames] } : {}),
    ...(scope.mcpServers !== undefined ? { mcpServers: [...scope.mcpServers] } : {}),
  };
}

export function scopeAllowsToolName(
  scope: RuntimeCapabilityScope | undefined,
  toolName: string,
): boolean {
  if (scope === undefined) return true;
  if (scope.toolNames?.includes(toolName)) return true;
  return scope.toolNames === undefined && scope.mcpServers === undefined;
}

export function scopeAllowsMcpServerName(
  scope: RuntimeCapabilityScope | undefined,
  serverName: string,
): boolean {
  if (scope === undefined || scope.mcpServers === undefined) return true;
  return scope.mcpServers.includes(serverName);
}

export function scopeAllowsSkillName(
  scope: RuntimeCapabilityScope | undefined,
  skillName: string,
): boolean {
  if (scope === undefined || scope.skillNames === undefined) return true;
  return scope.skillNames.includes(skillName);
}

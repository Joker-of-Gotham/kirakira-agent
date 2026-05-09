import type { ResolvedConfig, AgentToml, PolicyYaml, ConfigLayer } from "@kirakira/core";
import { sha256Hex } from "@kirakira/core";
import { resolveConfigPaths } from "./paths.js";
import { defaultAgentToml, defaultPolicyYaml } from "./defaults.js";
import { parseAgentToml } from "./agent-toml.js";
import { parsePolicyYaml } from "./policy-yaml.js";

export interface LoadConfigOptions {
  configPath?: string;
  workspaceRoot: string;
}

export async function loadConfig(
  options: LoadConfigOptions,
): Promise<ResolvedConfig> {
  const paths = resolveConfigPaths(
    options.workspaceRoot,
    options.configPath,
  );

  const defaults = {
    agentToml: defaultAgentToml(),
    policyYaml: defaultPolicyYaml(),
  };

  const layers: ConfigLayer[] = [];

  let agentToml: AgentToml = defaults.agentToml;
  if (paths.agentToml) {
    const parsed = await parseAgentToml(paths.agentToml);
    agentToml = deepMerge(defaults.agentToml, parsed) as AgentToml;
    layers.push({ name: "repo", path: paths.agentToml, data: parsed as Partial<AgentToml> });
  }

  let policyYaml: PolicyYaml = defaults.policyYaml;
  if (paths.policyYaml) {
    const parsed = await parsePolicyYaml(paths.policyYaml);
    policyYaml = deepMerge(defaults.policyYaml, parsed) as PolicyYaml;
  }

  if (paths.localConfig) {
    const localParsed = await parseAgentToml(paths.localConfig).catch(() => ({} as Partial<AgentToml>));
    agentToml = deepMerge(agentToml, localParsed) as AgentToml;
    layers.push({ name: "workspace", path: paths.localConfig, data: localParsed as Partial<AgentToml> });
  }

  const fingerprint = sha256Hex(JSON.stringify({ agentToml, policyYaml })).slice(0, 16);

  return {
    agentToml: agentToml as Required<AgentToml>,
    policyYaml: policyYaml as Required<PolicyYaml>,
    layers,
    configPaths: {
      agentToml: paths.agentToml,
      policyYaml: paths.policyYaml,
      localConfig: paths.localConfig,
    },
    fingerprint,
    resolvedAt: new Date().toISOString(),
  };
}

function deepMerge(target: unknown, source: unknown): unknown {
  if (
    source === null ||
    source === undefined ||
    typeof source !== "object" ||
    typeof target !== "object" ||
    target === null ||
    Array.isArray(source)
  ) {
    return source ?? target;
  }

  const result: Record<string, unknown> = { ...(target as Record<string, unknown>) };
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (value !== undefined) {
      result[key] = deepMerge(
        (target as Record<string, unknown>)[key],
        value,
      );
    }
  }
  return result;
}

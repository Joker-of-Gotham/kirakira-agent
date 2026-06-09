import {
  loadConfigLayers,
  loadLocalConfig,
  loadPolicyYaml,
  resolveConfig,
} from "@kirakira/config-resolver";
import type { ResolvedConfig, ResolveConfigOptions } from "@kirakira/config-resolver";

export interface LoadConfigOptions {
  configPath?: string;
  workspaceRoot: string;
  systemConfigPath?: string;
  userHomePath?: string;
  skipSystemLayer?: boolean;
  skipUserLayer?: boolean;
  runtimeProfilesPath?: string;
  runtimeProfilesConfig?: unknown;
  runtimeEnv?: ResolveConfigOptions["runtimeEnv"];
}

export async function loadConfig(
  options: LoadConfigOptions,
): Promise<ResolvedConfig> {
  const layers = loadConfigLayers({
    workspaceRoot: options.workspaceRoot,
    repoConfigPath: options.configPath,
    systemConfigPath: options.systemConfigPath,
    userHomePath: options.userHomePath,
    skipSystemLayer: options.skipSystemLayer,
    skipUserLayer: options.skipUserLayer,
  });

  return resolveConfig(
    layers,
    loadPolicyYaml(options.workspaceRoot),
    loadLocalConfig(options.workspaceRoot),
    {
      runtimeProfilesPath: options.runtimeProfilesPath,
      runtimeProfilesConfig: options.runtimeProfilesConfig,
      runtimeEnv: options.runtimeEnv ?? process.env,
    },
  );
}

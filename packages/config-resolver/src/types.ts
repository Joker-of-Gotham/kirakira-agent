import type {
  AgentToml,
  ConfigLayer,
  ConfigLayerName,
  LocalConfig,
  PolicyYaml,
  ResolvedConfig,
  ResolvedRuntimeMcpServerState,
  ResolvedRuntimeMemoryState,
  ResolvedRuntimeProfileState,
  ResolvedRuntimeState,
} from "@kirakira/core";

export type {
  AgentToml,
  ConfigLayer,
  ConfigLayerName,
  LocalConfig,
  PolicyYaml,
  ResolvedConfig,
  ResolvedRuntimeMcpServerState,
  ResolvedRuntimeMemoryState,
  ResolvedRuntimeProfileState,
  ResolvedRuntimeState,
};

export interface LoaderOptions {
  workspaceRoot: string;
  repoConfigPath?: string;
  systemConfigPath?: string;
  userHomePath?: string;
  skipSystemLayer?: boolean;
  skipUserLayer?: boolean;
}

export interface ConfigChangeEvent {
  layer: ConfigLayerName;
  path: string;
  timestamp: number;
}

export type ConfigChangeHandler = (event: ConfigChangeEvent) => void;

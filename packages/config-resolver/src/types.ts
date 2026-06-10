import type {
  AgentToml,
  ConfigLayer,
  ConfigLayerName,
  LocalConfig,
  PolicyYaml,
  ResolvedConfig,
  ResolvedRuntimeDeepResearchMcpState,
  ResolvedRuntimeDeepResearchMcpTargetState,
  ResolvedRuntimeDeepResearchState,
  ResolvedRuntimeMcpServerState,
  ResolvedRuntimeMemoryState,
  ResolvedRuntimeOrchestrationState,
  ResolvedRuntimeProfileState,
  ResolvedRuntimeServiceState,
  ResolvedRuntimeState,
} from "@kirakira/core";

export type {
  AgentToml,
  ConfigLayer,
  ConfigLayerName,
  LocalConfig,
  PolicyYaml,
  ResolvedConfig,
  ResolvedRuntimeDeepResearchMcpState,
  ResolvedRuntimeDeepResearchMcpTargetState,
  ResolvedRuntimeDeepResearchState,
  ResolvedRuntimeMcpServerState,
  ResolvedRuntimeMemoryState,
  ResolvedRuntimeOrchestrationState,
  ResolvedRuntimeProfileState,
  ResolvedRuntimeServiceState,
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

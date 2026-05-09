import type {
  CommandRegistry,
  DetectInput,
  DetectResult,
  NormalizeInput,
  NormalizedArtifact,
  PluginKind,
  PluginMeta,
  OutputEvent,
} from "@kirakira/core";

export type {
  ArgDef,
  CommandHandler,
  CommandRegistry,
  DetectInput,
  DetectResult,
  NormalizeInput,
  NormalizedArtifact,
  PluginKind,
  PluginMeta,
  SlashHandler,
} from "@kirakira/core";

/** Import adapter surface implemented by CLI plugins. */
export interface ImportAdapter {
  detect(input: DetectInput): Promise<DetectResult>;
  normalize(input: NormalizeInput): Promise<NormalizedArtifact>;
}

/** Renderer plugins turn structured output events into display strings. */
export interface RendererAdapter {
  format(event: OutputEvent): string;
}

/** CLI plugin entry discoverable on disk before load. */
export interface DiscoveredPlugin {
  path: string;
  manifest?: Record<string, unknown>;
}

export interface CommandLikePlugin extends DiscoveredPlugin {
  kind: "command";
  meta: PluginMeta;
  mount(registry: CommandRegistry): void;
}

export interface ImportAdapterLike extends DiscoveredPlugin {
  kind: "import-adapter";
  meta: PluginMeta;
  adapter: ImportAdapter;
}

export interface RendererLike extends DiscoveredPlugin {
  kind: "renderer";
  meta: PluginMeta;
  renderer: RendererAdapter;
}

export type LoadedPlugin =
  | CommandLikePlugin
  | ImportAdapterLike
  | RendererLike
  | {
      kind: "registry";
      meta: PluginMeta;
      path: string;
      baseUrl: string;
    };

export interface PluginSandboxPolicy {
  allowFsRead: boolean;
  allowFsWrite: boolean;
  allowNetwork: boolean;
  allowChildProcesses: boolean;
}

export function defaultSandboxPolicy(kind: PluginKind): PluginSandboxPolicy {
  switch (kind) {
    case "command":
      return {
        allowFsRead: true,
        allowFsWrite: false,
        allowNetwork: false,
        allowChildProcesses: false,
      };
    case "import-adapter":
      return {
        allowFsRead: true,
        allowFsWrite: false,
        allowNetwork: true,
        allowChildProcesses: false,
      };
    case "renderer":
      return {
        allowFsRead: true,
        allowFsWrite: false,
        allowNetwork: false,
        allowChildProcesses: false,
      };
    case "registry":
      return {
        allowFsRead: true,
        allowFsWrite: false,
        allowNetwork: true,
        allowChildProcesses: false,
      };
    default:
      return {
        allowFsRead: false,
        allowFsWrite: false,
        allowNetwork: false,
        allowChildProcesses: false,
      };
  }
}

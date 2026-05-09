import type { SlashHandler, CommandHandler } from "@kirakira/core";
import type {
  CommandLikePlugin,
  ImportAdapterLike,
  LoadedPlugin,
  RendererLike,
} from "./types.js";

type RegistrySourcePlugin = Extract<LoadedPlugin, { kind: "registry" }>;

export type PluginRegistration = LoadedPlugin;

/** Registries for active CLI plugin extensions. */
export class PluginRegistry {
  private commands = new Map<string, CommandHandler>();
  private slash = new Map<string, SlashHandler>();
  private imports: ImportAdapterLike[] = [];
  private renderers: RendererLike[] = [];
  private registrySources: RegistrySourcePlugin[] = [];

  registerCommand(name: string, handler: CommandHandler): void {
    this.commands.set(name, handler);
  }

  registerSlash(name: string, handler: SlashHandler): void {
    this.slash.set(name, handler);
  }

  addImportAdapter(plugin: ImportAdapterLike): void {
    this.imports.push(plugin);
  }

  addRenderer(plugin: RendererLike): void {
    this.renderers.push(plugin);
  }

  addRegistrySource(plugin: RegistrySourcePlugin): void {
    this.registrySources.push(plugin);
  }

  load(plugin: PluginRegistration): void {
    switch (plugin.kind) {
      case "command":
        this.hydrateCommand(plugin);
        break;
      case "import-adapter":
        this.addImportAdapter(plugin);
        break;
      case "renderer":
        this.addRenderer(plugin);
        break;
      case "registry":
        this.addRegistrySource(plugin);
        break;
      default:
        break;
    }
  }

  private hydrateCommand(plugin: CommandLikePlugin): void {
    const mountApi = {
      register: (name: string, handler: CommandHandler) => {
        this.registerCommand(name, handler);
      },
      registerSlash: (name: string, handler: SlashHandler) => {
        this.registerSlash(name, handler);
      },
    };
    plugin.mount(mountApi);
  }

  listCommands(): Map<string, CommandHandler> {
    return new Map(this.commands);
  }

  listSlash(): Map<string, SlashHandler> {
    return new Map(this.slash);
  }

  listImportAdapters(): ImportAdapterLike[] {
    return [...this.imports];
  }

  listRenderers(): RendererLike[] {
    return [...this.renderers];
  }

  listRegistrySources(): RegistrySourcePlugin[] {
    return [...this.registrySources];
  }
}

export function createPluginRegistry(): PluginRegistry {
  return new PluginRegistry();
}

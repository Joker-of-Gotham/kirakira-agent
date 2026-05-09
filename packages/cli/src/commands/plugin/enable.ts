import { Command, Args } from "@oclif/core";
import { discoverPluginPaths, statPlugin } from "../../plugin/loader.js";
import { loadPluginState, savePluginState } from "../../plugin/state.js";

export default class PluginEnable extends Command {
  static override description = "Enable a disabled plugin";
  static override args = {
    name: Args.string({ description: "Plugin name", required: true }),
  };
  async run(): Promise<void> {
    const { args } = await this.parse(PluginEnable);
    const cwd = process.cwd();
    const paths = await discoverPluginPaths(cwd);
    let found: string | undefined;
    for (const p of paths) {
      const meta = await statPlugin(p);
      if (meta?.name === args.name) {
        found = meta.name;
        break;
      }
    }
    if (!found) {
      this.error(`Plugin not found: ${args.name}`);
    }

    const state = await loadPluginState();
    state.disabled = state.disabled.filter((n) => n !== args.name);
    await savePluginState(state);
    this.log(`Enabled plugin: ${args.name}`);
  }
}

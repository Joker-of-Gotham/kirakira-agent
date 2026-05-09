import { Command, Args } from "@oclif/core";
import { discoverPluginPaths, statPlugin } from "../../plugin/loader.js";
import { loadPluginState, savePluginState } from "../../plugin/state.js";

export default class PluginDisable extends Command {
  static override description = "Disable a plugin without uninstalling";
  static override args = {
    name: Args.string({ description: "Plugin name", required: true }),
  };
  async run(): Promise<void> {
    const { args } = await this.parse(PluginDisable);
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
    if (!state.disabled.includes(args.name)) {
      state.disabled.push(args.name);
    }
    await savePluginState(state);
    this.log(`Disabled plugin: ${args.name}`);
  }
}

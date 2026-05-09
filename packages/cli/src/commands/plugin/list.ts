import { Command, Flags } from "@oclif/core";
import { discoverPluginPaths, statPlugin } from "../../plugin/loader.js";
import { loadPluginState } from "../../plugin/state.js";

export default class PluginList extends Command {
  static override description = "List installed plugins";
  static override flags = {
    json: Flags.boolean({ description: "Output as JSON", default: false }),
  };
  async run(): Promise<void> {
    const { flags } = await this.parse(PluginList);
    const cwd = process.cwd();
    const paths = await discoverPluginPaths(cwd);
    const state = await loadPluginState();
    const disabled = new Set(state.disabled);

    const metas = [];
    for (const p of paths) {
      const meta = await statPlugin(p);
      if (meta) {
        const eff = disabled.has(meta.name) ? false : meta.enabled;
        metas.push({ ...meta, enabled: eff });
      }
    }

    if (flags.json) {
      this.log(JSON.stringify(metas, null, 2));
      return;
    }

    if (metas.length === 0) {
      this.log("No plugins found under ~/.kirakira/plugins or ./.kirakira/plugins.");
      return;
    }

    this.log(`Plugins (${metas.length}):`);
    for (const m of metas) {
      this.log(
        `  ${m.name}\t${m.enabled ? "enabled" : "disabled"}\t${m.kind}\t${m.path}`,
      );
    }
  }
}

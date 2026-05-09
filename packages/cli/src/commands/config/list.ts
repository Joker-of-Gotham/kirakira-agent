import { Command, Flags } from "@oclif/core";
import { loadConfig } from "../../config/loader.js";

export default class ConfigList extends Command {
  static override description = "List all resolved configuration values";

  static override flags = {
    json: Flags.boolean({ description: "Output as JSON", default: false }),
    section: Flags.string({
      description: "Only show a specific section (e.g. model, policy, session)",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigList);
    const config = await loadConfig({ workspaceRoot: process.cwd() });

    if (flags.json) {
      const out = flags.section
        ? getSection(config.agentToml, flags.section)
        : config.agentToml;
      this.log(JSON.stringify(out, null, 2));
      return;
    }

    const toml = flags.section
      ? getSection(config.agentToml, flags.section)
      : config.agentToml;

    if (toml === undefined) {
      this.error(`Section not found: ${flags.section}`);
    }

    printFlat("", toml as Record<string, unknown>, (line) => this.log(line));

    if (config.configPaths.agentToml) {
      this.log(`\n(source: ${config.configPaths.agentToml})`);
    }
    if (config.configPaths.localConfig) {
      this.log(`(local override: ${config.configPaths.localConfig})`);
    }
  }
}

function getSection(
  obj: Record<string, unknown>,
  key: string,
): unknown {
  return key.split(".").reduce<unknown>((acc, k) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[k];
    }
    return undefined;
  }, obj);
}

function printFlat(
  prefix: string,
  obj: Record<string, unknown>,
  log: (s: string) => void,
): void {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      printFlat(key, v as Record<string, unknown>, log);
    } else {
      log(`${key} = ${JSON.stringify(v)}`);
    }
  }
}

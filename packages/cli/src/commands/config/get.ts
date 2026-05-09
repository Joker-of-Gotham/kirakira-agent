import { Command, Args } from "@oclif/core";
import { loadConfig } from "../../config/loader.js";

export default class ConfigGet extends Command {
  static override description = "Read a configuration value";

  static override args = {
    key: Args.string({ description: "Config key (dot-notation)", required: true }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(ConfigGet);
    const config = await loadConfig({ workspaceRoot: process.cwd() });
    const value = getNestedValue(config.agentToml, args.key);
    if (value === undefined) {
      this.error(`Key not found: ${args.key}`);
    }
    this.log(typeof value === "object" ? JSON.stringify(value, null, 2) : String(value));
  }
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

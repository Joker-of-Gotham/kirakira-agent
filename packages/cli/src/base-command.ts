import { Command, Flags } from "@oclif/core";
import type { ResolvedConfig } from "@kirakira/core";
import { loadConfig } from "./config/loader.js";

export abstract class BaseCommand extends Command {
  static baseFlags = {
    config: Flags.string({
      char: "c",
      description: "Path to agent.toml config file",
    }),
    "output-format": Flags.string({
      options: ["human", "json", "jsonl"],
      description: "Output format",
    }),
  };

  protected resolvedConfig: ResolvedConfig | undefined;

  protected async loadProjectConfig(): Promise<ResolvedConfig> {
    if (!this.resolvedConfig) {
      const flags = (await this.parse()).flags as Record<string, unknown>;
      this.resolvedConfig = await loadConfig({
        configPath: flags["config"] as string | undefined,
        workspaceRoot: process.cwd(),
      });
    }
    return this.resolvedConfig;
  }
}

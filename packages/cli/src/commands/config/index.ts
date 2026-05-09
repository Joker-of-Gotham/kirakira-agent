import { Command } from "@oclif/core";

export default class Config extends Command {
  static override description = "View or modify kirakira-agent configuration";

  async run(): Promise<void> {
    this.log("Usage: kirakira-agent config [get|set|list]");
    this.log("  get <key>         Read a config value");
    this.log("  set <key> <value> Write a config value");
    this.log("  list              List all resolved config values");
    this.log("");
    this.log("For interactive LLM provider setup, run `kirakira-agent` and use `/config setup` or `/models`.");
  }
}

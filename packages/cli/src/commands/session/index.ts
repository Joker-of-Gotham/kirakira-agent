import { Command } from "@oclif/core";

export default class Session extends Command {
  static override description = "Manage agent sessions";

  async run(): Promise<void> {
    this.log("Usage: kirakira-agent session [list|resume|export|prune]");
  }
}

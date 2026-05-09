import { Command } from "@oclif/core";

export default class SandboxTopic extends Command {
  static override description = "Inspect coarse-grained sandbox profiles";

  async run(): Promise<void> {
    this.log("Usage: kirakira-agent sandbox [ls|show|diff|doctor|run]");
  }
}

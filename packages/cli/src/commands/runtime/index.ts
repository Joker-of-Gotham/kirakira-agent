import { Command } from "@oclif/core";

export default class RuntimeTopic extends Command {
  static override description = "Runtime profile and readiness commands";

  async run(): Promise<void> {
    this.log("Usage: kirakira-agent runtime <profile|ready|doctor> [args]");
  }
}

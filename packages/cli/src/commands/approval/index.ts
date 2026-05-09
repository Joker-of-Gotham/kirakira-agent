import { Command } from "@oclif/core";

export default class Approval extends Command {
  static override description = "Manage human approvals queue";

  async run(): Promise<void> {
    this.log("Usage: kirakira-agent approval [ls|show|approve|deny|revoke|prune]");
  }
}

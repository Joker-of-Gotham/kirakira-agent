import { Command } from "@oclif/core";

export default class AuditTopic extends Command {
  static override description = "Operate against the segmented audit ledger under ~/.kirakira/audit";

  async run(): Promise<void> {
    this.log("Usage: kirakira-agent audit [tail|show|verify|export|checkpoint-sign]");
  }
}

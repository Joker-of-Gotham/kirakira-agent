import { Command } from "@oclif/core";

export default class Skill extends Command {
  static override description = "Manage agent skills";

  async run(): Promise<void> {
    this.log("Usage: kirakira-agent skill [search|install|import|link|validate|list|export|discover|activate]");
    this.log("  discover               Run multi-tier skill discovery");
    this.log("  activate <task>        Check which skills match a task description");
  }
}

import { Command } from "@oclif/core";

export default class Plugin extends Command {
  static override description = "Manage CLI plugins";

  async run(): Promise<void> {
    this.log("Usage: kirakira-agent plugin [install|enable|disable|list|update]");
  }
}

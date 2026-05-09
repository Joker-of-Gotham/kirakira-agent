import { Command } from "@oclif/core";

export default class Trace extends Command {
  static override description = "View and export trace and audit data";
  async run(): Promise<void> {
    this.log("Usage: kirakira-agent trace [tail|show|export|open]");
  }
}

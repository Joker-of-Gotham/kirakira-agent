import { Command } from "@oclif/core";

export default class Policy extends Command {
  static override description = "Evaluate and inspect Kirakira policy (PDP)";

  async run(): Promise<void> {
    this.log("Usage: kirakira-agent policy [eval|status|verify-bundle|why|test|replay]");
    this.log("");
    this.log("  eval --tool=<kind> [--cmd <bin>] [--args a,b,...] [--json]");
    this.log("  status [--json]");
    this.log("  verify-bundle [--dir <bundleRoot>] [--json]");
    this.log("  why <decision-id> [--json]");
    this.log("  test [--dir <regoPkgRoot>]");
    this.log("  replay <audit-event-id> [--json]");
  }
}

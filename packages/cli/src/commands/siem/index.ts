import { Command } from "@oclif/core";

export const SIEM_USAGE = `kirakira-agent siem <subcommand>

Subcommands:
  test-rule   Test a SIEM detection rule against local audit data
  export      Export audit data in SIEM-compatible format

Examples:
  kirakira-agent siem test-rule suspicious-egress
  kirakira-agent siem export --target splunk-hec
  kirakira-agent siem export --target sentinel-cef --since 24h`;

export default class SiemTopic extends Command {
  static override description = "SIEM-oriented helpers over audit exports and rule fixtures";

  async run(): Promise<void> {
    this.log(SIEM_USAGE);
  }
}

import { Command, Flags } from "@oclif/core";

import { siemExport } from "../../lib/siem-export.js";

export default class SiemExportCli extends Command {
  static override description = "Export audit ledger in a SIEM-targeted framing (via audit encoders)";

  static override flags = {
    target: Flags.string({
      description: "SIEM sink mapping",
      options: ["splunk-hec", "sentinel-cef", "elastic-ecs"],
      required: true,
    }),
    since: Flags.string({ description: "Time window forwarded to LedgerReader.readRange", default: "24h" }),
    format: Flags.string({
      description: "Optional override of the mapped SIEM format (advanced)",
      options: ["ecs-json", "cef", "hec"],
    }),
    output: Flags.string({ description: "Optional output file path" }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(SiemExportCli);
    await siemExport({
      target: flags.target as "splunk-hec" | "sentinel-cef" | "elastic-ecs",
      since: flags.since,
      ...(flags.format !== undefined ? { format: flags.format } : {}),
      ...(flags.output !== undefined ? { output: flags.output } : {}),
    });
  }
}

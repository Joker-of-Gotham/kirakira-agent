import { Command, Flags } from "@oclif/core";
import type { SiemFormat } from "@kirakira/audit-ledger";

import { auditExport } from "../../lib/audit-export.js";

export default class AuditExportCli extends Command {
  static override description = "Drain audit hashes into ECS/CEF/HEC payloads";

  static override flags = {
    format: Flags.string({
      description: "Target SIEM framing",
      options: ["ecs-json", "cef", "hec"],
      default: "ecs-json",
    }),
    since: Flags.string({ description: "ISO lower bound forwarded to LedgerReader.readRange" }),
    out: Flags.string({ description: "Optional absolute file sink" }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AuditExportCli);

    await auditExport({
      format: flags.format as SiemFormat,
      ...(flags.since !== undefined ? { since: flags.since } : {}),
      ...(flags.out !== undefined ? { out: flags.out } : {}),
    });
  }
}

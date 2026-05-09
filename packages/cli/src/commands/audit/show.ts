import { Args, Command, Flags } from "@oclif/core";
import { getAuditLedgerDir } from "@kirakira/audit-ledger";

import { scanFindEvent } from "../../lib/ledger-utils.js";

export interface AuditShowOptions {
  eventId: string;
  json?: boolean;
}

export async function auditShow(options: AuditShowOptions): Promise<void> {
  const ledger = getAuditLedgerDir();
  const hit = await scanFindEvent(ledger, options.eventId);
  if (!hit) throw new Error(`audit event ${options.eventId} not indexed in ${ledger}`);

  console.log(JSON.stringify(hit, null, options.json ?? true ? 2 : undefined));
}

export default class AuditShowCmd extends Command {
  static override description = "Print an AuditEvent verbatim from segmented JSON ledger";

  static override args = { eventId: Args.string({ description: "event_id", required: true }) };

  static override flags = {
    json: Flags.boolean({
      description: "Pretty-print (always JSON today — flag reserved for symmetry)",
      default: true,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AuditShowCmd);
    await auditShow({ eventId: args.eventId, json: flags.json ?? true });
  }
}

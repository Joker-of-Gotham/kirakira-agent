import { Command, Flags } from "@oclif/core";
import type { ChainVerifyResult } from "@kirakira/audit-ledger";
import { LedgerReader, getAuditLedgerDir } from "@kirakira/audit-ledger";

export interface AuditVerifyOptions {
  segment?: string;
  latest?: boolean;
}

export async function auditVerifyLedger(options: AuditVerifyOptions = {}): Promise<void> {
  const reader = new LedgerReader(getAuditLedgerDir());
  const segments = await reader.listSegmentIdsSorted();

  const targets =
    typeof options.segment === "string" && options.segment.length > 0
      ? [options.segment]
      : options.latest && segments.length > 0
        ? [segments[segments.length - 1]!]
        : [...segments];

  if (targets.length === 0) throw new Error("No ledger segments detected on disk.");

  const report: Record<string, ChainVerifyResult> = {};
  let okAggregate = true;
  for (const sid of targets) {
    const res = await reader.verifySegmentChain(sid);
    report[sid] = res;
    if (!res.valid) okAggregate = false;
  }

  console.log(JSON.stringify({ ok: okAggregate, report }, null, 2));
}

export default class AuditVerifyCmd extends Command {
  static override description = "Re-hash JSONL entries to guard against ledger tampering";

  static override flags = {
    segment: Flags.string({ description: "Only verify a concrete segment id (YYYY-MM-DD-####)" }),
    latest: Flags.boolean({ description: "Verify only youngest shard", default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AuditVerifyCmd);

    await auditVerifyLedger({
      segment: flags.segment,
      latest: flags.latest ?? false,
    });
  }
}

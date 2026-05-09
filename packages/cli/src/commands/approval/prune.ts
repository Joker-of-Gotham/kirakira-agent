import { Command, Flags } from "@oclif/core";
import { ApprovalManager, defaultApprovalsDirectory } from "@kirakira/policy-engine";

export interface ApprovalPruneOptions {
  json?: boolean;
}

/** Flip long-lived pending envelopes to `expired` so operators can prune queues. */
export async function approvalPrune(options: ApprovalPruneOptions = {}): Promise<void> {
  const transitioned = await new ApprovalManager(defaultApprovalsDirectory()).pruneExpired();
  const summary = { transitioned_to_expired: transitioned };
  if (options.json ?? false) console.log(JSON.stringify(summary, null, 2));
  else console.log(`Marked ${transitioned} stale approvals as expired`);
}

export default class ApprovalPruneCmd extends Command {
  static override description = "Expire approvals that stayed pending beyond the 14‑day SLA";

  static override flags = {
    expired: Flags.boolean({ description: "Only prune expired approvals (default behavior, kept for CLI consistency)", default: false }),
    json: Flags.boolean({ description: "Emit JSON counter", default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ApprovalPruneCmd);
    await approvalPrune({ json: flags.json ?? false });
  }
}

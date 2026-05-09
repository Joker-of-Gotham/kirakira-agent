import { Args, Command, Flags } from "@oclif/core";
import { ApprovalManager, defaultApprovalsDirectory } from "@kirakira/policy-engine";

export interface ApprovalDenyOptions {
  id: string;
  reason?: string;
}

export async function approvalDeny(options: ApprovalDenyOptions): Promise<void> {
  const mgr = new ApprovalManager(defaultApprovalsDirectory());
  const resolved = await mgr.resolveApproval(options.id, "denied", "once", options.reason);
  console.log(JSON.stringify(resolved, null, 2));
}

export default class ApprovalDenyCmd extends Command {
  static override description = "Deny an outstanding approval ticket";

  static override args = { id: Args.string({ description: "approval_id", required: true }) };

  static override flags = {
    reason: Flags.string({ description: "Reviewer rationale surfaced in audit payloads" }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ApprovalDenyCmd);
    await approvalDeny({ id: args.id, reason: flags.reason });
  }
}

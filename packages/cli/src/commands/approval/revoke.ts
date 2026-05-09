import { Command, Flags } from "@oclif/core";
import { ApprovalManager, defaultApprovalsDirectory } from "@kirakira/policy-engine";

export interface ApprovalRevokeOptions {
  fingerprint: string;
}

export async function approvalRevoke(options: ApprovalRevokeOptions): Promise<void> {
  const mgr = new ApprovalManager(defaultApprovalsDirectory());
  await mgr.revokeByFingerprint(options.fingerprint.trim());
  console.log(`Revoked template fingerprint=${options.fingerprint.trim()}`);
}

export default class ApprovalRevokeCmd extends Command {
  static override description =
    "Remove persisted approvals whose fingerprint.template equals the CLI argument";

  static override flags = {
    fingerprint: Flags.string({ description: "Template fingerprint from PEP output", required: true }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ApprovalRevokeCmd);
    await approvalRevoke({ fingerprint: flags.fingerprint });
  }
}

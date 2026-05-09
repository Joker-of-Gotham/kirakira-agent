import { Args, Command, Flags } from "@oclif/core";
import type { ApprovalScope } from "@kirakira/core";
import { ApprovalManager, defaultApprovalsDirectory } from "@kirakira/policy-engine";

export interface ApprovalApproveOptions {
  id: string;
  once?: boolean;
  session?: boolean;
  workspace?: boolean;
}

function resolveScope(opts: ApprovalApproveOptions): ApprovalScope {
  if (opts.workspace) return "workspace";
  if (opts.session) return "session";
  return "once";
}

export async function approvalApprove(options: ApprovalApproveOptions): Promise<void> {
  const mgr = new ApprovalManager(defaultApprovalsDirectory());
  const resolved = await mgr.resolveApproval(options.id, "approved", resolveScope(options), undefined);
  console.log(JSON.stringify(resolved, null, 2));
}

export default class ApprovalApproveCmd extends Command {
  static override description = "Approve a pending approval request";

  static override args = { id: Args.string({ description: "approval_id", required: true }) };

  static override flags = {
    once: Flags.boolean({
      description: "Explicit once scope acknowledgement (defaults to once when unstated)",
      default: false,
    }),
    session: Flags.boolean({ description: "Approve with session scope instead of once" }),
    workspace: Flags.boolean({ description: "Approve with workspace scope instead of once" }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ApprovalApproveCmd);
    await approvalApprove({
      id: args.id,
      once: flags.once,
      session: flags.session,
      workspace: flags.workspace,
    });
  }
}

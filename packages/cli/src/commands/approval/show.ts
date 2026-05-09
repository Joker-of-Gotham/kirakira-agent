import { Args, Command, Flags } from "@oclif/core";
import { ApprovalManager, defaultApprovalsDirectory } from "@kirakira/policy-engine";

export interface ApprovalShowOptions {
  id: string;
  json?: boolean;
}

export async function approvalShow(options: ApprovalShowOptions): Promise<void> {
  const mgr = new ApprovalManager(defaultApprovalsDirectory());
  const rows = await mgr.listAll();
  const hit = rows.find((r) => r.approval_id === options.id);
  if (!hit) throw new Error(`approval ${options.id} not found`);

  if (options.json ?? false) {
    console.log(JSON.stringify(hit, null, 2));
    return;
  }

  console.log(`Approval ID: ${hit.approval_id}`);
  console.log(`Status:      ${hit.status}`);
  console.log(`Scope:       ${hit.scope}`);
  console.log(`Summary:     ${hit.request_summary.title}`);
  console.log(`Risk:        ${hit.request_summary.risk}`);
  console.log(`Requested:   ${hit.requested_at ?? "unknown"}`);
  console.log(`Resolved:    ${hit.resolved_at ?? "pending"}`);
  if (hit.resolution?.comment) console.log(`Comment:     ${hit.resolution.comment}`);
}

export default class ApprovalShowCmd extends Command {
  static override description = "Show a persisted approval envelope";

  static override args = { id: Args.string({ description: "approval_id", required: true }) };

  static override flags = {
    json: Flags.boolean({ description: "Force JSON framing", default: false }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ApprovalShowCmd);
    await approvalShow({ id: args.id, json: flags.json ?? false });
  }
}

import { Command, Flags } from "@oclif/core";
import { ApprovalManager, defaultApprovalsDirectory } from "@kirakira/policy-engine";

export interface ApprovalListOptions {
  pending?: boolean;
  all?: boolean;
  expired?: boolean;
  json?: boolean;
}

export async function approvalList(options: ApprovalListOptions = {}): Promise<void> {
  const mgr = new ApprovalManager(defaultApprovalsDirectory());

  const wantAll = options.all ?? false;
  const wantExpiredOnly = options.expired ?? false;
  const bucket = await mgr.listAll();

  let filtered =
    wantExpiredOnly && !wantAll
      ? bucket.filter((r) => r.status === "expired")
      : wantAll
        ? [...bucket]
        : await mgr.listPending();

  if (options.pending ?? false)
    filtered = filtered.filter((r) => r.status === "pending");

  filtered.sort((a, b) => `${a.requested_at ?? ""}`.localeCompare(`${b.requested_at ?? ""}`));

  if (options.json ?? false) {
    console.log(JSON.stringify(filtered, null, 2));
    return;
  }

  for (const rec of filtered) {
    console.log(
      `${rec.approval_id}\t${rec.status}\t${rec.scope}\trequested=${rec.requested_at ?? "?"}\td=${rec.decision_id.slice(
        0,
        8,
      )}…`,
    );
  }
}

export default class ApprovalLs extends Command {
  static override description = "List approval records persisted under ~/.kirakira/approvals";

  static override flags = {
    pending: Flags.boolean({ description: "Restrict output to pending rows (useful after --all)" }),
    all: Flags.boolean({ description: "Enumerate every persisted JSON approval" }),
    expired: Flags.boolean({ description: "Only expired envelopes" }),
    json: Flags.boolean({ description: "Emit JSON rows", default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ApprovalLs);
    await approvalList({
      pending: flags.pending ?? false,
      all: flags.all ?? false,
      expired: flags.expired ?? false,
      json: flags.json ?? false,
    });
  }
}

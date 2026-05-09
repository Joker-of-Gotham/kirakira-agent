import { Args, Command, Flags } from "@oclif/core";

import { lookupEventsForDecision } from "../../lib/ledger-utils.js";

export interface PolicyWhyOptions {
  decisionId: string;
  json?: boolean;
}

/** Summarize authoritative audit rows keyed by {@code decisionId}. */
export async function policyWhy(options: PolicyWhyOptions): Promise<void> {
  const events = await lookupEventsForDecision(options.decisionId);

  if (events.length === 0) {
    console.error(`No audit rows reference decision_id=${options.decisionId}`);
    return;
  }

  const rules = new Set<string>();
  const explanations: string[] = [];

  for (const ev of events) {
    for (const code of ev.result.reason_codes ?? []) rules.add(code);
    if (ev.result.error_message) explanations.push(ev.result.error_message);
  }

  const payload = {
    decision_id: options.decisionId,
    events: events.map((e) => ({
      event_id: e.event_id,
      ts: e.ts,
      kind: e.kind,
      effect: e.result.effect,
      reason_codes: e.result.reason_codes ?? [],
      approval_required: e.result.approval_required,
      approval_status: e.result.approval_status,
      sandbox_profile: e.result.sandbox_profile,
      subject: e.subject,
    })),
    matched_rules: [...rules],
    notes: explanations,
  };

  if (options.json ?? false) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`Decision ${options.decisionId} → ${events.length} audit row(s)`);
  console.log(`Matched reason codes: ${[...rules].join(", ") || "<none>"}`);
  for (const ev of events) {
    console.log(`- ${ev.ts} ${ev.kind} (${ev.event_id}) effect=${ev.result.effect ?? "n/a"}`);
  }
}

export default class PolicyWhyCmd extends Command {
  static override description =
    "Show matched rules / rationales assembled from authoritative audit ledger rows";

  static override flags = {
    json: Flags.boolean({ description: "Emit JSON payload", default: false }),
  };

  static override args = {
    decisionId: Args.string({ description: "PDP decision_id", required: true }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(PolicyWhyCmd);
    await policyWhy({ decisionId: args.decisionId, json: flags.json ?? false });
  }
}

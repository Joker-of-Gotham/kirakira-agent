import { Command, Flags } from "@oclif/core";

import { policyStatus } from "../../lib/policy-status.js";

export default class PolicyStatusCmd extends Command {
  static override description = "Print PDP, bundle, and approvals snapshot";

  static override flags = {
    json: Flags.boolean({
      description: "Emit JSON instead of human-readable lines",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(PolicyStatusCmd);
    await policyStatus({ json: flags.json });
  }
}

import { Command, Flags } from "@oclif/core";

import { policyTest } from "../../lib/policy-test.js";

export default class PolicyTestCmd extends Command {
  static override description = "Run `opa test` inside the bundled Rego policy directory";

  static override flags = {
    dir: Flags.string({
      char: "d",
      description: "Directory containing *_test.rego (defaults to ./policy)",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(PolicyTestCmd);
    await policyTest({ bundleDir: flags.dir });
  }
}

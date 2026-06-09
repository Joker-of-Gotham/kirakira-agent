import { Args, Command, Flags } from "@oclif/core";

import { buildRuntimeReadyScriptInvocation } from "../../runtime/runtime-ready-command.js";
import { runRuntimeScriptInvocation } from "../../runtime/runtime-script-command.js";

export default class RuntimeReady extends Command {
  static override description = "Render runtime readiness plan without live probes";

  static override args = {
    profile: Args.string({
      description: "Runtime profile name",
      required: false,
    }),
  };

  static override flags = {
    json: Flags.boolean({
      description: "Print JSON report",
      default: false,
    }),
    "no-probe": Flags.boolean({
      description: "Accepted for parity; runtime ready is always plan-only",
      default: false,
    }),
    "plan-only": Flags.boolean({
      description: "Accepted for parity; runtime ready is always plan-only",
      default: false,
    }),
    profile: Flags.string({
      description: "Runtime profile name",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(RuntimeReady);
    const invocation = buildRuntimeReadyScriptInvocation({
      profile: flags.profile ?? args.profile,
      json: flags.json,
      noProbe: flags["no-probe"],
      planOnly: flags["plan-only"],
    });
    const code = await runRuntimeScriptInvocation(invocation);
    if (code !== 0) {
      this.exit(code);
    }
  }
}

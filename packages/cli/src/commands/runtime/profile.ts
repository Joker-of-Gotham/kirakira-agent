import { Args, Command, Flags } from "@oclif/core";
import {
  buildRuntimeProfileScriptInvocation,
} from "../../runtime/runtime-profile-command.js";
import { runRuntimeScriptInvocation } from "../../runtime/runtime-script-command.js";

export default class RuntimeProfile extends Command {
  static override description = "Inspect runtime profile configuration";

  static override args = {
    action: Args.string({
      description: "Profile view to render",
      required: false,
    }),
    profile: Args.string({
      description: "Runtime profile name",
      required: false,
    }),
  };

  static override flags = {
    profile: Flags.string({
      description: "Runtime profile name",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(RuntimeProfile);
    const invocation = buildRuntimeProfileScriptInvocation({
      action: args.action,
      profile: flags.profile ?? args.profile,
    });
    const code = await runRuntimeScriptInvocation(invocation);
    if (code !== 0) {
      this.exit(code);
    }
  }
}

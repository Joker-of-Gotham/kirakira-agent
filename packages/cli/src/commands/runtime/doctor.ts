import { Args, Command, Flags } from "@oclif/core";
import { buildRuntimeDoctorScriptInvocation } from "../../runtime/runtime-doctor-command.js";
import { runRuntimeScriptInvocation } from "../../runtime/runtime-script-command.js";

export default class RuntimeDoctor extends Command {
  static override description = "Probe runtime profile readiness";

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
      description: "Render checks without live network/socket probes",
      default: false,
    }),
    "plan-only": Flags.boolean({
      description: "Alias for --no-probe",
      default: false,
    }),
    profile: Flags.string({
      description: "Runtime profile name",
    }),
    "timeout-ms": Flags.integer({
      description: "Per-check timeout in milliseconds",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(RuntimeDoctor);
    const invocation = buildRuntimeDoctorScriptInvocation({
      profile: flags.profile ?? args.profile,
      json: flags.json,
      noProbe: flags["no-probe"],
      planOnly: flags["plan-only"],
      timeoutMs: flags["timeout-ms"],
    });
    const code = await runRuntimeScriptInvocation(invocation);
    if (code !== 0) {
      this.exit(code);
    }
  }
}

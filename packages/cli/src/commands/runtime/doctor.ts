import { Args, Command, Flags } from "@oclif/core";
import { spawn } from "node:child_process";
import { buildRuntimeDoctorScriptInvocation } from "../../runtime/runtime-doctor-command.js";

function exitCodeForSignal(signal: NodeJS.Signals | null): number {
  if (signal === "SIGINT") return 130;
  if (signal === "SIGTERM") return 143;
  return signal ? 1 : 0;
}

function runChild(command: string, args: string[], cwd: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env },
      stdio: "inherit",
      shell: false,
      windowsHide: false,
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (typeof code === "number") {
        resolve(code);
        return;
      }
      resolve(exitCodeForSignal(signal));
    });
  });
}

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
    const code = await runChild(invocation.command, invocation.args, invocation.cwd);
    if (code !== 0) {
      this.exit(code);
    }
  }
}

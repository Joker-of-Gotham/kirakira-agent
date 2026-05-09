import { Command, Flags } from "@oclif/core";
import { execa } from "execa";

export interface SandboxDoctorOptions {
  json?: boolean;
}

export async function sandboxDoctor(options: SandboxDoctorOptions = {}): Promise<void> {
  const probes = ["nsjail", "sandbox-exec", "runsc", "gvisor-runner"];

  const hits: Record<string, string> = {};
  await Promise.all(
    probes.map(async (bin) => {
      const which = await execa("which", [bin], { reject: false });
      hits[bin] =
        which.exitCode === 0 && which.stdout.trim().length > 0 ? `found:${which.stdout.trim()}` : "missing";
    }),
  );

  if (options.json ?? false) console.log(JSON.stringify(hits, null, 2));
  else console.log(JSON.stringify(hits, null, 2));
}

export default class SandboxDoctorCmd extends Command {
  static override description = "Probe commonly used Linux/macOS sandbox runtimes";


  static override flags = { json: Flags.boolean({ default: false }) };

  async run(): Promise<void> {
    const { flags } = await this.parse(SandboxDoctorCmd);
    await sandboxDoctor({ json: flags.json ?? false });
  }
}

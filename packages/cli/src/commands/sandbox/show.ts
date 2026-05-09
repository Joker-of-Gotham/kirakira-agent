import { Args, Command, Flags } from "@oclif/core";
import type { SandboxProfile } from "@kirakira/core";
import { ProfileRegistry } from "@kirakira/policy-engine";

export interface SandboxShowOptions {
  name: string;
  json?: boolean;
}

function mkRegistry(): ProfileRegistry {
  const reg = new ProfileRegistry();
  reg.registerBuiltinProfiles();
  return reg;
}

export async function sandboxProfileShow(options: SandboxShowOptions): Promise<SandboxProfile | undefined> {
  const profile = mkRegistry().get(options.name);
  if (!profile) throw new Error(`Unknown sandbox profile: ${options.name}`);

  if (options.json ?? false) console.log(JSON.stringify(profile, null, 2));
  else console.log(JSON.stringify(profile, null, 2));

  return profile;
}

export default class SandboxShowCmd extends Command {
  static override description = "Render a YAML-friendly JSON view of one sandbox profile";

  static override args = { name: Args.string({ description: "Profile name", required: true }) };

  static override flags = { json: Flags.boolean({ default: true }) };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SandboxShowCmd);
    await sandboxProfileShow({ name: args.name, json: flags.json ?? true });
  }
}

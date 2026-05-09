import { Command, Flags } from "@oclif/core";
import { ProfileRegistry } from "@kirakira/policy-engine";

export interface SandboxLsOptions {
  json?: boolean;
}

function mkRegistry(): ProfileRegistry {
  const reg = new ProfileRegistry();
  reg.registerBuiltinProfiles();
  return reg;
}

export async function sandboxProfilesList(options: SandboxLsOptions = {}): Promise<void> {
  const rows = mkRegistry().list();
  if (options.json ?? false) console.log(JSON.stringify(rows, null, 2));
  else for (const p of rows) console.log(`${p.name}\tplatforms=${p.platforms.join(",")}`);
}

export default class SandboxLsCmd extends Command {
  static override description = "List built-in sandbox isolation profiles bundled with agent";

  static override flags = { json: Flags.boolean({ default: false }) };

  async run(): Promise<void> {
    const { flags } = await this.parse(SandboxLsCmd);
    await sandboxProfilesList({ json: flags.json ?? false });
  }
}

import { Args, Command, Flags } from "@oclif/core";
import { ProfileRegistry } from "@kirakira/policy-engine";

export interface SandboxDiffOptions {
  left: string;
  right: string;
  json?: boolean;
}

function mkRegistry(): ProfileRegistry {
  const reg = new ProfileRegistry();
  reg.registerBuiltinProfiles();
  return reg;
}

function unifiedDiff(left: unknown, right: unknown): string[] {
  const a = JSON.stringify(left, null, 2).split("\n");
  const b = JSON.stringify(right, null, 2).split("\n");

  if (JSON.stringify(left) === JSON.stringify(right))
    return ["Profiles normalized identically"];

  const out: string[] = [];
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    const la = a[i];
    const lb = b[i];
    if (la !== lb) out.push(`@@ line ${i + 1}`, `- ${la ?? "<eof>"}`, `+ ${lb ?? "<eof>"}`);
  }
  return out;
}

export async function sandboxProfileDiff(options: SandboxDiffOptions): Promise<void> {
  const registry = mkRegistry();
  const a = registry.get(options.left);
  const b = registry.get(options.right);

  if (!a) throw new Error(`Unknown profile (left): ${options.left}`);
  if (!b) throw new Error(`Unknown profile (right): ${options.right}`);

  const diff = unifiedDiff(a, b);
  if (options.json ?? false) console.log(JSON.stringify({ diff }, null, 2));
  else console.log(diff.join("\n"));
}

export default class SandboxDiffCmd extends Command {
  static override description = "Line-oriented diff between two registered sandbox profiles";

  static override args = {
    left: Args.string({ description: "Baseline profile name", required: true }),
    right: Args.string({ description: "Comparison profile name", required: true }),
  };

  static override flags = {
    json: Flags.boolean({
      description: "Emit {\"diff\":[...]} instead of plaintext",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SandboxDiffCmd);
    await sandboxProfileDiff({ left: args.left, right: args.right, json: flags.json ?? false });
  }
}

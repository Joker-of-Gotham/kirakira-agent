import { Command, Args } from "@oclif/core";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { getWorkspacePrivatePath } from "@kirakira/core";

function setDeep(
  obj: Record<string, unknown>,
  parts: string[],
  value: unknown,
): void {
  if (parts.length === 1) {
    obj[parts[0]!] = value;
    return;
  }
  const head = parts[0]!;
  const rest = parts.slice(1);
  const cur = obj[head];
  if (typeof cur !== "object" || cur === null || Array.isArray(cur)) {
    obj[head] = {};
  }
  setDeep(obj[head] as Record<string, unknown>, rest, value);
}

function coerceValue(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+$/.test(raw)) return Number.parseInt(raw, 10);
  if (/^-?\d+\.\d+$/.test(raw)) return Number.parseFloat(raw);
  return raw;
}

export default class ConfigSet extends Command {
  static override description =
    "Set a workspace-private override in .kirakira/local.toml (dot-notation keys)";

  static override args = {
    key: Args.string({ description: "Config key (dot-notation)", required: true }),
    value: Args.string({ description: "Value to set", required: true }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(ConfigSet);
    const path = getWorkspacePrivatePath(process.cwd());
    const dir = dirname(path);
    mkdirSync(dir, { recursive: true });

    let data: Record<string, unknown> = {};
    if (existsSync(path)) {
      const raw = readFileSync(path, "utf-8");
      data = parseToml(raw) as Record<string, unknown>;
    }

    const parts = args.key.split(".").filter(Boolean);
    if (parts.length === 0) {
      this.error("Invalid key");
    }
    setDeep(data, parts, coerceValue(args.value));

    writeFileSync(path, stringifyToml(data as Record<string, unknown>), "utf-8");
    this.log(`Updated ${path}: ${args.key} = ${args.value}`);
  }
}

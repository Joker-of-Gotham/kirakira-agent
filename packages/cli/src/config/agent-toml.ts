import { readFile } from "node:fs/promises";
import { parse as parseToml } from "smol-toml";
import { agentTomlSchema, envExpand, ConfigError } from "@kirakira/core";
import type { AgentToml } from "@kirakira/core";

export async function parseAgentToml(filePath: string): Promise<AgentToml> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (err) {
    throw new ConfigError(`Cannot read ${filePath}: ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = parseToml(raw);
  } catch (err) {
    throw new ConfigError(
      `Invalid TOML in ${filePath}: ${(err as Error).message}`,
    );
  }

  const expanded = envExpand(parsed);
  const result = agentTomlSchema.safeParse(expanded);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new ConfigError(`agent.toml validation failed: ${issues}`);
  }

  return result.data;
}

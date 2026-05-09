import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { policyYamlSchema, envExpand, ConfigError } from "@kirakira/core";
import type { PolicyYaml } from "@kirakira/core";

export async function parsePolicyYaml(filePath: string): Promise<PolicyYaml> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (err) {
    throw new ConfigError(`Cannot read ${filePath}: ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new ConfigError(
      `Invalid YAML in ${filePath}: ${(err as Error).message}`,
    );
  }

  const expanded = envExpand(parsed);
  const result = policyYamlSchema.safeParse(expanded);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new ConfigError(`policy.yaml validation failed: ${issues}`);
  }

  return result.data;
}

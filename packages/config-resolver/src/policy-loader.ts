/**
 * Load and validate policy.yaml.
 *
 * Policy is treated as a "human review file" — YAML for readability,
 * separate from agent.toml to keep developer prefs and governance apart.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { policyYamlSchema, ConfigError, PATHS } from "@kirakira/core";
import type { PolicyYaml } from "./types.js";

export function loadPolicyYaml(workspaceRoot: string): PolicyYaml | undefined {
  const policyPath = join(workspaceRoot, PATHS.workspacePolicy);
  if (!existsSync(policyPath)) return undefined;

  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(policyPath, "utf-8"));
  } catch (e) {
    throw new ConfigError(
      `Failed to parse policy.yaml: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const result = policyYamlSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new ConfigError(`Invalid policy.yaml: ${issues.join("; ")}`);
  }

  return result.data as PolicyYaml;
}

/**
 * Match a shell command against policy allowlist/denylist.
 *
 * Pattern format: `prefix:*` where `*` is a glob suffix.
 * Returns "allow" | "deny" | "ask" based on first match.
 */
export function matchShellPolicy(
  command: string,
  policy: PolicyYaml | undefined,
): "allow" | "deny" | "ask" {
  if (!policy?.shell) return "ask";

  const cmd = command.trim();

  if (policy.shell.denylist) {
    for (const pattern of policy.shell.denylist) {
      if (matchPattern(cmd, pattern)) return "deny";
    }
  }

  if (policy.shell.allowlist) {
    for (const pattern of policy.shell.allowlist) {
      if (matchPattern(cmd, pattern)) return "allow";
    }
  }

  return policy.shell.hostExecution ?? "ask";
}

export function matchMcpServerPolicy(
  serverName: string,
  policy: PolicyYaml | undefined,
): "allow" | "deny" | "ask" {
  if (!policy?.mcp) return "ask";

  if (policy.mcp.deniedServers?.includes(serverName)) return "deny";
  if (policy.mcp.approvedServers?.includes(serverName)) return "allow";

  return "ask";
}

function matchPattern(input: string, pattern: string): boolean {
  if (pattern === "*") return true;

  if (pattern.endsWith(":*")) {
    const prefix = pattern.slice(0, -2);
    return input.startsWith(prefix);
  }

  if (pattern.includes("*")) {
    const regex = new RegExp(
      "^" + pattern.replace(/[.*+?^${}()|[\]\\]/g, (m) => (m === "*" ? ".*" : "\\" + m)) + "$",
    );
    return regex.test(input);
  }

  return input === pattern;
}

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { Args, Command, Flags } from "@oclif/core";
import { parse as parseYaml } from "yaml";

export interface SiemTestRuleOptions {
  rule: string;
  configDir?: string;
  auditDir?: string;
}

interface DetectionRule {
  name?: string;
  description?: string;
  kql_query?: string;
  splunk_spl?: string;
  sigma_query?: string;
  severity?: string;
  fields_of_interest?: string[];
}

function loadAuditEvents(auditDir: string): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  if (!existsSync(auditDir)) return events;

  const files = readdirSync(auditDir)
    .filter((f) => f.endsWith(".jsonl"))
    .sort();

  for (const file of files) {
    const content = readFileSync(join(auditDir, file), "utf-8");
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line) as Record<string, unknown>);
      } catch {
        /* skip malformed lines */
      }
    }
  }
  return events;
}

function matchesKqlPattern(event: Record<string, unknown>, kql: string): boolean {
  // Parse simple KQL-style field:value patterns
  const conditions = kql.split(" and ").map((c) => c.trim());

  for (const cond of conditions) {
    const negated = cond.startsWith("not ");
    const expr = negated ? cond.slice(4).trim() : cond;

    const colonIdx = expr.indexOf(":");
    if (colonIdx < 0) continue;

    const field = expr.slice(0, colonIdx).replace(/"/g, "").trim();
    const pattern = expr.slice(colonIdx + 1).replace(/"/g, "").trim();

    const value = getNestedField(event, field);
    const valueStr = value !== undefined ? String(value) : "";

    let matches: boolean;
    if (pattern === "*") {
      matches = value !== undefined && value !== null && value !== "";
    } else if (pattern.startsWith("*") && pattern.endsWith("*")) {
      matches = valueStr.includes(pattern.slice(1, -1));
    } else if (pattern.startsWith("*")) {
      matches = valueStr.endsWith(pattern.slice(1));
    } else if (pattern.endsWith("*")) {
      matches = valueStr.startsWith(pattern.slice(0, -1));
    } else {
      matches = valueStr === pattern;
    }

    if (negated ? matches : !matches) return false;
  }
  return true;
}

function getNestedField(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export async function siemTestRule(options: SiemTestRuleOptions): Promise<void> {
  const configDir =
    options.configDir ?? join(process.cwd(), "configs", "siem", "detection-rules");
  const auditDir =
    options.auditDir ?? join(process.env.HOME || "~", ".kirakira", "audit", "ledger");

  if (!existsSync(configDir)) {
    console.error(`Detection rules directory not found: ${configDir}`);
    process.exit(1);
  }

  const ruleFiles = readdirSync(configDir).filter(
    (f) => f.endsWith(".yaml") || f.endsWith(".yml"),
  );

  const matchingFile = ruleFiles.find((f) => f.includes(options.rule));
  if (!matchingFile) {
    console.error(`No rule matching '${options.rule}' found.`);
    console.log("Available rules:");
    ruleFiles.forEach((f) =>
      console.log(`  ${f.replace(/^\d+-/, "").replace(/\.ya?ml$/, "")}`),
    );
    process.exit(1);
  }

  const content = readFileSync(join(configDir, matchingFile), "utf-8");
  let rule: DetectionRule = {};
  try {
    rule = parseYaml(content) as DetectionRule;
  } catch {
    console.log(`Rule file: ${matchingFile}`);
    console.log(content);
    return;
  }

  console.log(`Rule: ${rule.name || matchingFile}`);
  console.log(`Severity: ${rule.severity || "unknown"}`);
  console.log(`Description: ${rule.description || "—"}`);
  console.log();

  // Load audit events and test the rule
  const events = loadAuditEvents(auditDir);
  console.log(`Loaded ${events.length} audit events from ${auditDir}`);
  console.log();

  if (events.length === 0) {
    console.log("No audit events to test against.");
    console.log("Generate audit data by running kirakira-agent commands, then re-test.");
    return;
  }

  // Test KQL query if available
  const kql = rule.kql_query;
  if (kql) {
    console.log(`Testing KQL pattern: ${kql}`);
    const hits = events.filter((e) => matchesKqlPattern(e, kql));
    console.log(`  Matches: ${hits.length} / ${events.length} events`);

    if (hits.length > 0) {
      console.log("  First match:");
      const first = hits[0]!;
      const fields =
        rule.fields_of_interest || ["kind", "result.effect", "actor.user_id", "ts"];
      for (const field of fields) {
        const val = getNestedField(first, field);
        if (val !== undefined) {
          console.log(`    ${field}: ${JSON.stringify(val)}`);
        }
      }
    }
    console.log();
  }

  // Show raw rule YAML for reference
  console.log("--- Rule Definition ---");
  console.log(content);
}

export default class SiemTestRuleCmd extends Command {
  static override description = "Test a SIEM detection rule against local audit ledger data";

  static override args = {
    rule: Args.string({
      description: "Rule name substring to match",
      required: true,
    }),
  };

  static override flags = {
    "config-dir": Flags.string({
      description: "Override detection-rules directory",
    }),
    "audit-dir": Flags.string({
      description: "Override audit ledger directory",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SiemTestRuleCmd);
    await siemTestRule({
      rule: args.rule,
      ...(flags["config-dir"] ? { configDir: flags["config-dir"] } : {}),
      ...(flags["audit-dir"] ? { auditDir: flags["audit-dir"] } : {}),
    });
  }
}

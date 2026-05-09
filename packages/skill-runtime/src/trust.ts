import type { SkillTrustLevel } from "@kirakira/core";

/** Shape of validated skill YAML/MD frontmatter (mirrors `@kirakira/core` schema). */
export type SkillFrontmatterParsed = {
  name: string;
  description: string;
  version?: string;
  compatibility?: string;
  owner?: string;
  "allowed-tools"?: string | string[];
  activation?: string[];
  risk_level?: string;
  requires_approval_for?: string[];
  metadata?: Record<string, unknown>;
};

const networkHint =
  /\b(fetch|axios|http\.get|WebSocket|curl |wget |CONNECT )\b/i;

/**
 * Three-tier skill security classification (aligned with kirakira-agent-registry.md §Skills):
 *
 * - instruction-only: pure prompt skill, no scripts, no tool claims
 * - scripts: has scripts/ dir or allowed-tools, needs user review
 * - external-deps: has external network access, dependencies, or write ops, needs policy approval
 */
export type SkillSecurityTier = "instruction-only" | "scripts" | "external-deps";

export interface TrustEvaluation {
  level: SkillTrustLevel;
  securityTier: SkillSecurityTier;
  needsTrustPrompt: boolean;
  reasons: string[];
}

function mentionsEnvInterpolation(body: string): boolean {
  return /\$\{[A-Z_][A-Z0-9_]*\}/.test(body) || /\$[A-Z_][A-Z0-9_]*/.test(body);
}

function mentionsExternalDeps(body: string): boolean {
  return (
    /\b(pip install|npm install|require\(|import )\b/i.test(body) ||
    /\b(write|writeFile|mkdir|rm |chmod |chown )\b/i.test(body)
  );
}

export function classifySecurityTier(
  frontmatter: SkillFrontmatterParsed,
  ctx: { hasScriptsDir: boolean; bodySample: string },
): SkillSecurityTier {
  if (frontmatter.requires_approval_for?.length) {
    return "external-deps";
  }

  if (
    ctx.bodySample &&
    (networkHint.test(ctx.bodySample) ||
      mentionsEnvInterpolation(ctx.bodySample) ||
      mentionsExternalDeps(ctx.bodySample))
  ) {
    return "external-deps";
  }

  if (ctx.hasScriptsDir || frontmatter["allowed-tools"]) {
    return "scripts";
  }

  return "instruction-only";
}

/** Trust for index / discovery (frontmatter + body snippet for security signal analysis). */
export function inferTrustForPath(
  path: string,
  frontmatter: SkillFrontmatterParsed,
  opts: { hasScriptsDir: boolean; bodySample?: string },
): SkillTrustLevel {
  const { level } = evaluateSkillTrust(path, frontmatter, {
    hasScriptsDir: opts.hasScriptsDir,
    bodySample: opts.bodySample ?? "",
  });
  return level;
}

export function evaluateSkillTrust(
  skillPath: string,
  frontmatter: SkillFrontmatterParsed,
  ctx: { hasScriptsDir: boolean; bodySample: string },
): TrustEvaluation {
  const reasons: string[] = [];
  let level: SkillTrustLevel = "untrusted";
  let needsTrustPrompt = false;

  const normalized = skillPath.replace(/\\/g, "/");
  const tier = classifySecurityTier(frontmatter, ctx);

  if (normalized.startsWith("/etc/kirakira/")) {
    level = "enterprise-allow";
    reasons.push("system skill path under /etc/kirakira");
  } else if (tier === "external-deps") {
    needsTrustPrompt = true;
    level = "ask";
    reasons.push("skill requires external dependencies or write operations — policy approval needed");
    if (ctx.bodySample && networkHint.test(ctx.bodySample)) reasons.push("possible network access in body");
    if (ctx.bodySample && mentionsEnvInterpolation(ctx.bodySample)) reasons.push("environment variable interpolation in body");
    if (ctx.bodySample && mentionsExternalDeps(ctx.bodySample)) reasons.push("external dependency or write operations in body");
    if (frontmatter.requires_approval_for?.length) reasons.push("requires_approval_for set");
  } else if (tier === "scripts") {
    needsTrustPrompt = true;
    level = "ask";
    if (ctx.hasScriptsDir) reasons.push("scripts/ directory present — user review needed");
    if (frontmatter["allowed-tools"]) reasons.push("allowed-tools declared — user review needed");
  } else {
    if (normalized.includes(".kirakira/skills") || normalized.includes(".claude/skills") || normalized.includes(".agents/skills")) {
      level = "user-approved";
      reasons.push("instruction-only skill in recognized skill directory");
    } else {
      reasons.push("instruction-only skill — discover allowed, first activation shows source");
    }
  }

  return { level, securityTier: tier, needsTrustPrompt, reasons };
}

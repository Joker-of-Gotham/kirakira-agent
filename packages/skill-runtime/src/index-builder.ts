import matter from "gray-matter";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  skillFrontmatterSchema,
  type SkillMeta,
  type SkillSourceType,
  type SkillTrustLevel,
} from "@kirakira/core";

import type { DiscoveryEntry } from "./discovery.js";
import { inferTrustForPath } from "./trust.js";

type FrontmatterData = Record<string, unknown>;

function inferSource(path: string, tier: number): SkillSourceType {
  const normalized = path.replace(/\\/g, "/");
  if (tier >= 5) return "local";
  if (tier === 4) return "local";
  if (normalized.includes("/.claude/")) return "imported-claude";
  if (normalized.includes("/.agents/")) return "imported-codex";
  if (normalized.includes("/.cursor/")) return "imported-cursor";
  if (normalized.includes("/.kirakira/skills/")) return "local";
  return "local";
}

function readFrontmatterMeta(
  path: string,
  tier: number,
): Omit<SkillMeta, "tags" | "trust" | "source" | "namespace"> & {
  trust: SkillTrustLevel;
  source: SkillSourceType;
  tags: string[];
  namespace?: string;
} {
  const raw = readFileSync(path, "utf8");
  const gm = matter(raw);
  const parsed = skillFrontmatterSchema.safeParse(gm.data as FrontmatterData);
  if (!parsed.success) {
    throw new Error(
      `Invalid skill frontmatter at ${path}: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    );
  }
  const d = parsed.data;
  const activation = d.activation ?? [];
  const tags = [...activation];
  const source = inferSource(path, tier);
  const hasScriptsDir = existsSync(join(dirname(path), "scripts"));
  const bodySample = gm.content.slice(0, 512);
  const trust = inferTrustForPath(path, d, { hasScriptsDir, bodySample });

  return {
    name: d.name,
    description: d.description,
    path,
    tags,
    trust,
    source,
    version: d.version,
    activation: activation.length > 0 ? activation : undefined,
  };
}

/** Build `SkillMeta[]` from discovery entries (frontmatter only; no body parsing). */
export function buildSkillIndex(
  entries: readonly DiscoveryEntry[],
): SkillMeta[] {
  return entries.map((e) => readFrontmatterMeta(e.path, e.tier));
}

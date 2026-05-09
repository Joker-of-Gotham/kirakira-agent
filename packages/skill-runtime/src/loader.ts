import matter from "gray-matter";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  skillFrontmatterSchema,
  type SkillContent,
  type SkillFrontmatter,
} from "@kirakira/core";

function extractScriptsAndReferences(
  body: string,
  _skillDir: string,
): { scripts: string[]; references: string[] } {
  const scripts = new Set<string>();
  const references = new Set<string>();
  const linkRe = /\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(body)) !== null) {
    const raw = m[1]?.split("#")[0]?.split("?")[0] ?? "";
    if (!raw) continue;
    if (/^https?:\/\//i.test(raw)) {
      references.add(raw);
      continue;
    }
    if (
      raw.includes("scripts/") ||
      /\.(sh|bash|zsh|py|mjs|cjs|js|ts|rb|pl)$/i.test(raw)
    ) {
      scripts.add(raw);
    } else {
      references.add(raw);
    }
  }
  return { scripts: [...scripts], references: [...references] };
}

type FrontmatterData = Record<string, unknown>;

function toSkillFrontmatter(raw: FrontmatterData): SkillFrontmatter {
  const parsed = skillFrontmatterSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((e) => e.message).join("; ");
    throw new Error(`Invalid skill frontmatter: ${msg}`);
  }
  const d = parsed.data;
  const allowedRaw = d["allowed-tools"];
  let allowedTools: string[] | undefined;
  if (typeof allowedRaw === "string") {
    allowedTools = [allowedRaw];
  } else if (Array.isArray(allowedRaw)) {
    allowedTools = allowedRaw.filter((x): x is string => typeof x === "string");
  }
  return {
    name: d.name,
    description: d.description,
    version: d.version,
    compatibility: d.compatibility,
    owner: d.owner,
    ...(allowedTools !== undefined ? { allowedTools } : {}),
    activation: d.activation,
    riskLevel: d.risk_level,
    requiresApprovalFor: d.requires_approval_for,
    metadata: d.metadata,
  };
}

/**
 * Parse SKILL.md frontmatter with `@kirakira/core` validation.
 * Body and ref lists are built only when `materialize()` runs (lazy).
 */
export interface SkillLoaderResult {
  readonly path: string;
  readonly frontmatter: SkillFrontmatter;
  materialize(): SkillContent;
}

export function loadSkill(path: string): SkillLoaderResult {
  const raw = readFileSync(path, "utf8");
  const gm = matter(raw);
  const frontmatter = toSkillFrontmatter(gm.data as FrontmatterData);
  const skillDir = dirname(path);

  return {
    path,
    frontmatter,
    materialize(): SkillContent {
      const { scripts, references } = extractScriptsAndReferences(
        gm.content,
        skillDir,
      );
      return {
        frontmatter,
        body: gm.content,
        scripts,
        references,
      };
    },
  };
}

/** Eager helper: full `SkillContent` in one call. */
export function loadSkillContent(path: string): SkillContent {
  return loadSkill(path).materialize();
}

import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

import type { SkillContent, ValidationIssue, ValidationResult } from "@kirakira/core";

export function validateSkill(
  content: SkillContent,
  skillPath: string,
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!content.frontmatter.name?.trim()) {
    errors.push({
      field: "name",
      message: "Skill name is required",
      severity: "error",
    });
  }
  if (!content.frontmatter.description?.trim()) {
    errors.push({
      field: "description",
      message: "Skill description is required",
      severity: "error",
    });
  }

  const dir = dirname(skillPath);

  for (const script of content.scripts) {
    const abs = resolve(dir, script);
    if (!existsSync(abs)) {
      errors.push({
        field: "scripts",
        message: `Missing script file: ${script}`,
        severity: "error",
      });
    }
  }

  for (const ref of content.references) {
    if (/^https?:\/\//i.test(ref)) continue;
    const abs = resolve(dir, ref);
    if (!existsSync(abs)) {
      warnings.push({
        field: "references",
        message: `Missing referenced path: ${ref}`,
        severity: "warning",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

import {
  mcpManifestSchema,
  skillManifestSchema,
  type McpManifest,
  type SkillManifest,
  type ValidationIssue,
  type ValidationResult,
} from "@kirakira/core";

export function validateManifests(
  skills: readonly SkillManifest[],
  mcp: readonly McpManifest[],
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  skills.forEach((manifest, i) => {
    const r = skillManifestSchema.safeParse(manifest);
    if (!r.success) {
      for (const issue of r.error.issues) {
        errors.push({
          field: `skills[${i}].${issue.path.join(".") || "root"}`,
          message: issue.message,
          severity: "error",
        });
      }
    }
  });

  mcp.forEach((manifest, i) => {
    const r = mcpManifestSchema.safeParse(manifest);
    if (!r.success) {
      for (const issue of r.error.issues) {
        errors.push({
          field: `mcp[${i}].${issue.path.join(".") || "root"}`,
          message: issue.message,
          severity: "error",
        });
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadSkillContent, validateSkill } from "@kirakira/skill-runtime";
import { getRepoRoot } from "../../helpers/repo-root.js";

const root = getRepoRoot(import.meta.url);
const validSkill = path.join(
  root,
  "test/fixtures/skills/valid/timeline-extraction/SKILL.md",
);
const missingDesc = path.join(
  root,
  "test/fixtures/skills/invalid/missing-description/SKILL.md",
);

describe("validateSkill", () => {
  it("validates complete fixture skill", () => {
    const content = loadSkillContent(validSkill);
    const r = validateSkill(content, validSkill);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("flags missing description after manual parse would fail earlier", () => {
    const content = loadSkillContent(validSkill);
    const broken = {
      ...content,
      frontmatter: { ...content.frontmatter, description: "" },
    };
    const r = validateSkill(broken, validSkill);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.field === "description")).toBe(true);
  });

  it("invalid fixture cannot load — missing description fails loader", () => {
    expect(() => loadSkillContent(missingDesc)).toThrow();
  });
});

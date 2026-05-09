import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadSkill, loadSkillContent } from "@kirakira/skill-runtime";
import { getRepoRoot } from "../../helpers/repo-root.js";

const root = getRepoRoot(import.meta.url);
const validSkill = path.join(
  root,
  "test/fixtures/skills/valid/timeline-extraction/SKILL.md",
);
const missingName = path.join(
  root,
  "test/fixtures/skills/invalid/missing-name/SKILL.md",
);

describe("loadSkill", () => {
  it("loads valid SKILL.md with frontmatter", () => {
    const s = loadSkill(validSkill);
    expect(s.frontmatter.name).toBe("timeline-extraction");
    const body = s.materialize();
    expect(body.body).toContain("normalized event timeline");
    expect(body.references.some((r) => r.includes("schema.md"))).toBe(true);
  });

  it("throws on invalid frontmatter", () => {
    expect(() => loadSkill(missingName)).toThrow(/Invalid skill frontmatter/i);
  });
});

describe("loadSkillContent", () => {
  it("materializes eagerly", () => {
    const c = loadSkillContent(validSkill);
    expect(c.frontmatter.owner).toBe("fin-kg");
  });
});

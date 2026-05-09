import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadSkill } from "@kirakira/skill-runtime";
import { getRepoRoot } from "../../helpers/repo-root.js";

const root = getRepoRoot(import.meta.url);
const bad = path.join(
  root,
  "test/fixtures/skills/invalid/bad-frontmatter-type/SKILL.md",
);

describe("frontmatter injection / strict typing", () => {
  it("numeric name fails Zod validation in loader", () => {
    expect(() => loadSkill(bad)).toThrow(/Invalid skill frontmatter/i);
  });
});

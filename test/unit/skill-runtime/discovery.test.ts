import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverSkills } from "@kirakira/skill-runtime";
import { getRepoRoot } from "../../helpers/repo-root.js";

const root = getRepoRoot(import.meta.url);
const claudeWs = path.join(root, "test/fixtures/workspaces/claude-style");

describe("discoverSkills", () => {
  it("finds Claude-layout skills in fixture workspace", async () => {
    const skills = await discoverSkills(claudeWs);
    const names = skills.map((s) => s.name);
    expect(names).toContain("review-risk");
    expect(skills.find((s) => s.name === "review-risk")?.source).toBe("imported-claude");
  });
});

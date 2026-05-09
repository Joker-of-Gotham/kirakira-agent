import path from "node:path";
import { describe, expect, it } from "vitest";
import { isPathWithin } from "@kirakira/core";
import { getRepoRoot } from "../../helpers/repo-root.js";

const root = getRepoRoot(import.meta.url);
const skillRoot = path.join(
  root,
  "test/fixtures/skills/malicious/path-traversal",
);

describe("skill path traversal guard", () => {
  it("isPathWithin rejects etc passwd style escapes", () => {
    expect(isPathWithin(skillRoot, path.join(skillRoot, "../../../../../etc/passwd"))).toBe(
      false,
    );
    expect(isPathWithin(skillRoot, "/etc/passwd")).toBe(false);
    expect(isPathWithin(skillRoot, "SKILL.md")).toBe(true);
  });
});

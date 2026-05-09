import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectPlatforms } from "@kirakira/compat";
import { getRepoRoot } from "../../helpers/repo-root.js";

const root = getRepoRoot(import.meta.url);
const mixed = path.join(root, "test/fixtures/workspaces/mixed");

describe("detectPlatforms", () => {
  it("detects claude, cursor, and codex markers in mixed workspace", () => {
    const d = detectPlatforms(mixed);
    const names = d.map((x) => x.platform).sort();
    expect(names).toEqual(expect.arrayContaining(["claude", "cursor", "codex"]));
  });
});

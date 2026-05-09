import path from "node:path";
import { describe, expect, it } from "vitest";
import { readJsonFile, scanCursor } from "@kirakira/compat";
import { getRepoRoot } from "../../helpers/repo-root.js";

const root = getRepoRoot(import.meta.url);
const ws = path.join(root, "test/fixtures/workspaces/cursor-style");

describe("Cursor compat adapter", () => {
  it("discovers skills and MCP json paths", async () => {
    const scan = await scanCursor(ws);
    expect(scan.skillPaths.some((p) => p.includes("frontend/SKILL.md"))).toBe(
      true,
    );
    expect(scan.mcpJsonPaths.length).toBeGreaterThan(0);
    const t = readJsonFile(scan.mcpJsonPaths[0]!);
    expect(t).toContain("filesystem");
  });
});

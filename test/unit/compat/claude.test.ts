import path from "node:path";
import { describe, expect, it } from "vitest";
import { readMcpConfigFile, scanClaude } from "@kirakira/compat";
import { getRepoRoot } from "../../helpers/repo-root.js";

const root = getRepoRoot(import.meta.url);
const ws = path.join(root, "test/fixtures/workspaces/claude-style");

describe("Claude compat adapter", () => {
  it("discovers skills and MCP configs from fixture workspace", async () => {
    const scan = await scanClaude(ws);
    expect(scan.skillPaths.some((p) => p.endsWith("review/SKILL.md"))).toBe(true);
    expect(scan.mcpConfigPaths.some((p) => p.endsWith(".mcp.json"))).toBe(true);
    const raw = readMcpConfigFile(scan.mcpConfigPaths[0]!);
    expect(raw).toContain("mcpServers");
    expect(raw).toContain("github");
  });
});

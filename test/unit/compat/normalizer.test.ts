import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  normalizeImport,
  scanClaude,
  scanCodex,
  scanCursor,
} from "@kirakira/compat";
import { getRepoRoot } from "../../helpers/repo-root.js";

const root = getRepoRoot(import.meta.url);
const mixed = path.join(root, "test/fixtures/workspaces/mixed");

describe("normalizeImport", () => {
  it("unifies skills and MCP from mixed fixture", async () => {
    const claude = await scanClaude(mixed);
    const cursor = await scanCursor(mixed);
    const codex = await scanCodex(mixed);
    const { skills, mcp } = normalizeImport({ claude, cursor, codex });
    expect(skills.map((s) => s.name).sort()).toEqual(
      expect.arrayContaining(["analysis", "research"]),
    );
    expect(mcp.some((s) => s.name === "filesystem")).toBe(true);
  });
});

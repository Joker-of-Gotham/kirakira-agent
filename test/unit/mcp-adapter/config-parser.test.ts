import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseMcpConfigJson } from "@kirakira/mcp-adapter";
import { getRepoRoot } from "../../helpers/repo-root.js";

const root = getRepoRoot(import.meta.url);

describe("parseMcpConfigJson", () => {
  it("parses Claude-style .mcp.json fixture", () => {
    const p = path.join(root, "test/fixtures/mcp/claude-mcp.json");
    const servers = parseMcpConfigJson(readFileSync(p, "utf-8"));
    const names = servers.map((s) => s.name).sort();
    expect(names).toEqual(["github", "research"]);
    const http = servers.find((s) => s.name === "research");
    expect(http?.transport.kind).toBe("http");
  });

  it("parses Cursor fixture as stdio transport", () => {
    const p = path.join(root, "test/fixtures/mcp/cursor-mcp.json");
    const servers = parseMcpConfigJson(readFileSync(p, "utf-8"));
    expect(servers[0]?.transport.kind).toBe("stdio");
  });
});

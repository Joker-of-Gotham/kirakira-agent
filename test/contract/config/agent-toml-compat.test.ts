import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseAgentToml } from "../../../packages/cli/src/config/agent-toml.js";
import { getRepoRoot } from "../../helpers/repo-root.js";

const root = getRepoRoot(import.meta.url);
const fixture = path.join(root, "test/fixtures/configs/agent.toml");

describe("agent.toml fixture compatibility", () => {
  it("parses with all expected keys present", async () => {
    const cfg = await parseAgentToml(fixture);
    expect(cfg.schema_version).toBe(1);
    expect(cfg.workspace_name).toBe("test-workspace");
    expect(cfg.trust).toBe("trusted");
    expect(cfg.model?.default).toBeDefined();
    expect(cfg.model?.fallback).toBeDefined();
    expect(cfg.output?.default).toBe("human");
    expect(cfg.output?.exec_default).toBe("json");
    expect(cfg.approvals?.mode).toBe("ask");
    expect(cfg.skills?.discover).toEqual([".kirakira/skills"]);
    expect(cfg.compat?.read_claude).toBe(true);
    expect(cfg.compat?.read_cursor).toBe(true);
  });
});

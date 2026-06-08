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
    expect(cfg.orchestration?.handoff_mode).toBe("tool");
    expect(cfg.deep_research?.source_policy).toBe("hybrid");
    expect(cfg.runtime?.profiles?.[0]?.services?.[0]?.url_env).toBe("DATABASE_URL");
    expect(cfg.presentation?.desktop?.preload_contract).toBe("strict-ipc");
    expect(cfg.compat?.read_claude).toBe(true);
    expect(cfg.compat?.read_cursor).toBe(true);
  });
});

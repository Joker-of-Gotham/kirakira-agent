import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getRepoRoot } from "../../../helpers/repo-root.js";
import { parseAgentToml } from "../../../../packages/cli/src/config/agent-toml.js";
import { ConfigError } from "@kirakira/core";

const root = getRepoRoot(import.meta.url);
const agentFixture = path.join(root, "test/fixtures/configs/agent.toml");
const agentExpandFixture = path.join(root, "test/fixtures/configs/agent-expand.toml");

describe("parseAgentToml", () => {
  afterEach(() => {
    delete process.env.TEST_KIRAKIRA_MODEL;
  });

  it("parses workspace fixture", async () => {
    const cfg = await parseAgentToml(agentFixture);
    expect(cfg.schema_version).toBe(1);
    expect(cfg.workspace_name).toBe("test-workspace");
    expect(cfg.trust).toBe("trusted");
    expect(cfg.model?.default).toBe("test-model");
    expect(cfg.compat?.read_claude).toBe(true);
  });

  it("applies env expansion to model field", async () => {
    process.env.TEST_KIRAKIRA_MODEL = "from-env";
    const cfg = await parseAgentToml(agentExpandFixture);
    expect(cfg.model?.default).toBe("from-env");
  });

  it("uses default in expanded TOML when env unset", async () => {
    delete process.env.TEST_KIRAKIRA_MODEL;
    const cfg = await parseAgentToml(agentExpandFixture);
    expect(cfg.model?.default).toBe("fallback-model");
  });

  it("throws on invalid TOML", async () => {
    const badPath = path.join(os.tmpdir(), `kirakira-bad-toml-${Date.now()}.toml`);
    const { writeFile, rm } = await import("node:fs/promises");
    await writeFile(badPath, "[[[broken", "utf-8");
    try {
      await expect(parseAgentToml(badPath)).rejects.toThrow(ConfigError);
    } finally {
      await rm(badPath, { force: true });
    }
  });
});

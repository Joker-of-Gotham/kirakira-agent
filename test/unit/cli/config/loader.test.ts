import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getRepoRoot } from "../../../helpers/repo-root.js";
import { loadConfig } from "../../../../packages/cli/src/config/loader.js";

const root = getRepoRoot(import.meta.url);
const agentFixture = path.join(root, "test/fixtures/configs/agent.toml");
const policyFixture = path.join(root, "test/fixtures/configs/policy.yaml");

const isolatedLayers = {
  skipSystemLayer: true,
  skipUserLayer: true,
};

describe("loadConfig", () => {
  it("merges defaults when no files exist", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "kirakira-cfg-"));
    try {
      const c = await loadConfig({ workspaceRoot: dir, ...isolatedLayers });
      expect(c.agentToml.schema_version).toBe(1);
      expect(c.agentToml.workspace_name).toBe("");
      expect(c.policyYaml.schemaVersion).toBe(1);
      expect(c.configPaths.agentToml).toBeUndefined();
      expect(c.configPaths.policyYaml).toBeUndefined();
      expect(c.runtimeState?.default_profile).toBe("container");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("loads and merges workspace agent.toml and policy.yaml", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "kirakira-cfg-"));
    try {
      await writeFile(path.join(dir, "agent.toml"), await readFile(agentFixture), "utf-8");
      await writeFile(path.join(dir, "policy.yaml"), await readFile(policyFixture), "utf-8");
      const c = await loadConfig({ workspaceRoot: dir, ...isolatedLayers });
      expect(c.agentToml.workspace_name).toBe("test-workspace");
      expect(c.policyYaml.workspaceTrust).toBe("trusted");
      expect(c.configPaths.agentToml).toBe(path.join(dir, "agent.toml"));
      expect(c.configPaths.policyYaml).toBe(path.join(dir, "policy.yaml"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses explicit agent.toml path override", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "kirakira-cfg-"));
    try {
      const c = await loadConfig({ workspaceRoot: dir, configPath: agentFixture, ...isolatedLayers });
      expect(c.agentToml.workspace_name).toBe("test-workspace");
      expect(c.configPaths.agentToml).toBe(agentFixture);
      expect(c.configPaths.policyYaml).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails when an explicit agent.toml path does not exist", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "kirakira-cfg-"));
    try {
      await expect(loadConfig({
        workspaceRoot: dir,
        configPath: path.join(dir, "missing.toml"),
        ...isolatedLayers,
      })).rejects.toThrow("Config file not found");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

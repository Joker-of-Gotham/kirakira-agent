import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getRepoRoot } from "../../../helpers/repo-root.js";
import { parsePolicyYaml } from "../../../../packages/cli/src/config/policy-yaml.js";
import { ConfigError } from "@kirakira/core";

const root = getRepoRoot(import.meta.url);
const policyFixture = path.join(root, "test/fixtures/configs/policy.yaml");

describe("parsePolicyYaml", () => {
  it("parses fixture policy.yaml", async () => {
    const p = await parsePolicyYaml(policyFixture);
    expect(p.schemaVersion).toBe(1);
    expect(p.shell?.hostExecution).toBe("deny");
    expect(p.shell?.allowlist).toContain("git:*");
    expect(p.privacy?.redactEnv).toEqual(
      expect.arrayContaining(["OPENAI_API_KEY", "GITHUB_TOKEN"]),
    );
  });

  it("throws on schema validation failure", async () => {
    const { writeFile, rm } = await import("node:fs/promises");
    const bad = path.join(os.tmpdir(), `kirakira-bad-policy-${Date.now()}.yaml`);
    await writeFile(bad, "schemaVersion: not-a-number\n", "utf-8");
    try {
      await expect(parsePolicyYaml(bad)).rejects.toThrow(ConfigError);
    } finally {
      await rm(bad, { force: true });
    }
  });
});

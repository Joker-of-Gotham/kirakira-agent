import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parsePolicyYaml } from "../../../packages/cli/src/config/policy-yaml.js";
import { getRepoRoot } from "../../helpers/repo-root.js";

const root = getRepoRoot(import.meta.url);
const policyPath = path.join(root, "test/fixtures/configs/policy.yaml");

function redactUsingPolicy(
  text: string,
  redactEnv: readonly string[] | undefined,
): string {
  let out = text;
  for (const key of redactEnv ?? []) {
    const val = process.env[key];
    if (val) out = out.split(val).join(`<${key}_REDACTED>`);
  }
  return out;
}

describe("env leak / policy redaction list", () => {
  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.GITHUB_TOKEN;
  });

  it("policy declares secrets to redact; redaction strips live env values", async () => {
    process.env.OPENAI_API_KEY = "sk-test-secret";
    process.env.GITHUB_TOKEN = "ghp_super_secret";
    const p = await parsePolicyYaml(policyPath);
    const keys = p.privacy?.redactEnv ?? [];
    expect(keys).toContain("OPENAI_API_KEY");
    const blob = JSON.stringify({
      openai: process.env.OPENAI_API_KEY,
      gh: process.env.GITHUB_TOKEN,
    });
    const safe = redactUsingPolicy(blob, keys);
    expect(safe.includes("sk-test-secret")).toBe(false);
    expect(safe.includes("ghp_super_secret")).toBe(false);
    expect(safe.includes("<OPENAI_API_KEY_REDACTED>")).toBe(true);
    expect(safe.includes("<GITHUB_TOKEN_REDACTED>")).toBe(true);
  });
});

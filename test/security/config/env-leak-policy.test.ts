import { describe, expect, it } from "vitest";
import { policyYamlSchema } from "../../../packages/core/src/schemas/config.js";

describe("security: env leak prevention via policy", () => {
  it("policy.yaml redactEnv field accepts patterns", () => {
    const policy = {
      schemaVersion: 1,
      privacy: {
        redactEnv: [
          "OPENAI_API_KEY",
          "GITHUB_TOKEN",
          "AWS_SECRET_ACCESS_KEY",
          "LLM_API_KEY",
          "DATABASE_URL",
        ],
      },
    };
    const result = policyYamlSchema.safeParse(policy);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.privacy?.redactEnv).toHaveLength(5);
      expect(result.data.privacy?.redactEnv).toContain("OPENAI_API_KEY");
    }
  });

  it("policy.yaml disablePromptLogging can be set", () => {
    const policy = {
      schemaVersion: 1,
      privacy: {
        redactEnv: ["SECRET"],
        disablePromptLogging: true,
      },
    };
    const result = policyYamlSchema.safeParse(policy);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.privacy?.disablePromptLogging).toBe(true);
    }
  });

  it("budget limits can prevent excessive spending", () => {
    const policy = {
      schemaVersion: 1,
      budget: {
        max_cost_per_session_usd: 5.0,
        max_cost_per_day_usd: 50.0,
        alert_threshold_pct: 80,
      },
    };
    const result = policyYamlSchema.safeParse(policy);
    expect(result.success).toBe(true);
  });

  it("network policy restricts domains", () => {
    const policy = {
      schemaVersion: 1,
      network: {
        allowed_domains: ["api.openai.com", "api.anthropic.com"],
        denied_domains: ["evil.com", "*.malware.xyz"],
      },
    };
    const result = policyYamlSchema.safeParse(policy);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.network?.denied_domains).toContain("evil.com");
    }
  });
});

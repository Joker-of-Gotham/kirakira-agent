import { describe, expect, it } from "vitest";
import { agentTomlSchema, policyYamlSchema } from "../../../packages/core/src/schemas/config.js";

describe("resolved state schema stability", () => {
  it("agentTomlSchema accepts all required fields", () => {
    const full = {
      schema_version: 1,
      workspace_name: "test",
      trust: "ask",
      model: {
        default: "gpt-4o",
        fallback: "gpt-4o-mini",
        providers: [
          {
            name: "primary",
            type: "openai",
            base_url: "https://api.openai.com/v1",
            api_key_env: "OPENAI_API_KEY",
          },
        ],
        max_cost_per_session_usd: 10.0,
      },
      registry: {
        sources: [{ name: "default", url: "https://registry.kirakira.dev", type: "kirakira" }],
        default_source: "default",
        install_scope: "workspace",
      },
      features: {
        tool_search: true,
        lazy_schema_injection: true,
        progressive_skill_loading: false,
        cost_tracking: true,
      },
    };
    const result = agentTomlSchema.safeParse(full);
    expect(result.success).toBe(true);
  });

  it("agentTomlSchema is backward compatible with v1 format", () => {
    const v1 = {
      schema_version: 1,
      model: { default: "gpt-4o" },
      telemetry: { mode: "off" },
    };
    const result = agentTomlSchema.safeParse(v1);
    expect(result.success).toBe(true);
  });

  it("policyYamlSchema accepts budget and network fields", () => {
    const policy = {
      schemaVersion: 1,
      budget: {
        max_cost_per_session_usd: 5.0,
        max_cost_per_day_usd: 50.0,
        alert_threshold_pct: 90,
      },
      network: {
        allowed_domains: ["api.openai.com"],
        denied_domains: ["malicious.com"],
      },
    };
    const result = policyYamlSchema.safeParse(policy);
    expect(result.success).toBe(true);
  });

  it("policyYamlSchema is backward compatible", () => {
    const v1 = {
      schemaVersion: 1,
      shell: { hostExecution: "deny" },
      privacy: { redactEnv: ["SECRET"] },
    };
    const result = policyYamlSchema.safeParse(v1);
    expect(result.success).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { extractGatewayConfig } from "../../../packages/config-resolver/src/model-config.js";
import type { AgentToml } from "@kirakira/core";

describe("extractGatewayConfig", () => {
  it("uses provider declarations when available", () => {
    const toml: AgentToml = {
      schema_version: 1,
      model: {
        default: "gpt-4o",
        providers: [
          {
            name: "primary",
            type: "openai",
            base_url: "https://api.openai.com/v1",
            api_key_env: "OPENAI_API_KEY",
            default_model: "gpt-4o-2024-11-20",
            timeout: 60,
            max_retries: 2,
          },
        ],
      },
    };

    const cfg = extractGatewayConfig(toml);
    expect(cfg.provider).toBe("openai");
    expect(cfg.baseUrl).toBe("https://api.openai.com/v1");
    expect(cfg.model).toBe("gpt-4o-2024-11-20");
    expect(cfg.timeout).toBe(60);
    expect(cfg.maxRetries).toBe(2);
  });

  it("falls back to env-based defaults when no providers", () => {
    const toml: AgentToml = {
      schema_version: 1,
      model: {
        default: "test-model",
        fallback: "fallback-model",
      },
    };

    const cfg = extractGatewayConfig(toml);
    expect(cfg.model).toBe("test-model");
    expect(cfg.fallbackModel).toBe("fallback-model");
    expect(cfg.provider).toBe("openai");
  });

  it("handles absent model section with documented defaults", () => {
    const toml: AgentToml = { schema_version: 1 };
    const cfg = extractGatewayConfig(toml);
    expect(cfg.provider).toBe("openai");
    expect(typeof cfg.model).toBe("string");
    expect(cfg.baseUrl).toContain("/v1");
  });

  it("picks up max_cost_per_session_usd", () => {
    const toml: AgentToml = {
      schema_version: 1,
      model: {
        default: "gpt-4o",
        max_cost_per_session_usd: 5.0,
      },
    };

    const cfg = extractGatewayConfig(toml);
    expect(cfg.maxCostPerSessionUsd).toBe(5.0);
  });
});

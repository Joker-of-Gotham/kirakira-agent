import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentToml } from "@kirakira/core";

import { extractGatewayConfig } from "../../../packages/config-resolver/src/model-config.js";

const MODEL_ENV_KEYS = [
  "LLM_PROVIDER",
  "LLM_API_KEY",
  "LLM_BASE_URL",
  "LLM_MODEL",
  "LLM_MIRROR_BASE_URLS",
  "OPENAI_API_KEY",
  "DASHSCOPE_API_KEY",
  "ARK_API_KEY",
  "DEEPSEEK_API_KEY",
] as const;

describe("extractGatewayConfig", () => {
  beforeEach(() => {
    for (const key of MODEL_ENV_KEYS) {
      vi.stubEnv(key, undefined);
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

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

  it("uses the shared provider catalog for env alias defaults", () => {
    vi.stubEnv("LLM_PROVIDER", "dashscope");
    vi.stubEnv("LLM_MODEL", "qwen-custom");

    const cfg = extractGatewayConfig({ schema_version: 1 });
    expect(cfg.provider).toBe("aliyun-bailian");
    expect(cfg.baseUrl).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1");
    expect(cfg.apiKeyEnv).toBe("DASHSCOPE_API_KEY");
    expect(cfg.model).toBe("qwen-custom");
  });

  it("preserves the config-resolver generic key bootstrap behavior", () => {
    vi.stubEnv("LLM_PROVIDER", "deepseek-official");
    vi.stubEnv("LLM_API_KEY", "your-api-key");

    const cfg = extractGatewayConfig({ schema_version: 1 });
    expect(cfg.provider).toBe("deepseek");
    expect(cfg.apiKeyEnv).toBe("LLM_API_KEY");
    expect(cfg.baseUrl).toBe("https://api.deepseek.com");
    expect(cfg.model).toBe("deepseek-v4-flash");
  });
});

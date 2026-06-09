import { describe, expect, it } from "vitest";

import {
  MODEL_PROVIDERS,
  buildOpenAICompatibleUrl,
  detectModelProvider,
  getModelProvider,
  getModelProviderKey,
  isUsableModelApiKey,
  normalizeModelProviderId,
  resolveModelProviderEnv,
} from "../../../packages/core/src/model-providers.js";

describe("model provider catalog", () => {
  it("centralizes OpenAI-compatible provider defaults", () => {
    expect(MODEL_PROVIDERS.map((provider) => provider.id)).toEqual([
      "openai",
      "aliyun-bailian",
      "volcengine-ark",
      "deepseek",
    ]);
    expect(getModelProvider("openai")?.baseUrl).toBe("https://api.openai.com/v1");
    expect(getModelProvider("dashscope")?.baseUrl).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1");
    expect(getModelProvider("ark")?.baseUrl).toBe("https://ark.cn-beijing.volces.com/api/v3");
    expect(getModelProvider("deepseek")?.baseUrl).toBe("https://api.deepseek.com");
  });

  it("normalizes shared aliases without accepting unknown providers", () => {
    expect(normalizeModelProviderId("openai-platform")).toBe("openai");
    expect(normalizeModelProviderId("bailian")).toBe("aliyun-bailian");
    expect(normalizeModelProviderId("alibaba-bailian")).toBe("aliyun-bailian");
    expect(normalizeModelProviderId("dashscope")).toBe("aliyun-bailian");
    expect(normalizeModelProviderId("aliyun")).toBe("aliyun-bailian");
    expect(normalizeModelProviderId("ark")).toBe("volcengine-ark");
    expect(normalizeModelProviderId("volcano-ark")).toBe("volcengine-ark");
    expect(normalizeModelProviderId("bytedance")).toBe("volcengine-ark");
    expect(normalizeModelProviderId("byte")).toBe("volcengine-ark");
    expect(normalizeModelProviderId("deepseek-official")).toBe("deepseek");
    expect(normalizeModelProviderId("unknown-provider")).toBeUndefined();
  });

  it("rejects placeholder keys and only uses generic keys for the selected provider", () => {
    const openai = getModelProvider("openai");
    const deepseek = getModelProvider("deepseek");
    expect(openai).toBeDefined();
    expect(deepseek).toBeDefined();
    if (!openai || !deepseek) throw new Error("missing provider");

    expect(isUsableModelApiKey("EMPTY")).toBe(false);
    expect(isUsableModelApiKey("your-api-key")).toBe(false);
    expect(getModelProviderKey(openai, { OPENAI_API_KEY: "your-api-key" })).toBe("");
    expect(getModelProviderKey(openai, { OPENAI_API_KEY: "sk-openai" })).toBe("sk-openai");
    expect(getModelProviderKey(deepseek, { LLM_PROVIDER: "deepseek-official", LLM_API_KEY: "sk-generic" })).toBe(
      "sk-generic",
    );
    expect(getModelProviderKey(openai, { LLM_PROVIDER: "deepseek-official", LLM_API_KEY: "sk-generic" })).toBe("");
  });

  it("detects a single usable provider key and falls back deterministically", () => {
    expect(detectModelProvider({ DASHSCOPE_API_KEY: "sk-dashscope" }).id).toBe("aliyun-bailian");
    expect(detectModelProvider({ DEEPSEEK_API_KEY: "your-api-key" }).id).toBe("openai");
    expect(detectModelProvider({ OPENAI_API_KEY: "sk-openai", ARK_API_KEY: "sk-ark" }).id).toBe("openai");
    expect(detectModelProvider({ LLM_PROVIDER: "ark" }).id).toBe("volcengine-ark");
  });

  it("resolves provider env with normalized URLs and model defaults", () => {
    const resolved = resolveModelProviderEnv({
      LLM_PROVIDER: "dashscope",
      LLM_API_KEY: "sk-generic",
      LLM_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1/",
    });
    expect(resolved.provider.id).toBe("aliyun-bailian");
    expect(resolved.baseUrl).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1");
    expect(resolved.apiKey).toBe("sk-generic");
    expect(resolved.apiKeyEnv).toBe("LLM_API_KEY");
    expect(resolved.defaultModel).toBe("qwen3.6-plus");
  });

  it("builds provider-specific OpenAI-compatible endpoint URLs", () => {
    expect(buildOpenAICompatibleUrl("https://api.openai.com", "/chat/completions")).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
    expect(buildOpenAICompatibleUrl("https://api.openai.com/v1/chat/completions", "/chat/completions")).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
    expect(buildOpenAICompatibleUrl("https://api.deepseek.com", "/chat/completions")).toBe(
      "https://api.deepseek.com/chat/completions",
    );
    expect(buildOpenAICompatibleUrl("https://dashscope.aliyuncs.com", "/models")).toBe(
      "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
    );
    expect(buildOpenAICompatibleUrl("https://ark.cn-beijing.volces.com", "/models")).toBe(
      "https://ark.cn-beijing.volces.com/api/v3/models",
    );
    expect(buildOpenAICompatibleUrl("https://example.test/proxy", "/chat/completions")).toBe(
      "https://example.test/proxy/v1/chat/completions",
    );
  });
});

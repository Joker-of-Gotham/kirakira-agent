import { describe, expect, it } from "vitest";
import {
  LLM_PROVIDERS,
  detectProviders,
  getProvider,
  getProviderKey,
  isUsableApiKey,
  normalizeProviderId,
} from "../../../scripts/llm-providers.mjs";
import { MODEL_PROVIDERS } from "../../../packages/core/src/model-providers.js";

describe("scripts/llm-providers", () => {
  it("stays aligned with the core provider catalog", () => {
    expect(LLM_PROVIDERS.map((provider) => ({
      id: provider.id,
      keyEnv: provider.keyEnv,
      baseURL: provider.baseURL,
      fallbackModels: provider.fallbackModels,
    }))).toEqual(MODEL_PROVIDERS.map((provider) => ({
      id: provider.id,
      keyEnv: provider.keyEnv,
      baseURL: provider.baseUrl,
      fallbackModels: provider.fallbackModels,
    })));
  });

  it("normalizes aliases shared with the CLI provider catalog", () => {
    expect(normalizeProviderId("aliyun")).toBe("aliyun-bailian");
    expect(normalizeProviderId("dashscope")).toBe("aliyun-bailian");
    expect(normalizeProviderId("volcano-ark")).toBe("volcengine-ark");
  });

  it("rejects placeholder keys before provider detection", () => {
    const provider = getProvider("openai");
    expect(provider).toBeDefined();
    if (!provider) throw new Error("missing openai provider");

    expect(isUsableApiKey("EMPTY")).toBe(false);
    expect(isUsableApiKey("your-api-key")).toBe(false);
    expect(getProviderKey(provider, { OPENAI_API_KEY: "EMPTY" })).toBe("");
    expect(detectProviders({ OPENAI_API_KEY: "your-api-key" })).toEqual([]);
  });

  it("uses generic LLM_API_KEY only for the selected provider", () => {
    const deepseek = getProvider("deepseek");
    const openai = getProvider("openai");
    expect(deepseek).toBeDefined();
    expect(openai).toBeDefined();
    if (!deepseek || !openai) throw new Error("missing provider");

    const env = { LLM_PROVIDER: "deepseek-official", LLM_API_KEY: "sk-live" };
    expect(getProviderKey(deepseek, env)).toBe("sk-live");
    expect(getProviderKey(openai, env)).toBe("");
  });
});

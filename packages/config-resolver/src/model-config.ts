/**
 * Extract model provider configuration from resolved agent.toml,
 * ready for use by the model gateway.
 */

import type { AgentToml, ModelProviderDecl, ProviderType } from "@kirakira/core";

export interface GatewayBootstrapConfig {
  provider: ProviderType;
  baseUrl: string;
  apiKeyEnv: string;
  model: string;
  fallbackModel?: string;
  timeout: number;
  maxRetries: number;
  mirrorBaseUrls: string[];
  maxCostPerSessionUsd?: number;
}

const PROVIDER_DEFAULTS = {
  openai: { baseUrl: "https://api.openai.com/v1", apiKeyEnv: "OPENAI_API_KEY", model: "gpt-5.2" },
  "aliyun-bailian": {
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKeyEnv: "DASHSCOPE_API_KEY",
    model: "qwen3.6-plus",
  },
  "volcengine-ark": {
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    apiKeyEnv: "ARK_API_KEY",
    model: "doubao-seed-1-6-250615",
  },
  deepseek: { baseUrl: "https://api.deepseek.com", apiKeyEnv: "DEEPSEEK_API_KEY", model: "deepseek-v4-flash" },
} as const;

const PROVIDER_ALIASES: Record<string, keyof typeof PROVIDER_DEFAULTS | "auto"> = {
  auto: "auto",
  "openai-platform": "openai",
  bailian: "aliyun-bailian",
  "alibaba-bailian": "aliyun-bailian",
  dashscope: "aliyun-bailian",
  aliyun: "aliyun-bailian",
  ark: "volcengine-ark",
  "volcano-ark": "volcengine-ark",
  bytedance: "volcengine-ark",
  byte: "volcengine-ark",
  "deepseek-official": "deepseek",
};

function normalizeProviderId(value?: string): keyof typeof PROVIDER_DEFAULTS | "auto" {
  const normalized = (value ?? "auto").trim().toLowerCase();
  return PROVIDER_ALIASES[normalized] ?? (normalized as keyof typeof PROVIDER_DEFAULTS);
}

function detectProviderFromEnv(): keyof typeof PROVIDER_DEFAULTS {
  const explicit = normalizeProviderId(process.env.LLM_PROVIDER);
  if (explicit !== "auto" && explicit in PROVIDER_DEFAULTS) return explicit;

  const detected = Object.entries(PROVIDER_DEFAULTS)
    .filter(([, provider]) => Boolean(process.env[provider.apiKeyEnv]?.trim()))
    .map(([id]) => id as keyof typeof PROVIDER_DEFAULTS);

  return detected.length === 1 ? detected[0]! : "openai";
}

/**
 * Build a gateway bootstrap config from agent.toml model section.
 *
 * If `model.providers` is declared, uses the first provider as primary.
 * Falls back to env-based defaults matching V3 conventions.
 */
export function extractGatewayConfig(
  agentToml: AgentToml,
): GatewayBootstrapConfig {
  const modelSection = agentToml.model;
  const providers = modelSection?.providers;

  if (providers && providers.length > 0 && providers[0]) {
    return fromProviderDecl(providers[0], modelSection);
  }

  const provider = detectProviderFromEnv();
  const defaults = PROVIDER_DEFAULTS[provider];

  return {
    provider,
    baseUrl: process.env.LLM_BASE_URL || defaults.baseUrl,
    apiKeyEnv: process.env.LLM_API_KEY && process.env.LLM_API_KEY !== "EMPTY" ? "LLM_API_KEY" : defaults.apiKeyEnv,
    model: modelSection?.default ?? process.env.LLM_MODEL ?? defaults.model,
    fallbackModel: modelSection?.fallback,
    timeout: 120,
    maxRetries: 3,
    mirrorBaseUrls: parseMirrorUrls(process.env.LLM_MIRROR_BASE_URLS ?? ""),
    maxCostPerSessionUsd: modelSection?.max_cost_per_session_usd,
  };
}

function fromProviderDecl(
  decl: ModelProviderDecl,
  modelSection: AgentToml["model"],
): GatewayBootstrapConfig {
  const apiKeyEnv = decl.api_key_env ?? "LLM_API_KEY";
  return {
    provider: decl.type,
    baseUrl: decl.base_url ?? "",
    apiKeyEnv,
    model: decl.default_model ?? modelSection?.default ?? "",
    fallbackModel: modelSection?.fallback,
    timeout: decl.timeout ?? 120,
    maxRetries: decl.max_retries ?? 3,
    mirrorBaseUrls: [],
    maxCostPerSessionUsd: modelSection?.max_cost_per_session_usd,
  };
}

function parseMirrorUrls(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .replace(/;/g, ",")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

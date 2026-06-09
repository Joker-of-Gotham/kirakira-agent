/**
 * Extract model provider configuration from resolved agent.toml,
 * ready for use by the model gateway.
 */

import {
  MODEL_PROVIDERS,
  normalizeModelProviderId,
  type AgentToml,
  type ModelProviderCatalogEntry,
  type ModelProviderDecl,
  type ModelProviderId,
  type ProviderType,
} from "@kirakira/core";

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

function getCatalogProvider(id: ModelProviderId): ModelProviderCatalogEntry {
  return MODEL_PROVIDERS.find((provider) => provider.id === id) ?? MODEL_PROVIDERS[0]!;
}

function detectProviderFromEnv(): ModelProviderId {
  const explicit = normalizeModelProviderId(process.env.LLM_PROVIDER);
  if (explicit && explicit !== "auto") return explicit;

  const detected = MODEL_PROVIDERS
    .filter((provider) => Boolean(process.env[provider.keyEnv]?.trim()))
    .map((provider) => provider.id);

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
  const defaults = getCatalogProvider(provider);

  return {
    provider,
    baseUrl: process.env.LLM_BASE_URL || defaults.baseUrl,
    apiKeyEnv: process.env.LLM_API_KEY && process.env.LLM_API_KEY !== "EMPTY" ? "LLM_API_KEY" : defaults.keyEnv,
    model: modelSection?.default ?? process.env.LLM_MODEL ?? defaults.defaultModel,
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

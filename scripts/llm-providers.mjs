import providerCatalog from "../packages/core/src/model-providers.catalog.json" with { type: "json" };

const DEFAULT_TIMEOUT_MS = 15000;

export const LLM_PROVIDERS = Object.freeze(
  providerCatalog.providers.map((provider) => Object.freeze({
    ...provider,
    baseURL: provider.baseUrl,
    fallbackModels: Object.freeze([...provider.fallbackModels]),
  })),
);

const PROVIDER_ALIASES = new Map(Object.entries(providerCatalog.aliases));

export function normalizeProviderId(providerId) {
  if (!providerId) return undefined;
  const normalized = String(providerId).trim().toLowerCase();
  return PROVIDER_ALIASES.get(normalized) ?? normalized;
}

export function getProvider(providerId) {
  const normalized = normalizeProviderId(providerId);
  return LLM_PROVIDERS.find((provider) => provider.id === normalized);
}

export function isUsableApiKey(value) {
  const trimmed = String(value ?? "").trim();
  return Boolean(trimmed && trimmed !== "EMPTY" && trimmed !== "your-api-key");
}

export function getProviderKey(provider, env = process.env) {
  const providerSpecific = String(env[provider.keyEnv] ?? "").trim();
  const generic = String(env.LLM_API_KEY ?? "").trim();
  if (isUsableApiKey(providerSpecific)) return providerSpecific;
  if (normalizeProviderId(env.LLM_PROVIDER) === provider.id && isUsableApiKey(generic)) return generic;
  return "";
}

export function detectProviders(env = process.env) {
  const configured = getProvider(env.LLM_PROVIDER);
  if (configured && getProviderKey(configured, env)) return [configured];
  return LLM_PROVIDERS.filter((provider) => Boolean(getProviderKey(provider, env)));
}

export function chatCompletionsURL(provider) {
  return `${trimTrailingSlash(provider.baseURL)}/chat/completions`;
}

export async function listProviderModels(provider, apiKey, options = {}) {
  const fallback = dedupe(provider.fallbackModels);

  if (!apiKey) {
    return {
      models: fallback,
      source: "fallback-no-key",
      detail: `${provider.keyEnv} is not set`,
    };
  }

  if (typeof fetch !== "function") {
    return {
      models: fallback,
      source: "fallback-no-fetch",
      detail: "global fetch is not available in this Node.js runtime",
    };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${trimTrailingSlash(provider.baseURL)}${provider.modelsEndpoint}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`${response.status} ${response.statusText}${body ? `: ${body.slice(0, 200)}` : ""}`);
    }

    const payload = await response.json();
    const liveModels = filterChatModels(provider, extractModelIds(payload));
    if (liveModels.length === 0) {
      throw new Error("model discovery returned no model ids");
    }

    return {
      models: liveModels,
      source: "live",
      detail: `${provider.baseURL}${provider.modelsEndpoint}`,
    };
  } catch (error) {
    return {
      models: fallback,
      source: "fallback",
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractModelIds(payload) {
  const rawModels = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : Array.isArray(payload)
        ? payload
        : [];

  return dedupe(
    rawModels
      .map((model) => {
        if (typeof model === "string") return model;
        if (model && typeof model === "object") return model.id ?? model.model ?? model.name;
        return undefined;
      })
      .filter((modelId) => typeof modelId === "string" && modelId.trim().length > 0)
      .map((modelId) => modelId.trim()),
  );
}

function filterChatModels(provider, modelIds) {
  const excludedParts = [
    "embedding",
    "moderation",
    "tts",
    "whisper",
    "transcribe",
    "image",
    "sora",
    "realtime",
    "audio",
    "babbage",
    "davinci",
  ];

  const filtered = modelIds.filter((modelId) => {
    const lower = modelId.toLowerCase();
    if (excludedParts.some((part) => lower.includes(part))) return false;
    if (provider.id === "openai") return lower.startsWith("gpt-") || /^o\d/.test(lower);
    return true;
  });

  return filtered.length > 0 ? filtered : modelIds;
}

function dedupe(values) {
  return [...new Set(values)];
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/u, "");
}

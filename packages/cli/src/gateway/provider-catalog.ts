import {
  MODEL_PROVIDERS,
  detectModelProvider,
  getModelProvider,
  getModelProviderKey,
  isUsableModelApiKey,
  normalizeModelProviderId,
  trimTrailingSlash,
  type ModelProviderCatalogEntry,
  type ModelProviderEnv,
  type ModelProviderId,
} from "@kirakira/core";

export type LlmProvider = ModelProviderCatalogEntry;

export interface ModelDiscoveryResult {
  models: string[];
  source: "live" | "fallback" | "fallback-no-key";
  detail: string;
  authFailed?: boolean;
}

const DEFAULT_TIMEOUT_MS = 15000;

export const LLM_PROVIDERS: readonly LlmProvider[] = MODEL_PROVIDERS;

export function normalizeProviderId(value?: string): LlmProvider["id"] | undefined {
  const id = normalizeModelProviderId(value);
  return id && id !== "auto" ? id : undefined;
}

export function getProvider(value?: string): LlmProvider | undefined {
  return getModelProvider(value);
}

export function isUsableApiKey(value?: string): boolean {
  return isUsableModelApiKey(value);
}

export function getProviderKey(provider: LlmProvider, env: ModelProviderEnv = process.env): string {
  return getModelProviderKey(provider, env);
}

export function detectProvider(env: ModelProviderEnv = process.env): LlmProvider {
  return detectModelProvider(env);
}

export function chatCompletionsUrl(provider: LlmProvider): string {
  return `${trimTrailingSlash(provider.baseUrl)}/chat/completions`;
}

export async function discoverProviderModels(
  provider: LlmProvider,
  apiKey: string,
  options: { timeoutMs?: number } = {},
): Promise<ModelDiscoveryResult> {
  const fallback = dedupe(provider.fallbackModels);

  if (!isUsableApiKey(apiKey)) {
    return {
      models: fallback,
      source: "fallback-no-key",
      detail: `${provider.keyEnv} is not set`,
    };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${trimTrailingSlash(provider.baseUrl)}${provider.modelsEndpoint}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const authFailed = response.status === 401 || response.status === 403;
      return {
        models: fallback,
        source: "fallback",
        authFailed,
        detail: `${response.status} ${response.statusText}${body ? `: ${body.slice(0, 200)}` : ""}`,
      };
    }

    const payload = await response.json();
    const liveModels = filterChatModels(provider, extractModelIds(payload));
    if (liveModels.length === 0) {
      throw new Error("model discovery returned no model ids");
    }

    return {
      models: liveModels,
      source: "live",
      detail: `${provider.baseUrl}${provider.modelsEndpoint}`,
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

function extractModelIds(payload: unknown): string[] {
  const shaped = payload as { data?: unknown; models?: unknown };
  const rawModels = Array.isArray(shaped?.data)
    ? shaped.data
    : Array.isArray(shaped?.models)
      ? shaped.models
      : Array.isArray(payload)
        ? payload
        : [];

  return dedupe(
    rawModels
      .map((model) => {
        if (typeof model === "string") return model;
        if (model && typeof model === "object") {
          const item = model as { id?: unknown; model?: unknown; name?: unknown };
          return item.id ?? item.model ?? item.name;
        }
        return undefined;
      })
      .filter((modelId): modelId is string => typeof modelId === "string" && modelId.trim().length > 0)
      .map((modelId) => modelId.trim()),
  );
}

function filterChatModels(provider: LlmProvider, modelIds: string[]): string[] {
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
    if (provider.id === "openai") return lower.startsWith("gpt-") || /^o\d/u.test(lower);
    return true;
  });

  return filtered.length > 0 ? filtered : modelIds;
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export type { ModelProviderId };

export interface LlmProvider {
  id: "openai" | "aliyun-bailian" | "volcengine-ark" | "deepseek";
  label: string;
  keyEnv: string;
  baseUrl: string;
  modelsEndpoint: string;
  defaultModel: string;
  fallbackModels: string[];
}

export interface ModelDiscoveryResult {
  models: string[];
  source: "live" | "fallback" | "fallback-no-key";
  detail: string;
  authFailed?: boolean;
}

const DEFAULT_TIMEOUT_MS = 15000;

export const LLM_PROVIDERS: readonly LlmProvider[] = Object.freeze([
  {
    id: "openai",
    label: "OpenAI Platform",
    keyEnv: "OPENAI_API_KEY",
    baseUrl: "https://api.openai.com/v1",
    modelsEndpoint: "/models",
    defaultModel: "gpt-5.2",
    fallbackModels: ["gpt-5.2", "gpt-5.2-codex", "gpt-5.1", "gpt-5", "gpt-4.1", "gpt-4o-mini"],
  },
  {
    id: "aliyun-bailian",
    label: "Alibaba Bailian / DashScope",
    keyEnv: "DASHSCOPE_API_KEY",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    modelsEndpoint: "/models",
    defaultModel: "qwen3.6-plus",
    fallbackModels: [
      "qwen3.6-plus",
      "qwen3.6-flash",
      "qwen3.6-max-preview",
      "qwen3.5-plus",
      "qwen3-coder-plus",
      "qwen-plus",
      "qwen-turbo",
      "qwen-long",
      "qwq-plus",
    ],
  },
  {
    id: "volcengine-ark",
    label: "ByteDance Volcano Ark",
    keyEnv: "ARK_API_KEY",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    modelsEndpoint: "/models",
    defaultModel: "doubao-seed-1-6-250615",
    fallbackModels: [
      "doubao-seed-1-6-250615",
      "doubao-seed-1-6-251015",
      "doubao-seed-1-6-flash-250828",
    ],
  },
  {
    id: "deepseek",
    label: "DeepSeek Official API",
    keyEnv: "DEEPSEEK_API_KEY",
    baseUrl: "https://api.deepseek.com",
    modelsEndpoint: "/models",
    defaultModel: "deepseek-v4-flash",
    fallbackModels: ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-chat", "deepseek-reasoner"],
  },
]);

const PROVIDER_ALIASES = new Map<string, LlmProvider["id"]>([
  ["openai-platform", "openai"],
  ["bailian", "aliyun-bailian"],
  ["alibaba-bailian", "aliyun-bailian"],
  ["dashscope", "aliyun-bailian"],
  ["aliyun", "aliyun-bailian"],
  ["ark", "volcengine-ark"],
  ["volcano-ark", "volcengine-ark"],
  ["bytedance", "volcengine-ark"],
  ["byte", "volcengine-ark"],
  ["deepseek-official", "deepseek"],
]);

export function normalizeProviderId(value?: string): LlmProvider["id"] | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  return PROVIDER_ALIASES.get(normalized) ?? (
    LLM_PROVIDERS.some((provider) => provider.id === normalized)
      ? normalized as LlmProvider["id"]
      : undefined
  );
}

export function getProvider(value?: string): LlmProvider | undefined {
  const id = normalizeProviderId(value);
  return LLM_PROVIDERS.find((provider) => provider.id === id);
}

export function isUsableApiKey(value?: string): boolean {
  const trimmed = (value ?? "").trim();
  return Boolean(trimmed && trimmed !== "EMPTY" && trimmed !== "your-api-key");
}

export function getProviderKey(provider: LlmProvider, env: NodeJS.ProcessEnv = process.env): string {
  const providerSpecific = env[provider.keyEnv]?.trim() ?? "";
  const generic = env.LLM_API_KEY?.trim() ?? "";
  if (isUsableApiKey(providerSpecific)) return providerSpecific;
  if (normalizeProviderId(env.LLM_PROVIDER) === provider.id && isUsableApiKey(generic)) return generic;
  return "";
}

export function detectProvider(env: NodeJS.ProcessEnv = process.env): LlmProvider {
  const explicit = getProvider(env.LLM_PROVIDER);
  if (explicit) return explicit;

  const detected = LLM_PROVIDERS.filter((provider) => isUsableApiKey(env[provider.keyEnv]));
  return detected.length === 1 ? detected[0]! : LLM_PROVIDERS[0]!;
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

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "");
}

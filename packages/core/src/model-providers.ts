import providerCatalog from "./model-providers.catalog.json" with { type: "json" };

export type ModelProviderId =
  | "openai"
  | "aliyun-bailian"
  | "volcengine-ark"
  | "deepseek";

export interface ModelProviderCatalogEntry {
  id: ModelProviderId;
  label: string;
  keyEnv: string;
  baseUrl: string;
  modelsEndpoint: string;
  defaultModel: string;
  fallbackModels: readonly string[];
}

export interface ModelProviderEnv {
  LLM_PROVIDER?: string;
  LLM_API_KEY?: string;
  LLM_BASE_URL?: string;
  LLM_MODEL?: string;
  [key: string]: string | undefined;
}

export interface ResolvedModelProviderEnv {
  provider: ModelProviderCatalogEntry;
  baseUrl: string;
  apiKey: string;
  apiKeyEnv: string;
  defaultModel: string;
}

export const MODEL_PROVIDERS: readonly ModelProviderCatalogEntry[] = Object.freeze(
  providerCatalog.providers.map((provider) => Object.freeze({
    ...provider,
    fallbackModels: Object.freeze([...provider.fallbackModels]),
  })) as ModelProviderCatalogEntry[],
);

const MODEL_PROVIDER_ALIASES = new Map<string, ModelProviderId | "auto">(
  Object.entries(providerCatalog.aliases) as Array<[string, ModelProviderId | "auto"]>,
);

const VERSIONED_BASE_SUFFIXES = ["/v1", "/api/v3", "/compatible-mode/v1"] as const;

export function normalizeModelProviderId(value?: string): ModelProviderId | "auto" | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  const aliased = MODEL_PROVIDER_ALIASES.get(normalized);
  if (aliased !== undefined) return aliased;
  return MODEL_PROVIDERS.some((provider) => provider.id === normalized)
    ? normalized as ModelProviderId
    : undefined;
}

export function getModelProvider(value?: string): ModelProviderCatalogEntry | undefined {
  const id = normalizeModelProviderId(value);
  if (!id || id === "auto") return undefined;
  return MODEL_PROVIDERS.find((provider) => provider.id === id);
}

export function isUsableModelApiKey(value?: string): boolean {
  const trimmed = (value ?? "").trim();
  return Boolean(trimmed && trimmed !== "EMPTY" && trimmed !== "your-api-key");
}

export function getModelProviderKey(
  provider: Pick<ModelProviderCatalogEntry, "id" | "keyEnv">,
  env: ModelProviderEnv = process.env,
): string {
  const providerSpecific = env[provider.keyEnv]?.trim() ?? "";
  const generic = env.LLM_API_KEY?.trim() ?? "";
  if (isUsableModelApiKey(providerSpecific)) return providerSpecific;
  if (normalizeModelProviderId(env.LLM_PROVIDER) === provider.id && isUsableModelApiKey(generic)) {
    return generic;
  }
  return "";
}

export function detectModelProvider(env: ModelProviderEnv = process.env): ModelProviderCatalogEntry {
  const explicit = getModelProvider(env.LLM_PROVIDER);
  if (explicit) return explicit;

  const detected = MODEL_PROVIDERS.filter((provider) =>
    isUsableModelApiKey(env[provider.keyEnv]),
  );
  return detected.length === 1 ? detected[0]! : MODEL_PROVIDERS[0]!;
}

export function resolveModelProviderEnv(
  env: ModelProviderEnv = process.env,
): ResolvedModelProviderEnv {
  const provider = detectModelProvider(env);
  const generic = env.LLM_API_KEY?.trim() ?? "";
  const providerSpecific = env[provider.keyEnv]?.trim() ?? "";
  const apiKey = getModelProviderKey(provider, env) || generic || providerSpecific || "EMPTY";
  const apiKeyEnv = isUsableModelApiKey(generic) && normalizeModelProviderId(env.LLM_PROVIDER) === provider.id
    ? "LLM_API_KEY"
    : provider.keyEnv;
  return {
    provider,
    baseUrl: trimTrailingSlash((env.LLM_BASE_URL || provider.baseUrl).trim()),
    apiKey,
    apiKeyEnv,
    defaultModel: (env.LLM_MODEL || provider.defaultModel).trim(),
  };
}

export function buildOpenAICompatibleUrl(baseUrl: string, endpointPath: string): string {
  const trimmed = trimTrailingSlash(baseUrl.trim());
  const path = `/${endpointPath.replace(/^\/+/u, "")}`;
  if (!trimmed) return "";
  if (trimmed.endsWith(path)) return trimmed;

  const url = new URL(trimmed);
  const host = url.hostname.toLowerCase();
  const currentPath = trimTrailingSlash(url.pathname);

  let apiPath: string;
  if (VERSIONED_BASE_SUFFIXES.some((suffix) => currentPath.endsWith(suffix))) {
    apiPath = currentPath;
  } else if (host === "api.openai.com") {
    apiPath = `${currentPath}/v1`;
  } else if (host === "api.deepseek.com") {
    apiPath = currentPath;
  } else if (host.endsWith("dashscope.aliyuncs.com")) {
    apiPath = `${currentPath}/compatible-mode/v1`;
  } else if (host === "ark.cn-beijing.volces.com") {
    apiPath = `${currentPath}/api/v3`;
  } else {
    apiPath = `${currentPath}/v1`;
  }

  url.pathname = `${trimTrailingSlash(apiPath)}${path}`;
  return url.toString();
}

export function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "");
}

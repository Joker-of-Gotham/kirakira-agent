/**
 * OpenAI-compatible chat completion via HTTPS — same wire contract as
 * `packages/model-gateway` / `OpenAICompatClient`.
 *
 * Handles Qwen3-style thinking models that return reasoning_content
 * separately from content.
 */

import {
  detectProvider,
  getProviderKey,
  isUsableApiKey,
} from "./provider-catalog.js";

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
}

export interface ChatCompleteOptions {
  prompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  provider?: ProviderConfig;
}

export interface ChatCompleteResult {
  text: string;
  model: string;
  durationMs: number;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ChatCompleteMultiTurnOptions {
  messages: Array<{ role: string; content: string }>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  provider?: ProviderConfig;
}

const DEFAULT_BASE = "http://127.0.0.1:30000/v1";
const VERSIONED_BASE_SUFFIXES = ["/v1", "/api/v3", "/compatible-mode/v1"] as const;

export function resolveLlmRuntimeEnv(): ProviderConfig {
  const provider = detectProvider();
  const baseUrl = (process.env.LLM_BASE_URL || provider.baseUrl).trim().replace(/\/$/, "");
  const apiKey = getProviderKey(provider) || (process.env.LLM_API_KEY ?? "").trim() || "EMPTY";
  const defaultModel = (process.env.LLM_MODEL || provider.defaultModel).trim();
  return { baseUrl: baseUrl || DEFAULT_BASE, apiKey, defaultModel };
}

function assertProviderConfigured(provider: ProviderConfig): void {
  if (!isUsableApiKey(provider.apiKey)) {
    throw new Error("LLM provider is not configured. Open /config in the TUI or run `pnpm.cmd llm:select` to choose a provider, paste an API key, and select a model.");
  }
}

export function buildOpenAICompatibleUrl(baseUrl: string, endpointPath: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/u, "");
  const path = `/${endpointPath.replace(/^\/+/u, "")}`;
  if (!trimmed) return "";
  if (trimmed.endsWith(path)) return trimmed;

  const url = new URL(trimmed);
  const host = url.hostname.toLowerCase();
  const currentPath = url.pathname.replace(/\/+$/u, "");

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

  url.pathname = `${apiPath.replace(/\/+$/u, "")}${path}`;
  return url.toString();
}

/**
 * Resolve provider config chain: explicit provider → env → defaults.
 * Picks the first source that has a non-empty value for each field.
 */
function resolveProvider(override?: ProviderConfig): ProviderConfig {
  const env = resolveLlmRuntimeEnv();
  return {
    baseUrl: override?.baseUrl || env.baseUrl,
    apiKey: override?.apiKey || env.apiKey,
    defaultModel: override?.defaultModel || env.defaultModel || "default",
  };
}

interface LlmResponseMessage {
  content?: string | null;
  reasoning_content?: string | null;
}

interface LlmResponse {
  choices?: Array<{ message?: LlmResponseMessage }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

function extractText(data: LlmResponse): string {
  const msg = data.choices?.[0]?.message;
  if (!msg) return "";
  const content = msg.content?.trim();
  if (content) return content;
  const reasoning = msg.reasoning_content?.trim();
  if (reasoning) return reasoning;
  return "";
}

function extractUsage(data: LlmResponse): ChatCompleteResult["usage"] {
  const u = data.usage;
  if (!u) return undefined;
  return {
    promptTokens: u.prompt_tokens ?? 0,
    completionTokens: u.completion_tokens ?? 0,
    totalTokens: u.total_tokens ?? 0,
  };
}

function buildRequestBody(
  model: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  maxTokens: number,
  stream = false,
): Record<string, unknown> {
  return {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream,
    chat_template_kwargs: { enable_thinking: !stream },
  };
}

export async function chatComplete(
  options: ChatCompleteOptions,
): Promise<ChatCompleteResult> {
  const pc = resolveProvider(options.provider);
  assertProviderConfigured(pc);
  const model = options.model ?? pc.defaultModel;
  const url = buildOpenAICompatibleUrl(pc.baseUrl, "/chat/completions");

  const t0 = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(pc.apiKey ? { Authorization: `Bearer ${pc.apiKey}` } : {}),
    },
    body: JSON.stringify(
      buildRequestBody(
        model,
        [{ role: "user", content: options.prompt }],
        options.temperature ?? 0.2,
        options.maxTokens ?? 4096,
      ),
    ),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LLM request failed HTTP ${res.status}: ${body.slice(0, 800)}`);
  }

  const data = (await res.json()) as LlmResponse;
  const text = extractText(data);
  if (!text) {
    throw new Error("LLM returned empty message content");
  }

  return {
    text,
    model,
    durationMs: Date.now() - t0,
    usage: extractUsage(data),
  };
}

export async function chatCompleteMultiTurn(
  options: ChatCompleteMultiTurnOptions,
): Promise<ChatCompleteResult> {
  const pc = resolveProvider(options.provider);
  assertProviderConfigured(pc);
  const model = options.model ?? pc.defaultModel;
  const url = buildOpenAICompatibleUrl(pc.baseUrl, "/chat/completions");

  const t0 = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(pc.apiKey ? { Authorization: `Bearer ${pc.apiKey}` } : {}),
    },
    body: JSON.stringify(
      buildRequestBody(
        model,
        options.messages,
        options.temperature ?? 0.2,
        options.maxTokens ?? 4096,
      ),
    ),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LLM request failed HTTP ${res.status}: ${body.slice(0, 800)}`);
  }

  const data = (await res.json()) as LlmResponse;
  const text = extractText(data);
  if (!text) {
    throw new Error("LLM returned empty message content");
  }

  return {
    text,
    model,
    durationMs: Date.now() - t0,
    usage: extractUsage(data),
  };
}

/* ── Streaming variant for thinking display ──────────────────── */

export interface StreamCallbacks {
  onThinking?: (chunk: string) => void;
  onContent?: (chunk: string) => void;
}

interface SseDelta {
  content?: string | null;
  reasoning_content?: string | null;
}

export async function chatCompleteMultiTurnStream(
  options: ChatCompleteMultiTurnOptions,
  callbacks: StreamCallbacks,
): Promise<ChatCompleteResult> {
  const pc = resolveProvider(options.provider);
  assertProviderConfigured(pc);
  const model = options.model ?? pc.defaultModel;
  const url = buildOpenAICompatibleUrl(pc.baseUrl, "/chat/completions");

  const t0 = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(pc.apiKey ? { Authorization: `Bearer ${pc.apiKey}` } : {}),
    },
    body: JSON.stringify(
      buildRequestBody(
        model,
        options.messages,
        options.temperature ?? 0.2,
        options.maxTokens ?? 4096,
        true,
      ),
    ),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LLM stream failed HTTP ${res.status}: ${body.slice(0, 800)}`);
  }

  let contentBuf = "";
  let thinkingBuf = "";
  let lineBuf = "";

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Response body is not readable");
  const decoder = new TextDecoder();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    lineBuf += decoder.decode(value, { stream: true });
    const lines = lineBuf.split("\n");
    lineBuf = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") continue;
      if (!trimmed.startsWith("data: ")) continue;

      try {
        const obj = JSON.parse(trimmed.slice(6)) as {
          choices?: Array<{ delta?: SseDelta }>;
        };
        const delta = obj.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.reasoning_content) {
          thinkingBuf += delta.reasoning_content;
          callbacks.onThinking?.(delta.reasoning_content);
        }
        if (delta.content) {
          contentBuf += delta.content;
          callbacks.onContent?.(delta.content);
        }
      } catch {
        /* skip unparseable SSE chunks */
      }
    }
  }

  const text = contentBuf || thinkingBuf;
  if (!text) throw new Error("LLM stream returned empty content");

  return { text, model, durationMs: Date.now() - t0 };
}

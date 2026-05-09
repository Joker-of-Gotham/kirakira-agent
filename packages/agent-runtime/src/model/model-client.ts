import { ModelInvocationError } from "../errors.js";
import type {
  CompleteOptions,
  GatewayClientLike,
  Message,
  ModelResponse,
} from "../types.js";

import { buildStructuredPrompt, parseStructuredOutput } from "./structured-output.js";

const PROVIDER_DEFAULTS = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    apiKeyEnv: "OPENAI_API_KEY",
    defaultModel: "gpt-5.2",
  },
  "aliyun-bailian": {
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKeyEnv: "DASHSCOPE_API_KEY",
    defaultModel: "qwen3.6-plus",
  },
  "volcengine-ark": {
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    apiKeyEnv: "ARK_API_KEY",
    defaultModel: "doubao-seed-1-6-250615",
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-v4-flash",
  },
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

const VERSIONED_BASE_SUFFIXES = ["/v1", "/api/v3", "/compatible-mode/v1"] as const;

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

function resolveApiKey(apiKeyEnv: string): string {
  const generic = (process.env.LLM_API_KEY ?? "").trim();
  const providerSpecific = (process.env[apiKeyEnv] ?? "").trim();
  if (generic && generic !== "EMPTY") return generic;
  return providerSpecific || generic || "EMPTY";
}

function resolveLlmEnv(): { baseUrl: string; apiKey: string; defaultModel: string } {
  const provider = PROVIDER_DEFAULTS[detectProviderFromEnv()];
  const baseUrl = (process.env.LLM_BASE_URL || provider.baseUrl)
    .trim()
    .replace(/\/$/, "");
  const apiKey = resolveApiKey(provider.apiKeyEnv);
  const defaultModel = (process.env.LLM_MODEL || provider.defaultModel).trim();
  return { baseUrl, apiKey, defaultModel };
}

function buildOpenAICompatibleUrl(baseUrl: string, endpointPath: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/u, "");
  const path = `/${endpointPath.replace(/^\/+/u, "")}`;
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

function extractText(data: {
  choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
}): string {
  const msg = data.choices?.[0]?.message;
  if (!msg) return "";
  const content = msg.content?.trim();
  if (content) return content;
  const reasoning = msg.reasoning_content?.trim();
  if (reasoning) return reasoning;
  return "";
}

function extractUsage(data: {
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}): { promptTokens: number; completionTokens: number; totalTokens: number } {
  const u = data.usage;
  if (!u) {
    return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }
  return {
    promptTokens: u.prompt_tokens ?? 0,
    completionTokens: u.completion_tokens ?? 0,
    totalTokens:
      u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0),
  };
}

function toChatMessages(messages: Message[], systemPrompt?: string): Array<{
  role: string;
  content: string;
}> {
  const out: Array<{ role: string; content: string }> = [];
  if (systemPrompt) {
    out.push({ role: "system", content: systemPrompt });
  }
  for (const m of messages) {
    if (m.role === "system") out.push({ role: "system", content: m.content });
    else if (m.role === "user") out.push({ role: "user", content: m.content });
    else if (m.role === "assistant") out.push({ role: "assistant", content: m.content });
    else out.push({ role: "user", content: `[tool:${m.name ?? "result"}] ${m.content}` });
  }
  return out;
}

export class ModelClient {
  constructor(private readonly gateway?: GatewayClientLike) {}

  /**
   * When the gateway does not return usage data, derive an estimate from the
   * input/output content lengths using the standard ~4 chars/token baseline.
   * This is a last-resort fallback to keep budget accounting non-zero.
   */
  private estimateUsageFromContent(
    prompt: string,
    completion: string,
  ): { promptTokens: number; completionTokens: number; totalTokens: number } {
    const promptTokens = Math.ceil(prompt.length / 4);
    const completionTokens = Math.ceil(completion.length / 4);
    return { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
  }

  async complete(
    messages: Message[],
    options: CompleteOptions,
    systemPrompt?: string,
  ): Promise<ModelResponse> {
    if (this.gateway) {
      const transcript = messages.map((m) => `${m.role}: ${m.content}`).join("\n\n");
      const res2 = await this.gateway.complete({
        prompt: transcript,
        model: options.model,
        systemPrompt,
        temperature: options.temperature ?? 0.2,
        maxTokens: options.maxTokens ?? 4096,
      });
      if (res2.rawError) {
        throw new ModelInvocationError(res2.rawError);
      }
      const text2 = res2.text ?? "";
      const usage2 = res2.usage
        ? {
            promptTokens: res2.usage.prompt_tokens ?? 0,
            completionTokens: res2.usage.completion_tokens ?? 0,
            totalTokens:
              res2.usage.total_tokens ??
              (res2.usage.prompt_tokens ?? 0) + (res2.usage.completion_tokens ?? 0),
          }
        : this.estimateUsageFromContent(transcript, text2);
      options.onUsage?.(usage2);
      return { text: text2, usage: usage2, model: res2.model };
    }

    const { baseUrl, apiKey } = resolveLlmEnv();
    const url = buildOpenAICompatibleUrl(baseUrl, "/chat/completions");
    const chatMessages = toChatMessages(messages, systemPrompt);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: options.model,
        messages: chatMessages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 4096,
        stream: false,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new ModelInvocationError(`HTTP ${res.status}: ${body.slice(0, 400)}`);
    }
    const data = (await res.json()) as Parameters<typeof extractText>[0] &
      Parameters<typeof extractUsage>[0];
    const text = extractText(data);
    const usage = extractUsage(data);
    options.onUsage?.(usage);
    return {
      text,
      usage,
      model: options.model,
      finishReason: (data as { choices?: Array<{ finish_reason?: string }> }).choices?.[0]
        ?.finish_reason,
    };
  }

  async *completeStream(
    messages: Message[],
    options: CompleteOptions,
    systemPrompt?: string,
  ): AsyncGenerator<string> {
    if (this.gateway) {
      const transcript = messages.map((m) => `${m.role}: ${m.content}`).join("\n\n");
      const res = await this.gateway.complete({
        prompt: transcript,
        model: options.model,
        systemPrompt,
        temperature: options.temperature ?? 0.2,
        maxTokens: options.maxTokens ?? 4096,
      });
      if (res.rawError) throw new ModelInvocationError(res.rawError);
      const text = res.text ?? "";
      if (res.usage) {
        options.onUsage?.({
          promptTokens: res.usage.prompt_tokens ?? 0,
          completionTokens: res.usage.completion_tokens ?? 0,
          totalTokens: res.usage.total_tokens ?? (res.usage.prompt_tokens ?? 0) + (res.usage.completion_tokens ?? 0),
        });
      } else {
        options.onUsage?.(this.estimateUsageFromContent(transcript, text));
      }
      yield text;
      return;
    }

    const { baseUrl, apiKey } = resolveLlmEnv();
    const url = buildOpenAICompatibleUrl(baseUrl, "/chat/completions");
    const chatMessages = toChatMessages(messages, systemPrompt);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: options.model,
        messages: chatMessages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 4096,
        stream: true,
      }),
    });
    if (!res.ok || !res.body) {
      const body = res.ok ? "No body" : await res.text();
      throw new ModelInvocationError(
        !res.ok ? `HTTP ${res.status}: ${body.slice(0, 400)}` : body,
      );
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const block of parts) {
        const line = block.split("\n").find((l) => l.startsWith("data: "));
        if (!line || line.includes("[DONE]")) continue;
        const payload = line.slice("data: ".length);
        try {
          const j = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const piece = j.choices?.[0]?.delta?.content;
          if (piece) yield piece;
        } catch {
          continue;
        }
      }
    }
  }

  async completeStructured<T>(
    messages: Message[],
    schema: Record<string, unknown>,
    options: CompleteOptions,
    systemPrompt?: string,
  ): Promise<T> {
    const schemaPrompt = buildStructuredPrompt(schema);
    const combinedSystem = [systemPrompt, schemaPrompt].filter(Boolean).join("\n\n");
    const res = await this.complete(messages, options, combinedSystem || undefined);
    return parseStructuredOutput<T>(res.text, schema);
  }
}

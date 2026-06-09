import {
  MODEL_PROVIDERS,
  buildOpenAICompatibleUrl,
  normalizeModelProviderId,
  trimTrailingSlash,
  type ModelProviderCatalogEntry,
} from "@kirakira/core";

import { ModelInvocationError } from "../errors.js";
import type {
  CompleteOptions,
  GatewayClientLike,
  Message,
  ModelResponse,
} from "../types.js";

import { buildStructuredPrompt, parseStructuredOutput } from "./structured-output.js";

function detectProviderFromEnv(): ModelProviderCatalogEntry {
  const explicit = normalizeModelProviderId(process.env.LLM_PROVIDER);
  if (explicit && explicit !== "auto") {
    const provider = MODEL_PROVIDERS.find((entry) => entry.id === explicit);
    if (provider) return provider;
  }

  const detected = MODEL_PROVIDERS.filter((provider) => Boolean(process.env[provider.keyEnv]?.trim()));
  return detected.length === 1 ? detected[0]! : MODEL_PROVIDERS[0]!;
}

function resolveApiKey(apiKeyEnv: string): string {
  const generic = (process.env.LLM_API_KEY ?? "").trim();
  const providerSpecific = (process.env[apiKeyEnv] ?? "").trim();
  if (generic && generic !== "EMPTY") return generic;
  return providerSpecific || generic || "EMPTY";
}

function resolveLlmEnv(): { baseUrl: string; apiKey: string; defaultModel: string } {
  const provider = detectProviderFromEnv();
  const baseUrl = trimTrailingSlash((process.env.LLM_BASE_URL || provider.baseUrl).trim());
  const apiKey = resolveApiKey(provider.keyEnv);
  const defaultModel = (process.env.LLM_MODEL || provider.defaultModel).trim();
  return { baseUrl, apiKey, defaultModel };
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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ModelClient } from "../../../packages/agent-runtime/src/model/model-client.js";

const MODEL_ENV_KEYS = [
  "LLM_PROVIDER",
  "LLM_API_KEY",
  "LLM_BASE_URL",
  "LLM_MODEL",
  "OPENAI_API_KEY",
  "DASHSCOPE_API_KEY",
  "ARK_API_KEY",
  "DEEPSEEK_API_KEY",
] as const;

describe("ModelClient provider env", () => {
  beforeEach(() => {
    for (const key of MODEL_ENV_KEYS) {
      vi.stubEnv(key, undefined);
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses the shared provider URL builder and runtime generic key fallback", async () => {
    vi.stubEnv("LLM_PROVIDER", "deepseek-official");
    vi.stubEnv("LLM_API_KEY", "sk-generic");

    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      requests.push({ url, init });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });

    const result = await new ModelClient().complete(
      [{ role: "user", content: "ping" }],
      { model: "deepseek-v4-flash" },
    );

    expect(result.text).toBe("ok");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://api.deepseek.com/chat/completions");
    expect((requests[0]?.init?.headers as Record<string, string>)?.Authorization).toBe("Bearer sk-generic");
  });

  it("uses provider-specific keys when generic key is empty", async () => {
    vi.stubEnv("LLM_PROVIDER", "ark");
    vi.stubEnv("LLM_API_KEY", "EMPTY");
    vi.stubEnv("ARK_API_KEY", "sk-ark");

    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      requests.push({ url, init });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "streamless" } }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });

    await new ModelClient().complete(
      [{ role: "user", content: "ping" }],
      { model: "doubao-seed-1-6-250615" },
    );

    expect(requests[0]?.url).toBe("https://ark.cn-beijing.volces.com/api/v3/chat/completions");
    expect((requests[0]?.init?.headers as Record<string, string>)?.Authorization).toBe("Bearer sk-ark");
  });
});

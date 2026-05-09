import type { EmbeddingClient } from "@kirakira/memory-vector";

interface OpenAiEmbeddingJson {
  data?: Array<{ embedding: number[]; index: number }>;
  error?: { message: string };
}

/**
 * OpenAI-compatible embeddings API (`/v1/embeddings`) via `fetch`.
 */
export class HttpEmbeddingClient implements EmbeddingClient {
  constructor(
    private readonly opts: {
      model: string;
      apiKey?: string;
      baseUrl?: string;
    },
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const base = this.opts.baseUrl ?? "https://api.openai.com/v1";
    const url = `${base.replace(/\/$/, "")}/embeddings`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.opts.apiKey ? { Authorization: `Bearer ${this.opts.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.opts.model,
        input: texts.length === 1 ? texts[0] : texts,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`embedding request failed: ${res.status} ${t}`);
    }
    const json = (await res.json()) as OpenAiEmbeddingJson;
    if (json.error?.message) {
      throw new Error(json.error.message);
    }
    const rows = json.data ?? [];
    const sorted = [...rows].sort((a, b) => a.index - b.index);
    return sorted.map((r) => r.embedding);
  }
}

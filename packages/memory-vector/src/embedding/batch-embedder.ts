import type { EmbeddingClient } from "./embedding-client.js";

export interface BatchEmbedderOptions {
  readonly batchSize: number;
  /** Minimum delay in ms between outbound batch calls (simple rate limit). */
  readonly minIntervalMs?: number;
}

/**
 * Batches calls to an {@link EmbeddingClient} and optionally spaces requests.
 */
export class BatchEmbedder {
  private readonly client: EmbeddingClient;
  private readonly batchSize: number;
  private readonly minIntervalMs: number;
  private lastCall = 0;

  constructor(client: EmbeddingClient, options: BatchEmbedderOptions) {
    this.client = client;
    this.batchSize = Math.max(1, options.batchSize);
    this.minIntervalMs = options.minIntervalMs ?? 0;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      await this.pace();
      const chunk = texts.slice(i, i + this.batchSize);
      const part = await this.client.embed(chunk);
      out.push(...part);
    }
    return out;
  }

  private async pace(): Promise<void> {
    if (this.minIntervalMs <= 0) {
      return;
    }
    const now = Date.now();
    const wait = this.lastCall + this.minIntervalMs - now;
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    this.lastCall = Date.now();
  }
}

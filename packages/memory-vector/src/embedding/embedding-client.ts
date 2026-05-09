export interface EmbeddingClient {
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * Abstract base that enforces the {@link EmbeddingClient} contract.
 * Instantiate a concrete provider (e.g. `HttpEmbeddingClient`) instead.
 */
export class BaseEmbeddingClient implements EmbeddingClient {
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }
    throw new Error(
      "BaseEmbeddingClient.embed must be overridden by a concrete provider",
    );
  }
}

import { QdrantClient } from "@qdrant/js-client-rest";

export const QDRANT_DENSE_VECTOR = "dense";
export const QDRANT_SPARSE_VECTOR = "sparse";

export class QdrantClientWrapper {
  readonly client: QdrantClient;

  constructor(
    host: string,
    port: number,
    apiKey?: string,
    https?: boolean,
  ) {
    this.client = new QdrantClient({
      host,
      port,
      apiKey,
      https: https ?? false,
    });
  }
}

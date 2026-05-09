import { EamError } from "@kirakira/core";

export const EMBEDDING_DIMENSIONS: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536,
  "bge-m3": 1024,
  "jina-embeddings-v4": 1024,
};

export function getDimension(model: string): number {
  const dim = EMBEDDING_DIMENSIONS[model];
  if (!dim) {
    throw new EamError(
      "UNKNOWN_EMBEDDING_MODEL",
      `Unknown embedding model: ${model}`,
    );
  }
  return dim;
}

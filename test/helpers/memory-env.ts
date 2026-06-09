/** Shared env defaults for memory integration tests (no heavy imports). */
function firstEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

function urlHost(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  try {
    return new URL(value).hostname || fallback;
  } catch {
    return fallback;
  }
}

function urlPort(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  try {
    const port = new URL(value).port;
    if (!port) return fallback;
    const parsed = Number(port);
    return Number.isInteger(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function numberEnv(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

const qdrantUrl = firstEnv("TEST_QDRANT_URL", "QDRANT_URL");

export const TEST_PG_URL = firstEnv(
  "TEST_PG_URL",
  "DATABASE_URL",
) ?? "postgres://kirakira_test:kirakira_test@127.0.0.1:5432/kirakira_test";
export const TEST_REDIS_URL = firstEnv("TEST_REDIS_URL", "REDIS_URL") ?? "redis://127.0.0.1:6379";
export const TEST_QDRANT_HOST = firstEnv("TEST_QDRANT_HOST") ?? urlHost(qdrantUrl, "127.0.0.1");
export const TEST_QDRANT_PORT = numberEnv(firstEnv("TEST_QDRANT_PORT"), urlPort(qdrantUrl, 6333));
export const TEST_NEO4J_URI = firstEnv("TEST_NEO4J_URI", "NEO4J_URI") ?? "bolt://127.0.0.1:7687";
export const TEST_NEO4J_USER = firstEnv("TEST_NEO4J_USER", "KIRAKIRA_NEO4J_USER") ?? "neo4j";
export const TEST_NEO4J_PASSWORD = firstEnv("TEST_NEO4J_PASSWORD", "KIRAKIRA_NEO4J_PASSWORD") ?? "testpassword";
export const TEST_MINIO_ENDPOINT = firstEnv("TEST_MINIO_ENDPOINT", "S3_ENDPOINT", "S3_ENDPOINT_URL")
  ?? "http://127.0.0.1:9000";

/** Shared env defaults for memory integration tests (no heavy imports). */
export const TEST_PG_URL = process.env["TEST_PG_URL"] ?? "postgres://kirakira_test:kirakira_test@127.0.0.1:5432/kirakira_test";
export const TEST_REDIS_URL = process.env["TEST_REDIS_URL"] ?? "redis://127.0.0.1:6379/0";
export const TEST_QDRANT_HOST = process.env["TEST_QDRANT_HOST"] ?? "127.0.0.1";
export const TEST_QDRANT_PORT = Number(process.env["TEST_QDRANT_PORT"] ?? "6333");
export const TEST_NEO4J_URI = process.env["TEST_NEO4J_URI"] ?? "bolt://127.0.0.1:7687";
export const TEST_NEO4J_USER = process.env["TEST_NEO4J_USER"] ?? "neo4j";
export const TEST_NEO4J_PASSWORD = process.env["TEST_NEO4J_PASSWORD"] ?? "testpassword";
export const TEST_MINIO_ENDPOINT = process.env["TEST_MINIO_ENDPOINT"] ?? "http://127.0.0.1:9000";

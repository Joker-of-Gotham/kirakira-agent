/** Shared env defaults for memory integration tests (no heavy imports). */
export const TEST_PG_URL = process.env["TEST_PG_URL"] ?? "postgres://kirakira_test:kirakira_test@postgres:5432/kirakira_test";
export const TEST_REDIS_URL = process.env["TEST_REDIS_URL"] ?? "redis://redis:6379/0";
export const TEST_QDRANT_HOST = process.env["TEST_QDRANT_HOST"] ?? "qdrant";
export const TEST_QDRANT_PORT = Number(process.env["TEST_QDRANT_PORT"] ?? "6333");
export const TEST_NEO4J_URI = process.env["TEST_NEO4J_URI"] ?? "bolt://neo4j:7687";
export const TEST_NEO4J_USER = process.env["TEST_NEO4J_USER"] ?? "neo4j";
export const TEST_NEO4J_PASSWORD = process.env["TEST_NEO4J_PASSWORD"] ?? "testpassword";
export const TEST_MINIO_ENDPOINT = process.env["TEST_MINIO_ENDPOINT"] ?? "http://minio:9000";

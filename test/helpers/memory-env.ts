import {
  loadRuntimeProfiles,
  renderRuntimeEnv,
  resolveRuntimeProfile,
} from "../../scripts/runtime-profile.mjs";

/** Shared env defaults for memory integration tests. */
const testHostRuntimeEnv = renderRuntimeEnv(
  resolveRuntimeProfile("test-host", loadRuntimeProfiles(), process.env),
);

function firstEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value !== "") return value;
    const runtimeValue = testHostRuntimeEnv[name];
    if (runtimeValue !== undefined && runtimeValue !== "") return runtimeValue;
  }
  return undefined;
}

function requiredRuntimeEnv(name: string): string {
  const value = testHostRuntimeEnv[name];
  if (value !== undefined && value !== "") return value;
  throw new Error(`test-host runtime profile did not render ${name}`);
}

function urlHost(value: string | undefined, label: string): string {
  if (!value) throw new Error(`${label} is required`);
  try {
    const host = new URL(value).hostname;
    if (host) return host;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} must be a valid URL: ${message}`);
  }
  throw new Error(`${label} must include a host`);
}

function urlPort(value: string | undefined, label: string): number {
  if (!value) throw new Error(`${label} is required`);
  try {
    const port = new URL(value).port;
    if (!port) throw new Error("missing port");
    const parsed = Number(port);
    if (Number.isInteger(parsed)) return parsed;
    throw new Error(`invalid port ${port}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} must include a valid URL port: ${message}`);
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
) ?? requiredRuntimeEnv("DATABASE_URL");
export const TEST_REDIS_URL = firstEnv("TEST_REDIS_URL", "REDIS_URL") ?? requiredRuntimeEnv("REDIS_URL");
export const TEST_QDRANT_HOST = firstEnv("TEST_QDRANT_HOST") ?? urlHost(qdrantUrl, "QDRANT_URL");
export const TEST_QDRANT_PORT = numberEnv(
  firstEnv("TEST_QDRANT_PORT"),
  urlPort(qdrantUrl, "QDRANT_URL"),
);
export const TEST_NEO4J_URI = firstEnv("TEST_NEO4J_URI", "NEO4J_URI") ?? requiredRuntimeEnv("NEO4J_URI");
export const TEST_NEO4J_USER = firstEnv(
  "TEST_NEO4J_USER",
  "KIRAKIRA_NEO4J_USER",
) ?? requiredRuntimeEnv("KIRAKIRA_NEO4J_USER");
export const TEST_NEO4J_PASSWORD = firstEnv(
  "TEST_NEO4J_PASSWORD",
  "KIRAKIRA_NEO4J_PASSWORD",
) ?? requiredRuntimeEnv("KIRAKIRA_NEO4J_PASSWORD");
export const TEST_MINIO_ENDPOINT = firstEnv("TEST_MINIO_ENDPOINT", "S3_ENDPOINT", "S3_ENDPOINT_URL")
  ?? requiredRuntimeEnv("S3_ENDPOINT");

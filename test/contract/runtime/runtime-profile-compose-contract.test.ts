import { describe, expect, it } from "vitest";

import { loadRuntimeProfiles, resolveRuntimeProfile } from "../../../scripts/runtime-profile.mjs";
import {
  composeService,
  environmentValue,
  loadComposeFile,
  publishedPortForTarget,
} from "../../helpers/runtime-compose.js";

function serviceUrl(profile: ReturnType<typeof resolveRuntimeProfile>, name: string): URL {
  const value = profile.services?.[name];
  if (typeof value !== "string") {
    throw new Error(`Profile service is missing: ${name}`);
  }
  return new URL(value);
}

function expectHostPort(url: URL, expectedPort: number): void {
  expect(url.hostname).toBe("127.0.0.1");
  expect(Number(url.port)).toBe(expectedPort);
}

describe("runtime profile compose contracts", () => {
  it("keeps test-host services aligned with docker-compose.test.yml", () => {
    const profile = resolveRuntimeProfile("test-host", loadRuntimeProfiles(), {});
    const compose = loadComposeFile("docker-compose.test.yml", import.meta.url);

    expect(profile.composeFiles).toEqual(["docker-compose.test.yml"]);
    expect(Object.keys(profile.services ?? {}).sort()).toEqual([
      "minio",
      "neo4j",
      "postgres",
      "qdrant",
      "redis",
    ]);

    const postgres = composeService(compose, "postgres");
    const postgresUrl = serviceUrl(profile, "postgres");
    expectHostPort(postgresUrl, publishedPortForTarget(postgres, 5432));
    expect(decodeURIComponent(postgresUrl.username)).toBe(environmentValue(postgres, "POSTGRES_USER"));
    expect(decodeURIComponent(postgresUrl.password)).toBe(environmentValue(postgres, "POSTGRES_PASSWORD"));
    expect(postgresUrl.pathname.slice(1)).toBe(environmentValue(postgres, "POSTGRES_DB"));

    expectHostPort(serviceUrl(profile, "redis"), publishedPortForTarget(composeService(compose, "redis"), 6379));
    expectHostPort(serviceUrl(profile, "qdrant"), publishedPortForTarget(composeService(compose, "qdrant"), 6333));
    expectHostPort(serviceUrl(profile, "neo4j"), publishedPortForTarget(composeService(compose, "neo4j"), 7687));
    expectHostPort(serviceUrl(profile, "minio"), publishedPortForTarget(composeService(compose, "minio"), 9000));
  });
});

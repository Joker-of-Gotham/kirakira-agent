import { describe, expect, it } from "vitest";

import {
  loadRuntimeProfiles,
  renderRuntimeEnv,
  resolveRuntimeProfile,
} from "../../../scripts/runtime-profile.mjs";
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

const emptyEnv = {};

function runtimeServiceCatalog(config: ReturnType<typeof loadRuntimeProfiles>) {
  const catalog = config.serviceCatalog?.services;
  if (!catalog || typeof catalog !== "object") {
    throw new Error("Runtime service catalog is missing");
  }
  return catalog;
}

function expectCatalogPortsInCompose(
  config: ReturnType<typeof loadRuntimeProfiles>,
  compose: ReturnType<typeof loadComposeFile>,
  serviceName: string,
): void {
  const catalogService = runtimeServiceCatalog(config)[serviceName];
  if (!catalogService || typeof catalogService !== "object") {
    throw new Error(`Catalog service is missing: ${serviceName}`);
  }
  const composeName = typeof catalogService.composeService === "string"
    ? catalogService.composeService
    : serviceName;
  const service = composeService(compose, composeName);
  const ports = catalogService.ports;
  if (!ports || typeof ports !== "object") {
    throw new Error(`Catalog service is missing ports: ${serviceName}`);
  }
  const rawPorts = service.ports ?? [];
  for (const port of Object.values(ports)) {
    if (!port || typeof port !== "object") continue;
    expect(rawPorts).toContain(`\${${port.env}:-${port.default}}:${port.target}`);
  }
}

describe("runtime profile compose contracts", () => {
  it("keeps the service catalog aligned with compose published port interpolation", () => {
    const config = loadRuntimeProfiles();
    const workbenchProfile = resolveRuntimeProfile("workbench-host", config, emptyEnv);
    const testProfile = resolveRuntimeProfile("test-host", config, emptyEnv);
    const portsCompose = loadComposeFile("docker-compose.ports.yml", import.meta.url);
    const testCompose = loadComposeFile("docker-compose.test.yml", import.meta.url);

    for (const serviceName of workbenchProfile.workbench?.infraServices ?? []) {
      expectCatalogPortsInCompose(config, portsCompose, serviceName);
    }
    for (const serviceName of Object.keys(testProfile.services ?? {})) {
      expectCatalogPortsInCompose(config, testCompose, serviceName);
    }
  });

  it("keeps test-host services aligned with docker-compose.test.yml", () => {
    const profile = resolveRuntimeProfile("test-host", loadRuntimeProfiles(), emptyEnv);
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
    expectHostPort(postgresUrl, publishedPortForTarget(postgres, 5432, emptyEnv));
    expect(decodeURIComponent(postgresUrl.username)).toBe(environmentValue(postgres, "POSTGRES_USER", emptyEnv));
    expect(decodeURIComponent(postgresUrl.password)).toBe(
      environmentValue(postgres, "POSTGRES_PASSWORD", emptyEnv),
    );
    expect(postgresUrl.pathname.slice(1)).toBe(environmentValue(postgres, "POSTGRES_DB", emptyEnv));

    expectHostPort(serviceUrl(profile, "redis"), publishedPortForTarget(composeService(compose, "redis"), 6379, emptyEnv));
    expectHostPort(serviceUrl(profile, "qdrant"), publishedPortForTarget(composeService(compose, "qdrant"), 6333, emptyEnv));
    expectHostPort(serviceUrl(profile, "neo4j"), publishedPortForTarget(composeService(compose, "neo4j"), 7687, emptyEnv));
    expectHostPort(serviceUrl(profile, "minio"), publishedPortForTarget(composeService(compose, "minio"), 9000, emptyEnv));
  });

  it("keeps workbench-host services aligned with docker-compose published ports", () => {
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles(), emptyEnv);
    const baseCompose = loadComposeFile("docker-compose.yml", import.meta.url);
    const portsCompose = loadComposeFile("docker-compose.ports.yml", import.meta.url);

    expect(profile.composeFiles).toEqual(["docker-compose.yml", "docker-compose.ports.yml"]);

    const postgres = composeService(baseCompose, "postgres");
    const postgresPorts = composeService(portsCompose, "postgres");
    const postgresUrl = serviceUrl(profile, "postgres");
    expectHostPort(postgresUrl, publishedPortForTarget(postgresPorts, 5432, emptyEnv));
    expect(decodeURIComponent(postgresUrl.username)).toBe(environmentValue(postgres, "POSTGRES_USER", emptyEnv));
    expect(decodeURIComponent(postgresUrl.password)).toBe(
      environmentValue(postgres, "POSTGRES_PASSWORD", emptyEnv),
    );
    expect(postgresUrl.pathname.slice(1)).toBe(environmentValue(postgres, "POSTGRES_DB", emptyEnv));

    expectHostPort(serviceUrl(profile, "redis"), publishedPortForTarget(composeService(portsCompose, "redis"), 6379, emptyEnv));
    expectHostPort(serviceUrl(profile, "qdrant"), publishedPortForTarget(composeService(portsCompose, "qdrant"), 6333, emptyEnv));
    expectHostPort(serviceUrl(profile, "neo4j"), publishedPortForTarget(composeService(portsCompose, "neo4j"), 7687, emptyEnv));
    expectHostPort(serviceUrl(profile, "minio"), publishedPortForTarget(composeService(portsCompose, "minio"), 9000, emptyEnv));
    expectHostPort(serviceUrl(profile, "kirakirad"), publishedPortForTarget(composeService(portsCompose, "kirakirad"), 17777, emptyEnv));
  });

  it("applies endpoint overrides to both profile URLs and compose interpolation", () => {
    const env = {
      KIRAKIRA_POSTGRES_PORT: "15432",
      KIRAKIRA_POSTGRES_USER: "devuser",
      KIRAKIRA_POSTGRES_PASSWORD: "devpass",
      KIRAKIRA_POSTGRES_DB: "devdb",
      KIRAKIRA_BROWSER_GATEWAY_PORT: "17383",
      KIRAKIRA_WEB_PORT: "5184",
      KIRAKIRA_DESKTOP_RENDERER_PORT: "5175",
    };
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles(), env);
    const runtimeEnv = renderRuntimeEnv(profile);
    const baseCompose = loadComposeFile("docker-compose.yml", import.meta.url);
    const portsCompose = loadComposeFile("docker-compose.ports.yml", import.meta.url);

    const postgresUrl = serviceUrl(profile, "postgres");
    expectHostPort(postgresUrl, 15432);
    expect(decodeURIComponent(postgresUrl.username)).toBe("devuser");
    expect(decodeURIComponent(postgresUrl.password)).toBe("devpass");
    expect(postgresUrl.pathname.slice(1)).toBe("devdb");
    expect(publishedPortForTarget(composeService(portsCompose, "postgres"), 5432, env)).toBe(15432);
    expect(environmentValue(composeService(baseCompose, "postgres"), "POSTGRES_USER", env)).toBe("devuser");

    expect(runtimeEnv.KIRAKIRA_WEB_URL).toBe("http://127.0.0.1:5184");
    expect(runtimeEnv.KIRAKIRA_DESKTOP_RENDERER_URL).toBe("http://127.0.0.1:5175");
    expect(runtimeEnv.VITE_KIRAKIRA_GATEWAY_URL).toBe("ws://127.0.0.1:17383/runtime");
    expect(runtimeEnv.KIRAKIRA_BROWSER_GATEWAY_ALLOWED_ORIGINS).toBe(
      "http://127.0.0.1:5184,http://127.0.0.1:5175",
    );
    expect(JSON.stringify({ profile, runtimeEnv })).not.toContain("5173");
  });
});

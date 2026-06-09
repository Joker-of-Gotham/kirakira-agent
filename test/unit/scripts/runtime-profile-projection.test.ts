import { describe, expect, it } from "vitest";
import {
  buildRuntimeProfileProjection,
  loadRuntimeProfiles,
  resolveRuntimeProfile,
} from "../../../scripts/runtime-profile.mjs";

function clonedRuntimeProfiles() {
  return JSON.parse(JSON.stringify(loadRuntimeProfiles()));
}

function checkByName(plan, name) {
  return new Map((plan.checks ?? []).map((check) => [check.name, check])).get(name);
}

function servicesFrom(plan) {
  return (plan.services ?? []).map((service) => service.name);
}

describe("runtime profile projection", () => {
  it("threads resolved profile composition into readiness, startup, and MCP fragments", () => {
    const cases = [
      {
        name: "container",
        composeFiles: ["docker-compose.profile-container.yml"],
        composeProfiles: ["profile-proof"],
        roots: {
          workspaceRoot: "/profile/container-workspace",
          appRoot: "/profile/container-app",
        },
      },
      {
        name: "test-host",
        composeProject: "kirakira-agent-profile-proof",
        composeFiles: ["docker-compose.profile-test.yml"],
        composeProfiles: [],
        roots: {
          workspaceRoot: ".profile-test-workspace",
          appRoot: ".profile-test-app",
        },
      },
      {
        name: "workbench-host",
        composeFiles: ["docker-compose.profile-workbench.yml", "docker-compose.profile-ports.yml"],
        composeProfiles: [],
        roots: {
          workspaceRoot: ".profile-workbench-workspace",
          appRoot: ".profile-workbench-app",
        },
      },
    ];

    for (const testCase of cases) {
      const config = clonedRuntimeProfiles();
      const profileConfig = config.profiles[testCase.name];
      profileConfig.composeFiles = testCase.composeFiles;
      profileConfig.composeProfiles = testCase.composeProfiles;
      if (testCase.composeProject) {
        profileConfig.composeProject = testCase.composeProject;
      }
      profileConfig.mcp = {
        ...(profileConfig.mcp ?? {}),
        ...testCase.roots,
      };

      const profile = resolveRuntimeProfile(testCase.name, config, {});
      const projection = buildRuntimeProfileProjection(profile, { config });
      const { compose, readiness, startup, mcpConfig } = projection.fragments;

      expect(compose).toMatchObject({
        profile: testCase.name,
        mode: profile.mode,
        files: testCase.composeFiles,
        profiles: testCase.composeProfiles,
      });
      if (testCase.composeProject) {
        expect(compose.project).toBe(testCase.composeProject);
      }

      expect(readiness).toMatchObject({
        profile: testCase.name,
        mode: profile.mode,
      });
      expect(readiness.compose?.files).toEqual(compose.files);
      expect(readiness.compose?.profiles).toEqual(compose.profiles);
      expect(readiness.compose?.project).toBe(compose.project);

      expect(startup).toMatchObject({
        profile: testCase.name,
        mode: profile.mode,
      });
      expect(startup.compose).toEqual(readiness.compose);
      expect(startup.readiness.checks).toEqual(readiness.checks.map((check) => check.name));
      expect(startup.mcp).toEqual({
        roots: mcpConfig.roots,
        serverRefs: mcpConfig.serverRefs,
        servers: mcpConfig.servers,
      });
      if (startup.container) {
        expect(startup.container.compose).toEqual(readiness.compose);
        expect(startup.container.runtimeServices).toEqual(readiness.compose?.services);
      }

      expect(mcpConfig).toMatchObject({
        profile: testCase.name,
        mode: profile.mode,
        roots: testCase.roots,
      });
      expect(projection.mcp.roots).toEqual(mcpConfig.roots);
      expect(projection.mcp.config.mcpServers["filesystem-core"].args.at(-1))
        .toBe(testCase.roots.workspaceRoot);

      for (const surfacePlan of Object.values(startup.surfaces ?? {})) {
        expect(surfacePlan.profile).toBe(testCase.name);
        expect(surfacePlan.readiness.compose?.files).toEqual(compose.files);
        expect(surfacePlan.readiness.compose?.profiles).toEqual(compose.profiles);
        expect(surfacePlan.steps[0]).toMatchObject({
          name: "infra",
          command: "docker",
          args: surfacePlan.readiness.compose?.args,
        });
      }
    }
  });

  it("threads workbench endpoint defaults through root and surface readiness", () => {
    const config = clonedRuntimeProfiles();
    const workbench = config.profiles["workbench-host"];
    workbench.daemon.browserGateway.port.default = 18373;
    workbench.presentation.web.port.default = 6183;
    workbench.presentation.desktop.port.default = 6174;

    const profile = resolveRuntimeProfile("workbench-host", config, {});
    const projection = buildRuntimeProfileProjection(profile, { config });
    const { env, readiness, startup } = projection.fragments;

    const gatewayHealth = "http://127.0.0.1:18373/healthz";
    const gatewayEndpoint = "ws://127.0.0.1:18373/runtime";
    const webTarget = "http://127.0.0.1:6183/";
    const desktopTarget = "http://127.0.0.1:6174/";

    expect(env.values.KIRAKIRA_WEB_URL).toBe("http://127.0.0.1:6183/");
    expect(env.values.KIRAKIRA_DESKTOP_RENDERER_URL).toBe(desktopTarget);
    expect(env.values.VITE_KIRAKIRA_GATEWAY_URL).toBe(gatewayEndpoint);
    expect(env.values.KIRAKIRA_BROWSER_GATEWAY_ALLOWED_ORIGINS)
      .toBe("http://127.0.0.1:6183,http://127.0.0.1:6174");

    expect(checkByName(readiness, "daemon:browser-gateway")).toMatchObject({
      source: "daemon.browserGateway",
      target: gatewayHealth,
      endpoint: gatewayEndpoint,
    });
    expect(checkByName(readiness, "presentation:web")).toMatchObject({
      source: "presentation.web.url",
      target: webTarget,
    });
    expect(checkByName(readiness, "presentation:desktop")).toMatchObject({
      source: "presentation.desktop.rendererUrl",
      target: desktopTarget,
    });

    for (const surface of ["web", "desktop"]) {
      const surfaceReadiness = startup.surfaces[surface].readiness;
      expect(checkByName(surfaceReadiness, "daemon:browser-gateway")?.target)
        .toBe(gatewayHealth);
      expect(checkByName(surfaceReadiness, "presentation:web")?.target)
        .toBe(webTarget);
      expect(checkByName(surfaceReadiness, "presentation:desktop")?.target)
        .toBe(desktopTarget);
    }

    expect(startup.surfaces.web.steps.at(-1)).toMatchObject({
      name: "web",
      waitFor: ["daemon:browser-gateway"],
    });
    expect(startup.surfaces.desktop.steps.at(-1)).toMatchObject({
      name: "desktop-shell",
      waitFor: ["daemon:socket", "daemon:browser-gateway", "presentation:desktop"],
    });
  });

  it("threads memory stack evidence into startup, readiness, and service projection", () => {
    const config = clonedRuntimeProfiles();

    for (const profileName of ["container", "test-host", "workbench-host"]) {
      const profile = resolveRuntimeProfile(profileName, config, {});
      const projection = buildRuntimeProfileProjection(profile, { config });
      const { readiness, memoryStack, startup } = projection.fragments;
      const memoryServices = servicesFrom(memoryStack);

      expect(memoryStack).toMatchObject({
        profile: profileName,
        mode: profile.mode,
        enabled: true,
      });
      expect(memoryServices).toEqual(["postgres", "redis", "qdrant", "neo4j", "minio"]);
      expect(startup.memory).toEqual({
        enabled: true,
        services: memoryServices,
        compose: memoryStack.compose,
        env: memoryStack.env.map((entry) => entry.name),
      });
      expect(memoryStack.compose?.files).toEqual(projection.fragments.compose.files);
      expect(memoryStack.compose?.profiles).toEqual(projection.fragments.compose.profiles);
      expect(memoryStack.checks.map((check) => check.name))
        .toEqual(memoryServices.map((service) => `service:${service}`));

      for (const serviceName of memoryServices) {
        const readinessCheck = checkByName(readiness, `service:${serviceName}`);
        const memoryCheck = checkByName(memoryStack, `service:${serviceName}`);
        const projectedService = projection.services.find((service) => service.name === serviceName);

        expect(readinessCheck).toMatchObject({
          type: "compose-service",
          service: serviceName,
        });
        expect(memoryCheck).toEqual(readinessCheck);
        expect(projectedService).toMatchObject({
          sources: expect.arrayContaining(["readiness", "memory-stack"]),
          readiness: {
            name: `service:${serviceName}`,
            type: "compose-service",
          },
          memoryStack: {
            enabled: true,
            source: "memory.services",
          },
        });
      }
    }
  });
});

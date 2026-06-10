import { describe, expect, it } from "vitest";
import {
  RUNTIME_DAEMON_READINESS_CHECKS,
  RUNTIME_PRESENTATION_READINESS_CHECKS,
  RUNTIME_READINESS_CHECKS,
  RUNTIME_READINESS_CHECK_TYPES,
  RUNTIME_READINESS_HEALTH_SCHEMAS,
  RUNTIME_SURFACE_READINESS_CHECKS,
  RUNTIME_WORKBENCH_SURFACE_READINESS_CHECKS,
  runtimePresentationReadinessCheckName,
  runtimeServiceReadinessCheckName,
  runtimeSurfaceReadinessCheckNames,
  runtimeWorkbenchSurfaceReadinessCheckNames,
} from "../../../packages/runtime-contracts/src/index.js";
import {
  RUNTIME_DAEMON_READINESS_CHECKS as SCRIPT_RUNTIME_DAEMON_READINESS_CHECKS,
  RUNTIME_PRESENTATION_READINESS_CHECKS as SCRIPT_RUNTIME_PRESENTATION_READINESS_CHECKS,
  RUNTIME_READINESS_CHECKS as SCRIPT_RUNTIME_READINESS_CHECKS,
  RUNTIME_READINESS_CHECK_TYPES as SCRIPT_RUNTIME_READINESS_CHECK_TYPES,
  RUNTIME_READINESS_HEALTH_SCHEMAS as SCRIPT_RUNTIME_READINESS_HEALTH_SCHEMAS,
  RUNTIME_SURFACE_READINESS_CHECKS as SCRIPT_RUNTIME_SURFACE_READINESS_CHECKS,
} from "../../../scripts/runtime-profile.mjs";

describe("runtime readiness identity contract", () => {
  it("defines canonical runtime readiness ids without unrelated Vite ports", () => {
    expect(RUNTIME_READINESS_CHECK_TYPES).toMatchObject({
      http: "http",
      httpHealth: "http-health",
      socket: "socket",
      composeService: "compose-service",
      externalService: "external-service",
      orchestrationTopology: "orchestration-topology",
    });
    expect(RUNTIME_READINESS_HEALTH_SCHEMAS.browserGateway).toBe("browser-gateway-health");
    expect(RUNTIME_READINESS_CHECKS).toMatchObject({
      daemonSocket: "daemon:socket",
      daemonBrowserGateway: "daemon:browser-gateway",
      orchestrationTopology: "orchestration:topology",
    });
    expect(RUNTIME_PRESENTATION_READINESS_CHECKS).toEqual({
      web: "presentation:web",
      desktop: "presentation:desktop",
    });
    expect(JSON.stringify({
      RUNTIME_READINESS_CHECK_TYPES,
      RUNTIME_READINESS_HEALTH_SCHEMAS,
      RUNTIME_READINESS_CHECKS,
      RUNTIME_PRESENTATION_READINESS_CHECKS,
    })).not.toContain("5173");
  });

  it("keeps surface and generated check names centralized", () => {
    expect(runtimeServiceReadinessCheckName("postgres")).toBe("service:postgres");
    expect(runtimePresentationReadinessCheckName("desktop")).toBe("presentation:desktop");
    expect(RUNTIME_DAEMON_READINESS_CHECKS).toEqual([
      "daemon:socket",
      "daemon:browser-gateway",
    ]);
    expect(RUNTIME_SURFACE_READINESS_CHECKS.web).toEqual([
      "presentation:web",
    ]);
    expect(RUNTIME_SURFACE_READINESS_CHECKS.desktop).toEqual([
      "presentation:desktop",
    ]);
    expect(runtimeSurfaceReadinessCheckNames("mobile")).toEqual(["presentation:mobile"]);
    expect(RUNTIME_WORKBENCH_SURFACE_READINESS_CHECKS.web).toEqual([
      "daemon:browser-gateway",
      "presentation:web",
    ]);
    expect(RUNTIME_WORKBENCH_SURFACE_READINESS_CHECKS.desktop).toEqual([
      "daemon:socket",
      "daemon:browser-gateway",
      "presentation:desktop",
    ]);
    expect(runtimeWorkbenchSurfaceReadinessCheckNames("mobile")).toEqual([
      "daemon:browser-gateway",
      "presentation:mobile",
    ]);
  });

  it("matches the node runtime-profile script constants until scripts consume the contract directly", () => {
    expect(SCRIPT_RUNTIME_READINESS_CHECK_TYPES).toEqual(RUNTIME_READINESS_CHECK_TYPES);
    expect(SCRIPT_RUNTIME_READINESS_HEALTH_SCHEMAS).toEqual(RUNTIME_READINESS_HEALTH_SCHEMAS);
    expect(SCRIPT_RUNTIME_READINESS_CHECKS).toEqual(RUNTIME_READINESS_CHECKS);
    expect(SCRIPT_RUNTIME_PRESENTATION_READINESS_CHECKS).toEqual(
      RUNTIME_PRESENTATION_READINESS_CHECKS,
    );
    expect(SCRIPT_RUNTIME_DAEMON_READINESS_CHECKS).toEqual(RUNTIME_DAEMON_READINESS_CHECKS);
    expect(SCRIPT_RUNTIME_SURFACE_READINESS_CHECKS).toEqual(RUNTIME_SURFACE_READINESS_CHECKS);
  });
});

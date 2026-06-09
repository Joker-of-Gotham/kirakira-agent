import { describe, expect, it } from "vitest";
import {
  DEFAULT_BROWSER_GATEWAY_ENDPOINT,
  isRuntimeBrowserGatewayHealth,
  isRuntimeDaemonHealth,
  isRuntimeManifest,
  renderRuntimeEndpoint,
  runtimeBrowserGatewayHealth,
  runtimeDaemonHealth,
  runtimeManifest,
  runtimeServiceHealth,
  sanitizeRuntimeDaemonHealth,
  sanitizeRuntimeManifest,
} from "../../../packages/runtime-contracts/src/index.js";

const collectKeys = (value: unknown): string[] => {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(collectKeys);
  return Object.entries(value).flatMap(([key, nested]) => [key, ...collectKeys(nested)]);
};

describe("runtime status contract", () => {
  it("builds service health states without secrets", () => {
    expect(runtimeServiceHealth(true)).toEqual({ ok: true, state: "healthy" });
    expect(runtimeServiceHealth(false)).toEqual({ ok: false, state: "unavailable" });
    expect(runtimeServiceHealth(false, { disabled: true })).toEqual({
      ok: false,
      state: "disabled",
    });
  });

  it("builds browser gateway health from typed endpoints", () => {
    const endpoint = renderRuntimeEndpoint(DEFAULT_BROWSER_GATEWAY_ENDPOINT);
    const health = runtimeBrowserGatewayHealth({
      endpoint,
      tokenRequired: true,
    });

    expect(health).toMatchObject({
      schemaVersion: 1,
      ok: true,
      transport: "browser-gateway",
      endpoint,
      tokenRequired: true,
    });
    expect(isRuntimeBrowserGatewayHealth(health)).toBe(true);
    expect(JSON.stringify(health)).not.toContain("secret-token");
    expect(collectKeys(health)).not.toContain("token");
    expect(isRuntimeManifest(health.manifest)).toBe(true);
    expect(health.manifest.endpoints.browserGateway?.endpoint.url).toBe(
      "ws://127.0.0.1:17373/runtime",
    );
  });

  it("builds and sanitizes the public runtime manifest", () => {
    const endpoint = renderRuntimeEndpoint(DEFAULT_BROWSER_GATEWAY_ENDPOINT);
    const manifest = runtimeManifest({
      socketPath: "\\\\.\\pipe\\kirakira-agent-test",
      browserGateway: {
        endpoint: { ...endpoint, token: "secret-token" },
        tokenRequired: true,
      },
      capabilities: {
        subagents: { state: "enabled" },
        deep_research: { state: "enabled" },
        memory: { state: "enabled" },
        mcp: { state: "enabled" },
      },
    });

    const sanitized = sanitizeRuntimeManifest(manifest);

    expect(isRuntimeManifest(sanitized)).toBe(true);
    expect(sanitized.runtime).toBe("kirakira-agent");
    expect(sanitized.contract.protocol).toBe("runtime-v1");
    expect(sanitized.endpoints.browserGateway?.endpoint.url).toBe(
      "ws://127.0.0.1:17373/runtime",
    );
    expect(sanitized.capabilities.subagents.state).toBe("enabled");
    expect(sanitized.capabilities.deep_research.eventKinds).toContain("research.completed");
    expect(sanitized.capabilities.artifacts.clientMessageTypes).toContain("get_artifact");
    expect(sanitized.capabilities.artifacts.limits?.defaultPreviewBytes).toBe(65_536);
    expect(sanitized.capabilities.artifacts.limits?.hardMaxPreviewBytes).toBe(524_288);
    expect(sanitized.security.explicitToolConsentRequired).toBe(true);
    expect(JSON.stringify(sanitized)).not.toContain("secret-token");
    expect(collectKeys(sanitized)).not.toContain("token");
  });

  it("builds daemon health with legacy booleans and typed service details", () => {
    const endpoint = renderRuntimeEndpoint(DEFAULT_BROWSER_GATEWAY_ENDPOINT);
    const health = runtimeDaemonHealth({
      gateway: true,
      kernel: true,
      socket: true,
      socketPath: "\\\\.\\pipe\\kirakira-agent-test",
      browserGateway: {
        endpoint,
        tokenRequired: false,
      },
    });

    expect(health.ok).toBe(true);
    expect(health.gateway).toBe(true);
    expect(health.browserGateway).toBe(true);
    expect(health.services.browserGateway.endpoint?.url).toBe(
      "ws://127.0.0.1:17373/runtime",
    );
    expect(health.details.browserGateway?.tokenRequired).toBe(false);
    expect(Object.keys(health.details.browserGateway ?? {})).toEqual([
      "endpoint",
      "tokenRequired",
    ]);
    expect(collectKeys(health)).not.toContain("token");
    expect(isRuntimeDaemonHealth(health)).toBe(true);
    expect(health.details.manifest.capabilities.event_stream.eventKinds).toContain(
      "task.completed",
    );
  });

  it("marks optional browser gateway as disabled without failing daemon health", () => {
    const health = runtimeDaemonHealth({
      gateway: true,
      kernel: true,
      socket: true,
    });

    expect(health.ok).toBe(true);
    expect(health.browserGateway).toBe(false);
    expect(health.services.browserGateway.state).toBe("disabled");
  });

  it("rejects malformed nested daemon health services", () => {
    const health = runtimeDaemonHealth({
      gateway: true,
      kernel: true,
      socket: true,
    });

    expect(
      isRuntimeDaemonHealth({
        ...health,
        services: {
          ...health.services,
          gateway: { ok: true },
        },
      }),
    ).toBe(false);
  });

  it("sanitizes daemon health to the public health contract", () => {
    const endpoint = renderRuntimeEndpoint(DEFAULT_BROWSER_GATEWAY_ENDPOINT);
    const health = {
      ...runtimeDaemonHealth({
        gateway: true,
        kernel: true,
        socket: true,
        browserGateway: {
          endpoint: { ...endpoint, token: "secret-token" },
          tokenRequired: true,
        },
      }),
      token: "secret-token",
      details: {
        socketPath: "\\\\.\\pipe\\kirakira-agent-test",
        browserGateway: {
          endpoint: { ...endpoint, token: "secret-token" },
          tokenRequired: true,
          token: "secret-token",
        },
        manifest: {
          ...runtimeManifest({
            browserGateway: {
              endpoint: { ...endpoint, token: "secret-token" },
              tokenRequired: true,
            },
          }),
          token: "secret-token",
        },
        token: "secret-token",
      },
    };

    const sanitized = sanitizeRuntimeDaemonHealth(health);

    expect(isRuntimeDaemonHealth(sanitized)).toBe(true);
    expect(JSON.stringify(sanitized)).not.toContain("secret-token");
    expect(collectKeys(sanitized)).not.toContain("token");
    expect(Object.keys(sanitized.details.browserGateway ?? {})).toEqual([
      "endpoint",
      "tokenRequired",
    ]);
  });
});

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
import {
  MEMORY_RUN_EVENT_KINDS,
  type RunEventKind,
} from "../../../packages/runtime-contracts/src/events.js";

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
      mcp: {
        profileName: "workbench-host",
        serverGroups: ["workspace"],
        servers: [
          {
            name: "filesystem-core",
            command: "node",
            args: ["packages/mcp-filesystem-core/dist/index.js", "."],
            envKeys: ["KIRAKIRA_WORKSPACE_ROOT"],
          },
        ],
        catalog: {
          defaultServerGroups: ["workspace"],
          groups: { workspace: ["filesystem-core"] },
          servers: ["filesystem-core"],
        },
      },
      orchestration: {
        profileName: "workbench-host",
        handoffMode: "swarm",
        defaultRole: "supervisor",
        lanes: {
          foreground: { capacity: 2 },
          delegated: { capacity: 4 },
        },
        roles: [
          {
            id: "supervisor",
            description: "Plans handoffs.",
            lane: "foreground",
            context: "filtered",
            permissionLabels: ["plan", "delegate"],
          },
          {
            id: "implementer",
            lane: "delegated",
            context: "isolated",
            toolScope: ["filesystem-core.read_file"],
            mcpServers: ["filesystem-core"],
          },
        ],
        handoffs: [
          {
            from: "supervisor",
            to: "implementer",
            mode: "tool",
            inputFilter: "scoped-task-brief",
          },
        ],
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
    expect(sanitized.mcp?.profileName).toBe("workbench-host");
    expect(sanitized.mcp?.servers[0]).toEqual({
      name: "filesystem-core",
      command: "node",
      args: ["packages/mcp-filesystem-core/dist/index.js", "."],
      envKeys: ["KIRAKIRA_WORKSPACE_ROOT"],
    });
    expect(sanitized.orchestration).toMatchObject({
      profileName: "workbench-host",
      handoffMode: "swarm",
      defaultRole: "supervisor",
      lanes: {
        foreground: { capacity: 2 },
        delegated: { capacity: 4 },
      },
      roles: [
        expect.objectContaining({
          id: "supervisor",
          lane: "foreground",
          permissionLabels: ["plan", "delegate"],
        }),
        expect.objectContaining({
          id: "implementer",
          lane: "delegated",
          toolScope: ["filesystem-core.read_file"],
        }),
      ],
      handoffs: [
        expect.objectContaining({
          from: "supervisor",
          to: "implementer",
          inputFilter: "scoped-task-brief",
        }),
      ],
    });
    expect(sanitized.security.explicitToolConsentRequired).toBe(true);
    expect(JSON.stringify(sanitized)).not.toContain("secret-token");
    expect(JSON.stringify(sanitized)).not.toContain("system_preamble");
    expect(collectKeys(sanitized)).not.toContain("token");
  });

  it("advertises memory reflect event kinds from the central event registry", () => {
    const reflectEventKinds: RunEventKind[] = [
      "memory.reflect.started",
      "memory.reflect.completed",
      "memory.reflect.failed",
    ];
    const manifest = runtimeManifest();

    expect(manifest.capabilities.memory.eventKinds).toEqual([
      ...MEMORY_RUN_EVENT_KINDS,
    ]);
    expect(manifest.capabilities.memory.eventKinds).toEqual(
      expect.arrayContaining(reflectEventKinds),
    );
    expect(
      isRuntimeManifest({
        ...manifest,
        capabilities: {
          ...manifest.capabilities,
          memory: {
            ...manifest.capabilities.memory,
            eventKinds: ["memory.reflect.started", "memory.reflect.unknown"],
          },
        },
      }),
    ).toBe(false);
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

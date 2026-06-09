import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import type { ResolvedConfig } from "../../../packages/core/src/index.js";
import { DaemonLifecycle } from "../../../packages/runtime-daemon/src/index.js";
import {
  isRuntimeDaemonHealth,
  isRuntimeManifest,
} from "../../../packages/runtime-contracts/src/index.js";

describe("DaemonLifecycle health", () => {
  it("returns the typed daemon health contract before startup", async () => {
    const daemon = new DaemonLifecycle();
    const health = await daemon.health();

    expect(isRuntimeDaemonHealth(health)).toBe(true);
    expect(health.ok).toBe(false);
    expect(health.gateway).toBe(false);
    expect(health.kernel).toBe(false);
    expect(health.socket).toBe(false);
    expect(health.browserGateway).toBe(false);
    expect(health.services.browserGateway.state).toBe("disabled");
    expect(isRuntimeManifest(health.details.manifest)).toBe(true);
    expect(health.details.manifest.capabilities.subagents.state).toBe("available");
    expect(health.details.manifest.capabilities.artifacts.state).toBe("available");
    expect(health.details.manifest.capabilities.artifacts.clientMessageTypes).toContain(
      "get_artifact",
    );
  });

  it("reports configured daemon runtime capabilities in the public manifest", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-daemon-manifest-"));
    const daemon = new DaemonLifecycle();
    await daemon.start({
      eventStorePath: join(workspaceRoot, "events"),
      socketPath: "\\\\.\\pipe\\kirakira-agent-manifest-test",
      gateway: { disabled: true },
      kernel: {
        enableDaemonSubagents: false,
        resolvedConfig: {
          agentToml: {
            deep_research: {
              enabled: true,
              source_policy: "workspace",
            },
          },
        } as Pick<ResolvedConfig, "agentToml">,
        deepResearch: {
          sourceAdapters: [],
        },
      },
    });

    try {
      const health = await daemon.health();
      expect(isRuntimeDaemonHealth(health)).toBe(true);
      expect(health.details.manifest.endpoints.socketPath).toBe(
        "\\\\.\\pipe\\kirakira-agent-manifest-test",
      );
      expect(health.details.manifest.capabilities.subagents.state).toBe("disabled");
      expect(health.details.manifest.capabilities.artifacts.state).toBe("enabled");
      expect(health.details.manifest.capabilities.deep_research.state).toBe("enabled");
      expect(health.details.manifest.capabilities.memory.state).toBe("available");
      expect(JSON.stringify(health)).not.toContain("secret-token");
    } finally {
      await daemon.stop();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("enables the MCP manifest capability from resolved runtime profile servers", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-daemon-mcp-manifest-"));
    const daemon = new DaemonLifecycle();
    await daemon.start({
      eventStorePath: join(workspaceRoot, "events"),
      socketPath: "\\\\.\\pipe\\kirakira-agent-mcp-manifest-test",
      gateway: { disabled: true },
      kernel: {
        enableDaemonSubagents: false,
        resolvedConfig: {
          agentToml: {
            deep_research: {
              enabled: false,
            },
          },
          runtimeState: {
            default_profile: "workbench-host",
            profiles: [
              {
                name: "workbench-host",
                mode: "hybrid",
                mcp_servers: [
                  {
                    name: "filesystem-core",
                    command: "node",
                  },
                ],
              },
            ],
          },
        } as Pick<ResolvedConfig, "agentToml" | "runtimeState">,
      },
    });

    try {
      const health = await daemon.health();
      expect(isRuntimeDaemonHealth(health)).toBe(true);
      expect(health.details.manifest.capabilities.mcp.state).toBe("enabled");
    } finally {
      await daemon.stop();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});

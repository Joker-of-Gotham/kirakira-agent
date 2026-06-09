import { describe, expect, it } from "vitest";
import {
  runtimeTransportManifest,
  runtimeTransportSupportsArtifactContent,
} from "../../../packages/frontend-core/src/index.js";
import {
  DEFAULT_BROWSER_GATEWAY_ENDPOINT,
  renderRuntimeEndpoint,
  runtimeBrowserGatewayHealth,
  runtimeDaemonHealth,
  runtimeManifest,
} from "../../../packages/runtime-contracts/src/index.js";
import type { RuntimeTransportStatus } from "../../../packages/frontend-core/src/index.js";

const endpoint = renderRuntimeEndpoint(DEFAULT_BROWSER_GATEWAY_ENDPOINT);

describe("frontend runtime capability selectors", () => {
  it("reads capabilities from browser gateway health", () => {
    const status: RuntimeTransportStatus = {
      mode: "browser-gateway",
      state: "healthy",
      label: "Browser gateway",
      health: runtimeBrowserGatewayHealth({
        endpoint,
        tokenRequired: false,
        manifest: runtimeManifest({
          browserGateway: { endpoint, tokenRequired: false },
          capabilities: { artifacts: { state: "enabled" } },
        }),
      }),
    };

    expect(runtimeTransportManifest(status)?.runtime).toBe("kirakira-agent");
    expect(runtimeTransportSupportsArtifactContent(status)).toBe(true);
  });

  it("reads capabilities from daemon health", () => {
    const status: RuntimeTransportStatus = {
      mode: "desktop-ipc",
      state: "healthy",
      label: "Desktop daemon",
      health: runtimeDaemonHealth({
        gateway: true,
        kernel: true,
        socket: true,
        capabilities: { artifacts: { state: "enabled" } },
      }),
    };

    expect(runtimeTransportSupportsArtifactContent(status)).toBe(true);
  });

  it("does not enable artifact content when the runtime only reports availability", () => {
    const status: RuntimeTransportStatus = {
      mode: "browser-gateway",
      state: "healthy",
      label: "Browser gateway",
      health: runtimeBrowserGatewayHealth({
        endpoint,
        tokenRequired: false,
      }),
    };

    expect(runtimeTransportManifest(status)?.capabilities.artifacts.state).toBe("available");
    expect(runtimeTransportSupportsArtifactContent(status)).toBe(false);
  });

  it("keeps the local mock transport usable without a daemon manifest", () => {
    expect(
      runtimeTransportSupportsArtifactContent({
        mode: "mock",
        state: "healthy",
        label: "Mock preview",
      }),
    ).toBe(true);
    expect(runtimeTransportSupportsArtifactContent(undefined)).toBe(false);
  });
});

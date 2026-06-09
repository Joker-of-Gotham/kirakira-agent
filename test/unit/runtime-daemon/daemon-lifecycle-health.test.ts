import { describe, expect, it } from "vitest";
import { DaemonLifecycle } from "../../../packages/runtime-daemon/src/index.js";
import { isRuntimeDaemonHealth } from "../../../packages/runtime-contracts/src/index.js";

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
  });
});

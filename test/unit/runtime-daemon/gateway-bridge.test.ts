import { PassThrough, Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { GatewayBridge } from "../../../packages/runtime-daemon/src/bridge/gateway-bridge.js";

class EpipeWritable extends Writable {
  override _write(
    _chunk: unknown,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    const error = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });
    this.emit("error", error);
    callback(error);
  }
}

describe("GatewayBridge", () => {
  it("treats async stdin EPIPE during health probes as unhealthy instead of crashing", async () => {
    const stdout = new PassThrough();
    const stdin = new EpipeWritable();
    const bridge = new GatewayBridge({
      getChildProcess() {
        return { stdin, stdout };
      },
    } as never);

    await expect(bridge.isHealthy()).resolves.toBe(false);
    await new Promise((resolve) => setImmediate(resolve));
    expect(stdin.listenerCount("error")).toBe(0);
    expect(stdout.listenerCount("data")).toBe(0);
  });
});

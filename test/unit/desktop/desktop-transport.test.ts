import { afterEach, describe, expect, it, vi } from "vitest";
import { createDesktopRuntimeTransport } from "../../../apps/desktop/src/renderer/desktop-transport.js";
import type { KirakiraDesktopRuntimeBridge } from "../../../apps/desktop/src/renderer/global.js";
import type { RuntimeTransportStatus } from "../../../packages/frontend-core/src/index.js";

const bridgeStub = (
  overrides: Partial<KirakiraDesktopRuntimeBridge> = {},
): KirakiraDesktopRuntimeBridge => ({
  connect: vi.fn(async () => {}),
  disconnect: vi.fn(async () => {}),
  getStatus: vi.fn(async () => ({
    mode: "desktop-ipc",
    state: "healthy",
    label: "Desktop IPC",
  })),
  submitPrompt: vi.fn(async () => ({ runId: "run-1" })),
  getState: vi.fn(async (runId: string) => ({ runId, state: {} })),
  subscribeRun: vi.fn(() => () => {}),
  approve: vi.fn(async () => {}),
  cancel: vi.fn(async () => {}),
  drain: vi.fn(async () => {}),
  ...overrides,
});

const setDesktopBridge = (bridge?: KirakiraDesktopRuntimeBridge) => {
  vi.stubGlobal("window", {
    kirakiraRuntime: bridge,
  });
};

describe("desktop runtime transport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when the preload bridge is unavailable", () => {
    setDesktopBridge(undefined);

    expect(createDesktopRuntimeTransport()).toBeNull();
  });

  it("reads status through the preload bridge", async () => {
    const status: RuntimeTransportStatus = {
      mode: "desktop-ipc",
      state: "healthy",
      label: "Desktop daemon",
    };
    const bridge = bridgeStub({
      getStatus: vi.fn(async () => status),
    });
    setDesktopBridge(bridge);

    const transport = createDesktopRuntimeTransport();

    await expect(transport?.getStatus?.()).resolves.toEqual(status);
    expect(bridge.getStatus).toHaveBeenCalledTimes(1);
  });

  it("maps bridge status failures to unavailable desktop status", async () => {
    const bridge = bridgeStub({
      getStatus: vi.fn(async () => {
        throw new Error("bridge failed");
      }),
    });
    setDesktopBridge(bridge);

    const transport = createDesktopRuntimeTransport();

    await expect(transport?.getStatus?.()).resolves.toEqual({
      mode: "desktop-ipc",
      state: "unavailable",
      label: "Desktop IPC",
      detail: "Desktop status check failed",
    });
  });
});

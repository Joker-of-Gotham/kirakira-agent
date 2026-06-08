import { describe, expect, it } from "vitest";
import { resolveWebRuntimeConfig } from "../../../apps/web/src/runtime-config.js";

const env = (input: Partial<ImportMetaEnv> & { PROD?: boolean }): ImportMetaEnv =>
  ({
    DEV: !input.PROD,
    PROD: Boolean(input.PROD),
    MODE: input.PROD ? "production" : "development",
    BASE_URL: "/",
    SSR: false,
    ...input,
  }) as ImportMetaEnv;

describe("web runtime config", () => {
  it("uses browser gateway transport when an endpoint is configured", () => {
    const config = resolveWebRuntimeConfig(
      env({ VITE_KIRAKIRA_GATEWAY_URL: "ws://127.0.0.1:17373/runtime" }),
    );

    expect(config.mode).toBe("gateway");
    expect(config.transport?.mode).toBe("browser-gateway");
    expect(config.error).toBeUndefined();
  });

  it("allows explicit mock mode", () => {
    const config = resolveWebRuntimeConfig(env({ VITE_KIRAKIRA_RUNTIME_MODE: "mock" }));

    expect(config.mode).toBe("mock");
    expect(config.transport).toBeUndefined();
    expect(config.error).toBeUndefined();
  });

  it("does not silently mock production without an endpoint", () => {
    const config = resolveWebRuntimeConfig(env({ PROD: true }));

    expect(config.error).toContain("Production web builds require");
  });

  it("requires an endpoint in explicit gateway mode", () => {
    const config = resolveWebRuntimeConfig(
      env({ VITE_KIRAKIRA_RUNTIME_MODE: "gateway" }),
    );

    expect(config.error).toContain("VITE_KIRAKIRA_GATEWAY_URL");
  });
});

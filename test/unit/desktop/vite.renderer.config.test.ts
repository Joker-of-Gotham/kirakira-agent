import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "KIRAKIRA_DESKTOP_RENDERER_URL",
  "KIRAKIRA_DESKTOP_DEV_URL",
  "KIRAKIRA_DESKTOP_RENDERER_PORT",
] as const;
const originalEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

const resetEnv = () => {
  for (const key of ENV_KEYS) delete process.env[key];
};

const restoreEnv = () => {
  resetEnv();
  for (const [key, value] of originalEnv) {
    if (value !== undefined) process.env[key] = value;
  }
};

const loadConfig = async (env: Partial<Record<(typeof ENV_KEYS)[number], string>> = {}) => {
  resetEnv();
  Object.assign(process.env, env);
  vi.resetModules();
  const config = (await import("../../../apps/desktop/vite.renderer.config.ts")).default as {
    server?: {
      host?: string;
      port?: number;
      strictPort?: boolean;
    };
  };
  return config;
};

describe("desktop renderer Vite config", () => {
  beforeEach(() => {
    resetEnv();
    vi.resetModules();
  });

  afterAll(() => {
    restoreEnv();
  });

  it("uses the Kirakira desktop renderer port by default", async () => {
    const config = await loadConfig();

    expect(config.server).toMatchObject({
      host: "127.0.0.1",
      port: 5174,
      strictPort: true,
    });
    expect(JSON.stringify(config.server)).not.toContain("5173");
  });

  it("uses the current renderer URL override", async () => {
    const config = await loadConfig({
      KIRAKIRA_DESKTOP_RENDERER_URL: "http://127.0.0.1:5175",
    });

    expect(config.server).toMatchObject({
      host: "127.0.0.1",
      port: 5175,
      strictPort: true,
    });
  });

  it("preserves the legacy desktop dev URL fallback", async () => {
    const config = await loadConfig({
      KIRAKIRA_DESKTOP_DEV_URL: "http://localhost:5176",
    });

    expect(config.server).toMatchObject({
      host: "localhost",
      port: 5176,
      strictPort: true,
    });
  });
});

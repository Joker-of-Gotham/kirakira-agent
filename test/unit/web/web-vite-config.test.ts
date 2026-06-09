import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = ["KIRAKIRA_WEB_URL", "KIRAKIRA_WEB_PORT"] as const;
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
  const config = (await import("../../../apps/web/vite.config.ts")).default as {
    server?: {
      host?: string;
      port?: number;
      strictPort?: boolean;
    };
  };
  return config;
};

describe("web Vite config", () => {
  beforeEach(() => {
    resetEnv();
    vi.resetModules();
  });

  afterAll(() => {
    restoreEnv();
  });

  it("uses the Kirakira web port by default", async () => {
    const config = await loadConfig();

    expect(config.server).toMatchObject({
      host: "127.0.0.1",
      port: 5183,
      strictPort: true,
    });
    expect(JSON.stringify(config.server)).not.toContain("5173");
  });

  it("uses explicit web port overrides", async () => {
    const config = await loadConfig({ KIRAKIRA_WEB_PORT: "5184" });

    expect(config.server).toMatchObject({
      host: "127.0.0.1",
      port: 5184,
      strictPort: true,
    });
  });
});

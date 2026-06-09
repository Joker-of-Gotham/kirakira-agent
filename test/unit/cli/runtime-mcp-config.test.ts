import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  formatMcpConfigSource,
  resolveRuntimeMcpConfig,
} from "../../../packages/cli/src/runtime/runtime-mcp-config.js";

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function fakeRepo(options: { withRuntimeProfile?: boolean } = {}): string {
  const repoRoot = tempDir("kirakira-cli-mcp-repo-");
  mkdirSync(join(repoRoot, "scripts"), { recursive: true });
  writeFileSync(join(repoRoot, "pnpm-workspace.yaml"), "packages: []\n", "utf8");
  if (options.withRuntimeProfile) {
    writeFileSync(
      join(repoRoot, "scripts", "runtime-profile.mjs"),
      `
export function loadRuntimeProfiles() {
  return { defaultProfile: "unit", profiles: { unit: { mode: "host" } } };
}

export function resolveRuntimeProfile(profileName, config, env) {
  return { name: profileName || env.KIRAKIRA_RUNTIME_PROFILE || config.defaultProfile, mode: "host" };
}

export function buildMcpConfigPlan(profile) {
  return {
    profile: profile.name,
    mode: profile.mode,
    config: {
      mcpServers: {
        "profile-server": {
          command: "node",
          args: ["profile-server.js"],
          env: { FROM_PROFILE: "1" }
        }
      }
    }
  };
}

export function buildRuntimeMcpProjection(plan) {
  return {
    config: plan.config,
    servers: Object.entries(plan.config.mcpServers).map(([name, config]) => ({ name, ...config }))
  };
}

export function renderMcpAliasCatalog() {
  return [
    { alias: "profile.echo", server: "profile-server", tool: "echo", riskLevel: "low", readOnly: true }
  ];
}
`,
      "utf8",
    );
  }
  return repoRoot;
}

function writeMcpConfig(cwd: string, mcpServers: Record<string, unknown>): void {
  writeFileSync(
    join(cwd, ".mcp.json"),
    JSON.stringify({ mcpServers }, null, 2) + "\n",
    "utf8",
  );
}

describe("runtime MCP config resolver", () => {
  it("uses runtime profile projection first and overlays non-conflicting local servers", async () => {
    const repoRoot = fakeRepo({ withRuntimeProfile: true });
    const cwd = tempDir("kirakira-cli-mcp-cwd-");
    writeMcpConfig(cwd, {
      "profile-server": {
        command: "node",
        args: ["local-shadow.js"],
      },
      "custom-local": {
        command: "node",
        args: ["custom-local.js"],
      },
    });

    const resolution = await resolveRuntimeMcpConfig({
      cwd,
      env: { KIRAKIRA_REPO_ROOT: repoRoot },
    });

    expect(resolution.source).toBe("runtime-profile");
    expect(resolution.profile).toBe("unit");
    expect(resolution.config.mcpServers["profile-server"]?.args).toEqual([
      "profile-server.js",
    ]);
    expect(resolution.config.mcpServers["custom-local"]?.args).toEqual([
      "custom-local.js",
    ]);
    expect(resolution.localOverlayServers).toEqual(["custom-local"]);
    expect(resolution.servers.map((server) => server.name).sort()).toEqual([
      "custom-local",
      "profile-server",
    ]);
    expect(resolution.aliasCatalog?.[0]?.alias).toBe("profile.echo");
    expect(formatMcpConfigSource(resolution)).toContain(
      'runtime profile "unit" MCP projection plus 1 local custom server(s)',
    );
  });

  it("falls back to local .mcp.json when runtime profile projection is unavailable", async () => {
    const repoRoot = fakeRepo();
    const cwd = tempDir("kirakira-cli-mcp-local-");
    writeMcpConfig(cwd, {
      local: {
        command: "node",
        args: ["local.js"],
      },
    });

    const resolution = await resolveRuntimeMcpConfig({
      cwd,
      env: { KIRAKIRA_REPO_ROOT: repoRoot },
    });

    expect(resolution.source).toBe("local");
    expect(resolution.servers.map((server) => server.name)).toEqual(["local"]);
    expect(formatMcpConfigSource(resolution)).toContain(join(cwd, ".mcp.json"));
  });

  it("fails clearly when neither runtime projection nor local config is available", async () => {
    const repoRoot = fakeRepo();
    const cwd = tempDir("kirakira-cli-mcp-missing-");

    await expect(
      resolveRuntimeMcpConfig({
        cwd,
        env: { KIRAKIRA_REPO_ROOT: repoRoot },
      }),
    ).rejects.toThrow(/No MCP config available/u);
    await expect(
      resolveRuntimeMcpConfig({
        cwd,
        env: { KIRAKIRA_REPO_ROOT: repoRoot },
      }),
    ).rejects.toThrow(/Local MCP config not found/u);
  });
});

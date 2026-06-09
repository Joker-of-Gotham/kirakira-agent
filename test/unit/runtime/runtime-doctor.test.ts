import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_BROWSER_GATEWAY_ENDPOINT,
  renderRuntimeEndpoint,
  runtimeBrowserGatewayHealth,
} from "../../../packages/runtime-contracts/src/index.js";
import {
  buildRuntimeReadinessPlan,
  loadRuntimeProfiles,
  resolveRuntimeProfile,
} from "../../../scripts/runtime-profile.mjs";
import {
  evaluateRuntimeReadinessPlan,
  runRuntimeDoctor,
} from "../../../scripts/runtime-doctor.mjs";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");

describe("runtime doctor", () => {
  it("skips container-internal service targets instead of probing host DNS", async () => {
    const config = loadRuntimeProfiles();
    const profile = resolveRuntimeProfile("container", config, {});
    const plan = buildRuntimeReadinessPlan(profile, { config });
    const report = await evaluateRuntimeReadinessPlan(plan, {
      transport: {
        tcp: async () => {
          throw new Error("tcp should not be called for internal container targets");
        },
      },
    });

    expect(report).toMatchObject({
      profile: "container",
      mode: "container",
      ok: true,
      status: "ok",
      summary: {
        total: 6,
        ok: 0,
        failed: 0,
        warned: 0,
        skipped: 6,
      },
    });
    expect(report.checks.every((check) => check.status === "skipped")).toBe(true);
    expect(JSON.stringify(report)).not.toContain("kirakira:kirakira");
    expect(JSON.stringify(report)).not.toContain("testpassword");
    expect(JSON.stringify(report)).not.toContain("5173");
  });

  it("probes host profile external service targets through generic TCP checks", async () => {
    const seen: string[] = [];
    const report = await runRuntimeDoctor("host", {
      env: {},
      transport: {
        tcp: async (url: URL) => {
          seen.push(url.toString());
        },
      },
    });

    expect(report.profile).toBe("host");
    expect(report.compose).toBeUndefined();
    expect(report.ok).toBe(true);
    expect(seen).toContain("postgres://127.0.0.1:5432/kirakira");
    expect(seen).toContain("tcp://127.0.0.1:17777");
    expect(JSON.stringify(report)).not.toContain("kirakira:kirakira");
    expect(JSON.stringify(report)).not.toContain("5173");
  });

  it("probes workbench runtime, gateway, and presentation readiness from profile ports", async () => {
    const tcpTargets: string[] = [];
    const httpTargets: string[] = [];
    const socketTargets: string[] = [];
    const report = await runRuntimeDoctor("workbench-host", {
      env: {},
      transport: {
        tcp: async (url: URL) => {
          tcpTargets.push(url.toString());
        },
        http: async (target: string) => {
          httpTargets.push(target);
        },
        socket: async (target: string) => {
          socketTargets.push(target);
        },
      },
    });

    expect(report.ok).toBe(true);
    expect(tcpTargets).toContain("postgres://127.0.0.1:5432/kirakira");
    expect(httpTargets).toEqual([
      "http://127.0.0.1:17373/healthz",
      "http://127.0.0.1:5183/",
      "http://127.0.0.1:5174/",
    ]);
    expect(socketTargets[0]).toMatch(/kirakira-agent-daemon-/u);
    expect(JSON.stringify(report)).not.toContain("5173");
  });

  it("fails required checks when live probes fail and redacts sensitive details", async () => {
    const config = loadRuntimeProfiles();
    const profile = resolveRuntimeProfile("workbench-host", config, {});
    const plan = buildRuntimeReadinessPlan(profile, { config });
    const report = await evaluateRuntimeReadinessPlan(plan, {
      transport: {
        tcp: async () => undefined,
        socket: async () => {
          throw new Error(
            "connect //user:secret@example.test?token=hidden&password=pw&api_key=key",
          );
        },
        http: async () => undefined,
      },
    });

    expect(report.ok).toBe(false);
    expect(report.status).toBe("fail");
    expect(report.summary.failed).toBe(1);
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        name: "daemon:socket",
        status: "fail",
        detail: expect.stringContaining("//<redacted>@"),
      }),
    );
    expect(JSON.stringify(report)).not.toContain("secret");
    expect(JSON.stringify(report)).not.toContain("hidden");
    expect(JSON.stringify(report)).not.toContain("password=pw");
    expect(JSON.stringify(report)).not.toContain("api_key=key");
  });

  it("validates typed browser gateway health responses for http-health checks", async () => {
    const valid = await evaluateRuntimeReadinessPlan(
      {
        schemaVersion: 1,
        profile: "workbench-host",
        mode: "hybrid",
        checks: [
          {
            name: "daemon:browser-gateway",
            type: "http-health",
            source: "daemon.browserGateway",
            target: "http://127.0.0.1:17373/healthz",
            required: true,
          },
        ],
      },
      {
        fetcher: (async () =>
          ({
            ok: true,
            status: 200,
            json: async () =>
              runtimeBrowserGatewayHealth({
                endpoint: renderRuntimeEndpoint(DEFAULT_BROWSER_GATEWAY_ENDPOINT),
                tokenRequired: false,
              }),
          }) as Response) as typeof fetch,
      },
    );
    expect(valid.ok).toBe(true);

    const invalid = await evaluateRuntimeReadinessPlan(
      {
        schemaVersion: 1,
        profile: "workbench-host",
        mode: "hybrid",
        checks: [
          {
            name: "daemon:browser-gateway",
            type: "http-health",
            source: "daemon.browserGateway",
            target: "http://127.0.0.1:17373/healthz",
            required: true,
          },
        ],
      },
      {
        fetcher: (async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ ok: true }),
          }) as Response) as typeof fetch,
      },
    );
    expect(invalid.ok).toBe(false);
    expect(invalid.checks[0]).toMatchObject({
      status: "fail",
      detail: "Runtime gateway health response is invalid",
    });
  });

  it("can render a plan-only report without invoking live probes", async () => {
    const config = loadRuntimeProfiles();
    const profile = resolveRuntimeProfile("workbench-host", config, {});
    const plan = buildRuntimeReadinessPlan(profile, { config });
    const report = await evaluateRuntimeReadinessPlan(plan, {
      probe: false,
      transport: {
        tcp: async () => {
          throw new Error("tcp should not be called");
        },
        http: async () => {
          throw new Error("http should not be called");
        },
        socket: async () => {
          throw new Error("socket should not be called");
        },
      },
    });

    expect(report.ok).toBe(true);
    expect(report.summary.skipped).toBe(report.summary.total);
    expect(report.checks.every((check) => check.detail === "Live probes disabled")).toBe(true);
  });

  it("accepts pnpm-style argument separators in the script entrypoint", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/runtime-doctor.mjs", "workbench-host", "--", "--json", "--no-probe"],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.profile).toBe("workbench-host");
    expect(report.ok).toBe(true);
    expect(JSON.stringify(report)).not.toContain("5173");
  });
});

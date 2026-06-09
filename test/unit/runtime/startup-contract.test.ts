import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildWorkbenchPlan } from "../../../scripts/kirakira-workbench.mjs";
import {
  loadRuntimeProfiles,
  renderRuntimeEnv,
  resolveRuntimeProfile,
} from "../../../scripts/runtime-profile.mjs";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");

describe("startup contract", () => {
  it("routes full startup commands through profile-aware launchers", () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));

    expect(pkg.scripts.start).toBe("node scripts/kirakira.mjs");
    expect(pkg.scripts["start:daemon"]).toBe("node scripts/kirakira-workbench.mjs daemon");
    expect(pkg.scripts["start:web"]).toBe("node scripts/kirakira-workbench.mjs web");
    expect(pkg.scripts["start:desktop"]).toBe("node scripts/kirakira-workbench.mjs desktop");
    expect(pkg.scripts["dev:web"]).toBe("pnpm --filter @kirakira/web dev");
    expect(pkg.scripts["dev:desktop"]).toBe(
      "node scripts/kirakira-workbench.mjs desktop --skip-infra --skip-daemon",
    );
    expect(pkg.scripts["runtime:profile"]).toBe("node scripts/runtime-profile.mjs");
    expect(pkg.scripts["runtime:doctor"]).toBe("node scripts/runtime-doctor.mjs");

    const desktopPkg = JSON.parse(
      readFileSync(resolve(repoRoot, "apps/desktop/package.json"), "utf8"),
    );
    expect(desktopPkg.scripts["dev:renderer"]).toBe("vite --config vite.renderer.config.ts");
    expect(desktopPkg.scripts["dev:electron"]).toBe("pnpm run build:main && electron .");
    expect(desktopPkg.scripts["build:main"]).toBe("tsc -p tsconfig.main.json");
  });

  it("keeps workbench web, desktop, and gateway ports in the runtime profile", () => {
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles(), {});
    const env = renderRuntimeEnv(profile);
    const plan = buildWorkbenchPlan(profile, "web");
    const desktopPlan = buildWorkbenchPlan(profile, "desktop");

    expect(env.KIRAKIRA_WEB_URL).toBe("http://127.0.0.1:5183");
    expect(env.KIRAKIRA_DESKTOP_RENDERER_URL).toBe("http://127.0.0.1:5174");
    expect(env.KIRAKIRA_DESKTOP_DEV_URL).toBe("http://127.0.0.1:5174");
    expect(env.VITE_KIRAKIRA_GATEWAY_URL).toBe("ws://127.0.0.1:17373/runtime");
    expect(env.KIRAKIRA_BROWSER_GATEWAY_ALLOWED_ORIGINS).toBe(
      "http://127.0.0.1:5183,http://127.0.0.1:5174",
    );
    expect(plan.steps.map((step) => step.name)).toEqual(["infra", "daemon", "web"]);
    expect(desktopPlan.steps.map((step) => step.name)).toEqual([
      "infra",
      "daemon",
      "desktop-renderer",
      "desktop-shell",
    ]);
    expect(desktopPlan.steps.at(-1)).toMatchObject({
      name: "desktop-shell",
      mode: "foreground",
      args: ["--filter", "@kirakira/desktop", "dev:electron"],
    });
    expect(plan.readiness.checks).toContainEqual(
      expect.objectContaining({
        name: "daemon:browser-gateway",
        target: "http://127.0.0.1:17373/healthz",
      }),
    );
    expect(plan.readiness.checks).toContainEqual(
      expect.objectContaining({
        name: "presentation:web",
        target: "http://127.0.0.1:5183/",
      }),
    );
    expect(plan.readiness.checks).toContainEqual(
      expect.objectContaining({
        name: "presentation:desktop",
        target: "http://127.0.0.1:5174/",
      }),
    );
    expect(JSON.stringify({ profile, env, plan })).not.toContain("5173");
  });
});

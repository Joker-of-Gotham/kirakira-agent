import { describe, expect, it } from "vitest";
import { buildWorkbenchPlan } from "../../../scripts/kirakira-workbench.mjs";
import { loadRuntimeProfiles, resolveRuntimeProfile } from "../../../scripts/runtime-profile.mjs";

describe("workbench launcher plan", () => {
  it("plans infra, daemon, and web from the workbench profile", () => {
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles());
    const plan = buildWorkbenchPlan(profile, "web");

    expect(plan.profile).toBe("workbench-host");
    expect(plan.steps.map((step) => step.name)).toEqual(["infra", "daemon", "web"]);
    expect(plan.steps[0]).toMatchObject({
      command: "docker",
      args: [
        "compose",
        "-f",
        "docker-compose.yml",
        "-f",
        "docker-compose.ports.yml",
        "up",
        "-d",
        "--wait",
        "postgres",
        "redis",
        "qdrant",
        "neo4j",
        "minio",
        "kirakirad",
      ],
    });
    expect(plan.steps[1]).toMatchObject({
      name: "daemon",
      mode: "background",
      args: ["--filter", "@kirakira/runtime-daemon", "start"],
    });
    expect(plan.steps[2]).toMatchObject({
      name: "web",
      mode: "foreground",
      args: ["--filter", "@kirakira/web", "dev"],
    });
    expect(plan.env.VITE_KIRAKIRA_GATEWAY_URL).toBe("ws://127.0.0.1:17373/runtime");
    expect(JSON.stringify(plan)).not.toContain("5173");
  });

  it("can plan a daemon-only startup without UI or implicit infra", () => {
    const profile = resolveRuntimeProfile("workbench-host", loadRuntimeProfiles());
    const plan = buildWorkbenchPlan(profile, "daemon", { skipInfra: true });

    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({
      name: "daemon",
      mode: "foreground",
      args: ["--filter", "@kirakira/runtime-daemon", "start"],
    });
  });
});

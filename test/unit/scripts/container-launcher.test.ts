import { describe, expect, it } from "vitest";
import {
  buildComposeRunArgs,
  buildContainerStartupPlan,
  resolveContainerStartup,
  selectContainerProfile,
} from "../../../scripts/kirakira.mjs";
import {
  expandRuntimeServiceRefs,
  loadRuntimeProfiles,
  resolveRuntimeProfile,
} from "../../../scripts/runtime-profile.mjs";

describe("container launcher plan", () => {
  it("plans build, runtime services, and CLI run from the container profile", () => {
    const config = loadRuntimeProfiles();
    const profile = resolveRuntimeProfile("container", config, {});
    const startup = resolveContainerStartup(profile);
    const expectedRuntimeServices = expandRuntimeServiceRefs(["@runtime-stack"], config);
    const plan = buildContainerStartupPlan(profile, [], {
      startup,
      sourceHash: "test-source",
      overlayArgs: [],
      noBuildSupported: true,
    });

    expect(plan.runtimeImage).toBe("kirakira-agent-runtime:local");
    expect(plan.build.args).toEqual([
      "compose",
      "-f",
      "docker-compose.yml",
      "--profile",
      "cli",
      "--progress",
      "plain",
      "build",
      "--build-arg",
      "KIRAKIRA_SOURCE_HASH=test-source",
      "kirakira-agent",
    ]);
    expect(plan.services.args).toEqual([
      "compose",
      "-f",
      "docker-compose.yml",
      "--profile",
      "cli",
      "up",
      "-d",
      "--wait",
      "--no-build",
      ...expectedRuntimeServices,
    ]);
    expect(plan.run.args).toEqual([
      "compose",
      "-f",
      "docker-compose.yml",
      "--profile",
      "cli",
      "run",
      "--rm",
      "--no-deps",
      "--pull",
      "never",
      "kirakira-agent",
      "chat",
    ]);
    expect(JSON.stringify(plan)).not.toContain("5173");
  });

  it("uses non-interactive compose mode for non-chat commands", () => {
    const profile = resolveRuntimeProfile("container", loadRuntimeProfiles(), {});
    const startup = resolveContainerStartup(profile);
    const args = buildComposeRunArgs(profile, startup, ["mcp", "list"], { overlayArgs: [] });

    expect(args).toEqual([
      "compose",
      "-f",
      "docker-compose.yml",
      "--profile",
      "cli",
      "run",
      "--rm",
      "--no-deps",
      "--pull",
      "never",
      "-T",
      "kirakira-agent",
      "mcp",
      "list",
    ]);
  });

  it("does not fall back to hard-coded service names for custom profiles", () => {
    const base = resolveRuntimeProfile("container", loadRuntimeProfiles(), {});
    const profile = {
      ...base,
      name: "custom-container",
      composeFiles: ["custom-compose.yml"],
      composeProfiles: ["custom-cli"],
      containerStartup: {
        ...base.containerStartup,
        runtimeImage: "custom-runtime:dev",
        buildService: "custom-builder",
        runService: "custom-runner",
        runtimeServices: ["custom-db", "custom-policy"],
        defaultCommand: ["inspect"],
        interactiveCommands: ["inspect"],
        runOptions: ["--rm"],
      },
    };
    const startup = resolveContainerStartup(profile);
    const plan = buildContainerStartupPlan(profile, [], {
      startup,
      sourceHash: "custom-source",
      overlayArgs: [],
      noBuildSupported: false,
    });

    expect(plan.runtimeImage).toBe("custom-runtime:dev");
    expect(plan.build.args.at(-1)).toBe("custom-builder");
    expect(plan.services.args.slice(-2)).toEqual(["custom-db", "custom-policy"]);
    expect(plan.run.args.slice(-2)).toEqual(["custom-runner", "inspect"]);
    expect(JSON.stringify(plan)).not.toContain("kirakira-agent-runtime:local");
    expect(JSON.stringify(plan)).not.toContain("kirakira-agent\"");
  });

  it("keeps pnpm start on the container profile unless explicitly overridden", () => {
    const config = loadRuntimeProfiles();

    expect(selectContainerProfile({ KIRAKIRA_RUNTIME_PROFILE: "workbench-host" }, config).name).toBe(
      "container",
    );
    expect(
      selectContainerProfile(
        {
          KIRAKIRA_RUNTIME_PROFILE: "workbench-host",
          KIRAKIRA_WORKSPACE_ROOT: ".",
        },
        config,
      ).workspaceRoot,
    ).toBe("/workspace");
    expect(selectContainerProfile({ KIRAKIRA_CONTAINER_PROFILE: "container" }, config).name).toBe(
      "container",
    );
  });
});

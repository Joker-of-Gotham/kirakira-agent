#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ensureEnvFile, ensureMcpConfig } from "./kirakira-common.mjs";
import {
  loadRuntimeProfiles,
  renderComposeArgs,
  renderRuntimeEnv,
  resolveRuntimeProfile,
} from "./runtime-profile.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_WORKBENCH_PROFILE = "workbench-host";
const SURFACES = new Set(["daemon", "web", "desktop"]);

function pnpmCommand() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function normalizeArgs(argv) {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const options = {
    surface: "web",
    dryRun: false,
    skipInfra: false,
    skipDaemon: false,
    profileName: undefined,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (SURFACES.has(arg)) {
      options.surface = arg;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--skip-infra") {
      options.skipInfra = true;
      continue;
    }
    if (arg === "--skip-daemon") {
      options.skipDaemon = true;
      continue;
    }
    if (arg === "--profile") {
      options.profileName = args[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown workbench argument: ${arg}`);
  }
  return options;
}

function profileFromOptions(options, env = process.env) {
  const config = loadRuntimeProfiles();
  const profileName =
    options.profileName ?? env.KIRAKIRA_WORKBENCH_PROFILE ?? DEFAULT_WORKBENCH_PROFILE;
  return resolveRuntimeProfile(profileName, config, env);
}

function pnpmStep(name, packageName, script, env, mode = "foreground") {
  return {
    name,
    mode,
    command: pnpmCommand(),
    args: ["--filter", packageName, script],
    env,
  };
}

export function buildWorkbenchPlan(profile, surface, options = {}) {
  const env = renderRuntimeEnv(profile);
  const steps = [];
  const composeArgs = renderComposeArgs(profile);
  const infraServices = profile.workbench?.infraServices ?? [];

  if (!options.skipInfra && composeArgs.length > 0 && infraServices.length > 0) {
    steps.push({
      name: "infra",
      mode: "run",
      command: "docker",
      args: ["compose", ...composeArgs, "up", "-d", "--wait", ...infraServices],
      env: {},
    });
  }

  const daemonPackage = profile.workbench?.daemonPackage ?? "@kirakira/runtime-daemon";
  const webPackage = profile.workbench?.webPackage ?? "@kirakira/web";
  const desktopPackage = profile.workbench?.desktopPackage ?? "@kirakira/desktop";

  if (surface === "daemon") {
    steps.push(pnpmStep("daemon", daemonPackage, "start", env));
  } else {
    if (!options.skipDaemon) {
      steps.push(pnpmStep("daemon", daemonPackage, "start", env, "background"));
    }
    if (surface === "web") {
      steps.push(pnpmStep("web", webPackage, "dev", env));
    } else if (surface === "desktop") {
      steps.push(pnpmStep("desktop", desktopPackage, "dev:renderer", env));
    }
  }

  return {
    profile: profile.name,
    surface,
    env,
    steps,
  };
}

function runChecked(step) {
  const result = spawnSync(step.command, step.args, {
    cwd: repoRoot,
    env: { ...process.env, ...step.env, COMPOSE_PROGRESS: process.env.COMPOSE_PROGRESS ?? "quiet" },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function spawnBackground(step) {
  return spawn(step.command, step.args, {
    cwd: repoRoot,
    env: { ...process.env, ...step.env },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

function stopChildren(children) {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
}

function main(argv) {
  const options = normalizeArgs(argv);
  const profile = profileFromOptions(options);
  const plan = buildWorkbenchPlan(profile, options.surface, options);

  if (options.dryRun) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  process.env.KIRAKIRA_RUNTIME_PROFILE = profile.name;
  ensureEnvFile(repoRoot);
  ensureMcpConfig(repoRoot);

  const children = [];
  process.on("exit", () => stopChildren(children));
  process.on("SIGINT", () => {
    stopChildren(children);
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    stopChildren(children);
    process.exit(143);
  });

  for (const step of plan.steps) {
    if (step.mode === "background") {
      children.push(spawnBackground(step));
      continue;
    }
    runChecked(step);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ensureEnvFile, ensureMcpConfig } from "./kirakira-common.mjs";
import {
  buildRuntimeReadinessPlan,
  loadRuntimeProfiles,
  renderComposeArgs,
  renderRuntimeEnv,
  runtimeProfileEnv,
  resolveRuntimeProfile,
} from "./runtime-profile.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_WORKBENCH_PROFILE = "workbench-host";

function pnpmCommand() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function normalizeArgs(argv) {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const options = {
    surface: undefined,
    dryRun: false,
    skipInfra: false,
    skipDaemon: false,
    profileName: undefined,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
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
      if (!args[index + 1] || args[index + 1].startsWith("--")) {
        throw new Error("--profile requires a profile name");
      }
      options.profileName = args[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown workbench argument: ${arg}`);
    }
    if (options.surface === undefined) {
      options.surface = arg;
      continue;
    }
    throw new Error(`Unknown workbench argument: ${arg}`);
  }
  return options;
}

export function profileFromOptions(options, env = process.env) {
  const config = loadRuntimeProfiles();
  const profileName =
    options.profileName ?? env.KIRAKIRA_WORKBENCH_PROFILE ?? DEFAULT_WORKBENCH_PROFILE;
  return resolveRuntimeProfile(profileName, config, runtimeProfileEnv(env, {
    dropRootOverrides: true,
  }));
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

function workbenchSurfaces(profile) {
  return profile.workbench?.surfaces ?? {};
}

function resolveSurface(profile, requestedSurface) {
  const surfaces = workbenchSurfaces(profile);
  const surface = requestedSurface ?? profile.workbench?.defaultSurface;
  if (!surface) {
    const available = Object.keys(surfaces).sort().join(", ");
    throw new Error(`Workbench profile "${profile.name}" has no default surface. Available: ${available}`);
  }
  if (!Array.isArray(surfaces[surface])) {
    const available = Object.keys(surfaces).sort().join(", ");
    throw new Error(`Unknown workbench surface "${surface}". Available surfaces: ${available}`);
  }
  return { name: surface, steps: surfaces[surface] };
}

function resolvePackageStep(profile, step, env) {
  const packageKey = step.package;
  const spec = profile.workbench?.packages?.[packageKey];
  if (!spec?.package || !spec?.script) {
    throw new Error(`Workbench package step "${packageKey}" is not defined in profile "${profile.name}"`);
  }
  return pnpmStep(step.name ?? packageKey, spec.package, spec.script, env, step.mode ?? "foreground");
}

function renderWorkbenchStep(profile, step, env, options) {
  if (step.skipWhen && options[step.skipWhen]) return undefined;
  if (step.package) return resolvePackageStep(profile, step, env);
  if (step.command) {
    return {
      name: step.name ?? step.command,
      mode: step.mode ?? "foreground",
      command: step.command,
      args: Array.isArray(step.args) ? step.args : [],
      env: { ...env, ...(step.env ?? {}) },
    };
  }
  throw new Error(`Invalid workbench step in profile "${profile.name}"`);
}

export function buildWorkbenchPlan(profile, surface, options = {}) {
  const env = renderRuntimeEnv(profile);
  const steps = [];
  const composeArgs = renderComposeArgs(profile);
  const infraServices = profile.workbench?.infraServices ?? [];
  const selectedSurface = resolveSurface(profile, surface);
  const readiness = buildRuntimeReadinessPlan(profile, {
    services: options.skipInfra ? [] : infraServices,
  });

  if (!options.skipInfra && composeArgs.length > 0 && infraServices.length > 0) {
    steps.push({
      name: "infra",
      mode: "run",
      command: "docker",
      args: ["compose", ...composeArgs, "up", "-d", "--wait", ...infraServices],
      env,
    });
  }

  for (const step of selectedSurface.steps) {
    const rendered = renderWorkbenchStep(profile, step, env, options);
    if (rendered) steps.push(rendered);
  }

  return {
    profile: profile.name,
    surface: selectedSurface.name,
    env,
    readiness,
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
  ensureMcpConfig(repoRoot, profile);

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

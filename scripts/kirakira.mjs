#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, posix, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ensureEnvFile, ensureMcpConfig } from "./kirakira-common.mjs";
import {
  buildRuntimeReadinessPlan,
  loadRuntimeProfiles,
  renderComposeArgs,
  renderRuntimeEnv,
  resolveRuntimeProfile,
} from "./runtime-profile.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CONTAINER_PROFILE = "container";

function truthyEnv(name, env = process.env) {
  return ["1", "true", "yes", "on"].includes(String(env[name] ?? "").toLowerCase());
}

function runtimeFlags(env = process.env) {
  return {
    forceRuntimeBuild: truthyEnv("KIRAKIRA_REBUILD", env) || truthyEnv("KIRAKIRA_FORCE_BUILD", env),
    strictRuntimeHash: truthyEnv("KIRAKIRA_STRICT_IMAGE_HASH", env),
    skipRuntimeBuild: truthyEnv("KIRAKIRA_SKIP_BUILD", env),
    verboseStartup: truthyEnv("KIRAKIRA_VERBOSE_STARTUP", env),
    skipWorkspaceBuild: truthyEnv("KIRAKIRA_SKIP_WORKSPACE_BUILD", env),
    forceWorkspaceBuild: truthyEnv("KIRAKIRA_FORCE_WORKSPACE_BUILD", env),
  };
}

function normalizeArgs(argv) {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const options = {
    dryRun: false,
    userArgs: [],
  };
  for (const arg of args) {
    if (arg === "--dry-run" || arg === "--plan") {
      options.dryRun = true;
      continue;
    }
    options.userArgs.push(arg);
  }
  return options;
}

function stringValue(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Container startup profile requires ${label}`);
  }
  return value;
}

function stringArray(value, label) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error(`Container startup profile requires ${label} as a string array`);
  }
  return [...value];
}

function optionalStringArray(value, label, fallback) {
  if (value === undefined) return [...fallback];
  return stringArray(value, label);
}

function optionalOverlayFiles(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`Container startup requires ${label} as an array`);
  }
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Container startup ${label}[${index}] must be an object`);
    }
    return {
      source: stringValue(entry.source, `${label}[${index}].source`),
      target: stringValue(entry.target, `${label}[${index}].target`),
    };
  });
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))];
}

function resolveRepoPath(path, label) {
  const value = stringValue(path, label);
  const absolutePath = resolve(repoRoot, value);
  const rel = relative(repoRoot, absolutePath);
  if (isAbsolute(rel) || rel.startsWith("..")) {
    throw new Error(`Container startup ${label} escapes the repository: ${value}`);
  }
  return absolutePath;
}

export function selectContainerProfile(env = process.env, config = loadRuntimeProfiles()) {
  const profileName =
    env.KIRAKIRA_CONTAINER_PROFILE ?? env.KIRAKIRA_START_PROFILE ?? DEFAULT_CONTAINER_PROFILE;
  return resolveRuntimeProfile(profileName, config, {});
}

export function resolveContainerStartup(profile) {
  const startup = profile.containerStartup;
  if (!startup || typeof startup !== "object" || Array.isArray(startup)) {
    throw new Error(`Runtime profile "${profile.name}" does not define containerStartup`);
  }

  const hashRoots = uniqueStrings([
    ...optionalStringArray(startup.hashRoots, "hashRoots", []),
    ...(profile.composeFiles ?? []),
  ]);

  return {
    runtimeImage: stringValue(startup.runtimeImage, "runtimeImage"),
    sourceHashLabel: stringValue(startup.sourceHashLabel, "sourceHashLabel"),
    sourceHashCachePath: stringValue(startup.sourceHashCachePath, "sourceHashCachePath"),
    workspaceBuildCachePath: stringValue(startup.workspaceBuildCachePath, "workspaceBuildCachePath"),
    buildService: stringValue(startup.buildService, "buildService"),
    runService: stringValue(startup.runService, "runService"),
    runtimeServices: stringArray(startup.runtimeServices, "runtimeServices"),
    defaultCommand: optionalStringArray(startup.defaultCommand, "defaultCommand", ["chat"]),
    interactiveCommands: new Set(optionalStringArray(startup.interactiveCommands, "interactiveCommands", ["chat"])),
    runOptions: optionalStringArray(startup.runOptions, "runOptions", ["--rm", "--no-deps", "--pull", "never"]),
    hashRoots,
    ignoredHashDirs: new Set(optionalStringArray(startup.ignoredHashDirs, "ignoredHashDirs", [])),
    ignoredHashFiles: new Set(optionalStringArray(startup.ignoredHashFiles, "ignoredHashFiles", [])),
    workspaceBuild: {
      distEntry: stringValue(startup.workspaceBuild?.distEntry, "workspaceBuild.distEntry"),
      filter: stringValue(startup.workspaceBuild?.filter, "workspaceBuild.filter"),
    },
    overlay: {
      packagesRoot: stringValue(startup.overlay?.packagesRoot, "overlay.packagesRoot"),
      containerPackagesRoot: stringValue(
        startup.overlay?.containerPackagesRoot,
        "overlay.containerPackagesRoot",
      ),
      scripts: optionalStringArray(startup.overlay?.scripts, "overlay.scripts", []),
      containerScriptsRoot: stringValue(
        startup.overlay?.containerScriptsRoot,
        "overlay.containerScriptsRoot",
      ),
      files: optionalOverlayFiles(startup.overlay?.files, "overlay.files"),
    },
  };
}

function runtimeCommandEnv(profile) {
  return {
    ...process.env,
    ...renderRuntimeEnv(profile),
    COMPOSE_PROGRESS: process.env.COMPOSE_PROGRESS ?? "quiet",
  };
}

function run(command, commandArgs, profile, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    env: runtimeCommandEnv(profile),
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  process.exitCode = result.status ?? 1;
  return process.exitCode;
}

function runChecked(command, commandArgs, label, profile) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    env: runtimeCommandEnv(profile),
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    console.error(`${label} failed.`);
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
}

function ensureDockerAvailable(profile) {
  const result = spawnSync("docker", ["compose", "version"], {
    cwd: repoRoot,
    env: runtimeCommandEnv(profile),
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error("Docker Compose is required. Start Docker Desktop, then run `pnpm start` again.");
    process.exit(1);
  }
}

function hashPath(hash, absolutePath, startup) {
  const stat = statSync(absolutePath);
  const rel = relative(repoRoot, absolutePath).replace(/\\/gu, "/");

  if (stat.isDirectory()) {
    const baseName = absolutePath.split(/[\\/]/u).pop();
    if (baseName && startup.ignoredHashDirs.has(baseName)) return;
    const entries = readdirSync(absolutePath).sort((a, b) => a.localeCompare(b));
    for (const entry of entries) {
      hashPath(hash, join(absolutePath, entry), startup);
    }
    return;
  }

  if (!stat.isFile()) return;
  if (startup.ignoredHashFiles.has(rel)) return;
  hash.update(rel);
  hash.update("\0");
  hash.update(readFileSync(absolutePath));
  hash.update("\0");
}

function computeSourceHash(startup) {
  const hash = createHash("sha256");
  for (const root of startup.hashRoots) {
    const absolutePath = join(repoRoot, root);
    if (existsSync(absolutePath)) {
      hashPath(hash, absolutePath, startup);
    }
  }
  return hash.digest("hex");
}

function runtimeImageExists(profile, runtimeImage) {
  const result = spawnSync("docker", ["image", "inspect", runtimeImage], {
    cwd: repoRoot,
    env: runtimeCommandEnv(profile),
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  return result.status === 0;
}

function currentImageSourceHash(profile, startup) {
  const result = spawnSync("docker", ["image", "inspect", startup.runtimeImage], {
    cwd: repoRoot,
    encoding: "utf8",
    env: runtimeCommandEnv(profile),
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "ignore"],
  });

  if (result.status !== 0 || !result.stdout) return undefined;

  try {
    const [image] = JSON.parse(result.stdout);
    return image?.Config?.Labels?.[startup.sourceHashLabel];
  } catch {
    return undefined;
  }
}

function cachedSourceHash(startup) {
  try {
    return readFileSync(resolveRepoPath(startup.sourceHashCachePath, "sourceHashCachePath"), "utf8").trim()
      || undefined;
  } catch {
    return undefined;
  }
}

function writeCachedSourceHash(startup, sourceHash) {
  const hashCachePath = resolveRepoPath(startup.sourceHashCachePath, "sourceHashCachePath");
  mkdirSync(dirname(hashCachePath), { recursive: true });
  writeFileSync(hashCachePath, `${sourceHash}\n`, "utf8");
}

function cachedWorkspaceBuildHash(startup) {
  try {
    return readFileSync(
      resolveRepoPath(startup.workspaceBuildCachePath, "workspaceBuildCachePath"),
      "utf8",
    ).trim() || undefined;
  } catch {
    return undefined;
  }
}

function writeCachedWorkspaceBuildHash(startup, sourceHash) {
  const cachePath = resolveRepoPath(startup.workspaceBuildCachePath, "workspaceBuildCachePath");
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, `${sourceHash}\n`, "utf8");
}

export function buildRuntimeImageArgs(profile, startup, sourceHash) {
  return [
    "compose",
    ...renderComposeArgs(profile),
    "--progress",
    "plain",
    "build",
    "--build-arg",
    `KIRAKIRA_SOURCE_HASH=${sourceHash}`,
    startup.buildService,
  ];
}

function ensureRuntimeImage(profile, startup, flags) {
  const sourceHash = computeSourceHash(startup);
  const imageExists = runtimeImageExists(profile, startup.runtimeImage);
  const cacheHash = cachedSourceHash(startup);
  const imageHash = imageExists ? currentImageSourceHash(profile, startup) : undefined;
  const imageMatchesSource = cacheHash === sourceHash || imageHash === sourceHash;
  const wantsBuild = flags.forceRuntimeBuild
    || !imageExists
    || (flags.strictRuntimeHash && !imageMatchesSource);
  const shouldBuild = wantsBuild && !flags.skipRuntimeBuild;

  if (imageExists && !shouldBuild) {
    if (imageHash === sourceHash && cacheHash !== sourceHash) {
      writeCachedSourceHash(startup, sourceHash);
    }
    if (!imageMatchesSource && flags.verboseStartup) {
      console.log("Using existing Kirakira runtime base image; current workspace build will be mounted at launch.");
      console.log("Rebuild the image only after dependency/base-image changes: `$env:KIRAKIRA_REBUILD='1'; pnpm.cmd start`.");
    }
    return;
  }

  if (!imageExists && flags.skipRuntimeBuild) {
    console.error(`Runtime image ${startup.runtimeImage} is missing and KIRAKIRA_SKIP_BUILD is enabled.`);
    console.error(`Build once with: docker compose ${renderComposeArgs(profile).join(" ")} build ${startup.buildService}`.trim());
    process.exit(1);
  }

  if (imageExists && flags.strictRuntimeHash && !imageMatchesSource && !flags.forceRuntimeBuild) {
    console.warn("KIRAKIRA_STRICT_IMAGE_HASH is enabled and the runtime image is stale.");
  }

  console.log(`${imageExists ? "Rebuilding" : "Building"} Kirakira runtime image...`);
  const buildStatus = run("docker", buildRuntimeImageArgs(profile, startup, sourceHash), profile);
  if (buildStatus !== 0) {
    process.exit(buildStatus);
  }

  const builtImageHash = currentImageSourceHash(profile, startup);
  if (builtImageHash !== sourceHash) {
    console.warn("Runtime image built, but source hash label could not be verified.");
  }
  writeCachedSourceHash(startup, sourceHash);
}

function pnpmCommand() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function ensureCurrentWorkspaceBuild(profile, startup, flags) {
  if (flags.skipWorkspaceBuild) return;

  const sourceHash = computeSourceHash(startup);
  const cliDistEntry = resolveRepoPath(startup.workspaceBuild.distEntry, "workspaceBuild.distEntry");
  if (
    !flags.forceWorkspaceBuild
    && existsSync(cliDistEntry)
    && cachedWorkspaceBuildHash(startup) === sourceHash
  ) {
    return;
  }

  console.log("Building current Kirakira workspace...");
  runChecked(
    pnpmCommand(),
    ["exec", "turbo", "build", `--filter=${startup.workspaceBuild.filter}`],
    "Building current Kirakira workspace",
    profile,
  );
  writeCachedWorkspaceBuildHash(startup, sourceHash);
}

function dockerComposeUpSupportsNoBuild(profile) {
  const result = spawnSync("docker", ["compose", ...renderComposeArgs(profile), "up", "--help"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: runtimeCommandEnv(profile),
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`.includes("--no-build");
}

export function buildRuntimeServicesArgs(profile, startup, options = {}) {
  const upArgs = ["compose", ...renderComposeArgs(profile), "up", "-d", "--wait"];
  if (options.noBuildSupported) {
    upArgs.push("--no-build");
  }
  upArgs.push(...startup.runtimeServices);
  return upArgs;
}

function ensureRuntimeServices(profile, startup) {
  runChecked(
    "docker",
    buildRuntimeServicesArgs(profile, startup, {
      noBuildSupported: dockerComposeUpSupportsNoBuild(profile),
    }),
    "Starting Kirakira runtime services",
    profile,
  );
}

function dockerHostPath(absolutePath) {
  return resolve(absolutePath).replace(/\\/gu, "/");
}

export function packageOverlayVolumeArgs(startup) {
  const packageRoot = resolveRepoPath(startup.overlay.packagesRoot, "overlay.packagesRoot");
  const args = [];
  if (!existsSync(packageRoot)) return args;

  const packageDirs = readdirSync(packageRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  for (const packageDir of packageDirs) {
    const distPath = join(packageRoot, packageDir, "dist");
    if (existsSync(distPath)) {
      args.push(
        "--volume",
        `${dockerHostPath(distPath)}:${posix.join(startup.overlay.containerPackagesRoot, packageDir, "dist")}:ro`,
      );
    }

    const packageJsonPath = join(packageRoot, packageDir, "package.json");
    if (existsSync(packageJsonPath)) {
      args.push(
        "--volume",
        `${dockerHostPath(packageJsonPath)}:${posix.join(
          startup.overlay.containerPackagesRoot,
          packageDir,
          "package.json",
        )}:ro`,
      );
    }
  }

  for (const scriptName of startup.overlay.scripts) {
    const scriptPath = join(repoRoot, "scripts", scriptName);
    if (existsSync(scriptPath)) {
      args.push(
        "--volume",
        `${dockerHostPath(scriptPath)}:${posix.join(startup.overlay.containerScriptsRoot, scriptName)}:ro`,
      );
    }
  }

  for (const file of startup.overlay.files) {
    const sourcePath = resolveRepoPath(file.source, `overlay file ${file.source}`);
    if (existsSync(sourcePath)) {
      args.push("--volume", `${dockerHostPath(sourcePath)}:${file.target}:ro`);
    }
  }

  return args;
}

export function buildComposeRunArgs(profile, startup, userArgs, options = {}) {
  const cliArgs = userArgs.length > 0 ? userArgs : startup.defaultCommand;
  const interactive = startup.interactiveCommands.has(cliArgs[0]);
  const overlayArgs = options.overlayArgs ?? packageOverlayVolumeArgs(startup);
  return [
    "compose",
    ...renderComposeArgs(profile),
    "run",
    ...startup.runOptions,
    ...(interactive ? [] : ["-T"]),
    ...overlayArgs,
    startup.runService,
    ...cliArgs,
  ];
}

export function buildContainerStartupPlan(profile, userArgs, options = {}) {
  const startup = options.startup ?? resolveContainerStartup(profile);
  const sourceHash = options.sourceHash ?? "<source-hash>";
  const readiness = buildRuntimeReadinessPlan(profile, { services: startup.runtimeServices });
  return {
    profile: profile.name,
    env: renderRuntimeEnv(profile),
    runtimeImage: startup.runtimeImage,
    readiness,
    build: {
      command: "docker",
      args: buildRuntimeImageArgs(profile, startup, sourceHash),
    },
    services: {
      command: "docker",
      args: buildRuntimeServicesArgs(profile, startup, {
        noBuildSupported: options.noBuildSupported ?? true,
      }),
    },
    run: {
      command: "docker",
      args: buildComposeRunArgs(profile, startup, userArgs, {
        overlayArgs: options.overlayArgs ?? [],
      }),
    },
  };
}

export function main(argv, env = process.env) {
  const options = normalizeArgs(argv);
  const args = options.userArgs;
  const profile = selectContainerProfile(env);
  const startup = resolveContainerStartup(profile);
  const flags = runtimeFlags(env);

  if (options.dryRun) {
    console.log(JSON.stringify(buildContainerStartupPlan(profile, args, { startup }), null, 2));
    return 0;
  }

  ensureDockerAvailable(profile);
  ensureEnvFile(repoRoot);
  ensureMcpConfig(repoRoot, profile);
  ensureRuntimeImage(profile, startup, flags);
  ensureCurrentWorkspaceBuild(profile, startup, flags);
  ensureRuntimeServices(profile, startup);

  const status = run("docker", buildComposeRunArgs(profile, startup, args), profile);

  if (args[0] === "mcp") {
    ensureMcpConfig(repoRoot, profile);
  }

  return status;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}

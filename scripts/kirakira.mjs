#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

import { ensureEnvFile, ensureMcpConfig } from "./kirakira-common.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
const truthyEnv = (name) => ["1", "true", "yes", "on"].includes(String(process.env[name] ?? "").toLowerCase());
const forceRuntimeBuild = truthyEnv("KIRAKIRA_REBUILD") || truthyEnv("KIRAKIRA_FORCE_BUILD");
const strictRuntimeHash = truthyEnv("KIRAKIRA_STRICT_IMAGE_HASH");
const skipRuntimeBuild = truthyEnv("KIRAKIRA_SKIP_BUILD");
const verboseStartup = truthyEnv("KIRAKIRA_VERBOSE_STARTUP");
const runtimeImage = "kirakira-agent-runtime:local";
const sourceHashLabel = "org.kirakira.source-hash";
const hashCachePath = join(repoRoot, ".kirakira", "runtime-image.hash");
const workspaceBuildCachePath = join(repoRoot, ".kirakira", "workspace-build.hash");
const skipWorkspaceBuild = truthyEnv("KIRAKIRA_SKIP_WORKSPACE_BUILD");
const forceWorkspaceBuild = truthyEnv("KIRAKIRA_FORCE_WORKSPACE_BUILD");
const hashRoots = [
  ".dockerignore",
  "Dockerfile",
  "docker-compose.yml",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
  "tsconfig.base.json",
  "vitest.config.ts",
  "pytest.ini",
  "packages",
  "scripts",
];
const ignoredHashDirs = new Set([
  ".git",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
]);
const ignoredHashFiles = new Set([
  "scripts/kirakira.mjs",
]);
const runtimeServices = [
  "postgres",
  "redis",
  "qdrant",
  "neo4j",
  "minio",
  "kirakirad",
];

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    env: {
      ...process.env,
      COMPOSE_PROGRESS: process.env.COMPOSE_PROGRESS ?? "quiet",
    },
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

function runChecked(command, commandArgs, label) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      COMPOSE_PROGRESS: process.env.COMPOSE_PROGRESS ?? "quiet",
    },
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

function ensureDockerAvailable() {
  const result = spawnSync("docker", ["compose", "version"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      COMPOSE_PROGRESS: process.env.COMPOSE_PROGRESS ?? "quiet",
    },
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error("Docker Compose is required. Start Docker Desktop, then run `pnpm start` again.");
    process.exit(1);
  }
}

function hashPath(hash, absolutePath) {
  const stat = statSync(absolutePath);
  const rel = relative(repoRoot, absolutePath).replace(/\\/g, "/");

  if (stat.isDirectory()) {
    const baseName = absolutePath.split(/[\\/]/).pop();
    if (baseName && ignoredHashDirs.has(baseName)) return;
    const entries = readdirSync(absolutePath).sort((a, b) => a.localeCompare(b));
    for (const entry of entries) {
      hashPath(hash, join(absolutePath, entry));
    }
    return;
  }

  if (!stat.isFile()) return;
  if (ignoredHashFiles.has(rel)) return;
  hash.update(rel);
  hash.update("\0");
  hash.update(readFileSync(absolutePath));
  hash.update("\0");
}

function computeSourceHash() {
  const hash = createHash("sha256");
  for (const root of hashRoots) {
    const absolutePath = join(repoRoot, root);
    if (existsSync(absolutePath)) {
      hashPath(hash, absolutePath);
    }
  }
  return hash.digest("hex");
}

function runtimeImageExists() {
  const result = spawnSync("docker", ["image", "inspect", runtimeImage], {
    cwd: repoRoot,
    env: {
      ...process.env,
      COMPOSE_PROGRESS: process.env.COMPOSE_PROGRESS ?? "quiet",
    },
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  return result.status === 0;
}

function currentImageSourceHash() {
  const result = spawnSync("docker", ["image", "inspect", runtimeImage], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      COMPOSE_PROGRESS: process.env.COMPOSE_PROGRESS ?? "quiet",
    },
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "ignore"],
  });

  if (result.status !== 0 || !result.stdout) return undefined;

  try {
    const [image] = JSON.parse(result.stdout);
    return image?.Config?.Labels?.[sourceHashLabel];
  } catch {
    return undefined;
  }
}

function cachedSourceHash() {
  try {
    return readFileSync(hashCachePath, "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

function writeCachedSourceHash(sourceHash) {
  mkdirSync(join(repoRoot, ".kirakira"), { recursive: true });
  writeFileSync(hashCachePath, `${sourceHash}\n`, "utf8");
}

function cachedWorkspaceBuildHash() {
  try {
    return readFileSync(workspaceBuildCachePath, "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

function writeCachedWorkspaceBuildHash(sourceHash) {
  mkdirSync(join(repoRoot, ".kirakira"), { recursive: true });
  writeFileSync(workspaceBuildCachePath, `${sourceHash}\n`, "utf8");
}

function ensureRuntimeImage() {
  const sourceHash = computeSourceHash();
  const imageExists = runtimeImageExists();
  const cacheHash = cachedSourceHash();
  const imageHash = imageExists ? currentImageSourceHash() : undefined;
  const imageMatchesSource = cacheHash === sourceHash || imageHash === sourceHash;
  const wantsBuild = forceRuntimeBuild
    || !imageExists
    || (strictRuntimeHash && !imageMatchesSource);
  const shouldBuild = wantsBuild && !skipRuntimeBuild;

  if (imageExists && !shouldBuild) {
    if (imageHash === sourceHash && cacheHash !== sourceHash) {
      writeCachedSourceHash(sourceHash);
    }
    if (!imageMatchesSource && verboseStartup) {
      console.log("Using existing Kirakira runtime base image; current workspace build will be mounted at launch.");
      console.log("Rebuild the image only after dependency/base-image changes: `$env:KIRAKIRA_REBUILD='1'; pnpm.cmd start`.");
    }
    return;
  }

  if (!imageExists && skipRuntimeBuild) {
    console.error(`Runtime image ${runtimeImage} is missing and KIRAKIRA_SKIP_BUILD is enabled.`);
    console.error("Build once with: docker compose build kirakira-agent");
    process.exit(1);
  }

  if (imageExists && strictRuntimeHash && !imageMatchesSource && !forceRuntimeBuild) {
    console.warn("KIRAKIRA_STRICT_IMAGE_HASH is enabled and the runtime image is stale.");
  }

  console.log(`${imageExists ? "Rebuilding" : "Building"} Kirakira runtime image...`);
  const buildStatus = run("docker", [
    "compose",
    "--progress",
    "plain",
    "build",
    "--build-arg",
    `KIRAKIRA_SOURCE_HASH=${sourceHash}`,
    "kirakira-agent",
  ]);
  if (buildStatus !== 0) {
    process.exit(buildStatus);
  }

  const builtImageHash = currentImageSourceHash();
  if (builtImageHash !== sourceHash) {
    console.warn("Runtime image built, but source hash label could not be verified.");
  }
  writeCachedSourceHash(sourceHash);
}

function pnpmCommand() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function ensureCurrentWorkspaceBuild() {
  if (skipWorkspaceBuild) return;

  const sourceHash = computeSourceHash();
  const cliDistEntry = join(repoRoot, "packages", "cli", "dist", "index.js");
  if (!forceWorkspaceBuild && existsSync(cliDistEntry) && cachedWorkspaceBuildHash() === sourceHash) {
    return;
  }

  console.log("Building current Kirakira workspace...");
  runChecked(
    pnpmCommand(),
    ["exec", "turbo", "build", "--filter=@kirakira/cli..."],
    "Building current Kirakira workspace",
  );
  writeCachedWorkspaceBuildHash(sourceHash);
}

function dockerComposeUpSupportsNoBuild() {
  const result = spawnSync("docker", ["compose", "up", "--help"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      COMPOSE_PROGRESS: process.env.COMPOSE_PROGRESS ?? "quiet",
    },
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`.includes("--no-build");
}

function ensureRuntimeServices() {
  const upArgs = ["compose", "up", "-d", "--wait"];
  if (dockerComposeUpSupportsNoBuild()) {
    upArgs.push("--no-build");
  }
  upArgs.push(...runtimeServices);

  runChecked(
    "docker",
    upArgs,
    "Starting Kirakira runtime services",
  );
}

function dockerHostPath(absolutePath) {
  return resolve(absolutePath).replace(/\\/g, "/");
}

function packageOverlayVolumeArgs() {
  const packageRoot = join(repoRoot, "packages");
  const args = [];
  if (!existsSync(packageRoot)) return args;

  const packageDirs = readdirSync(packageRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  for (const packageDir of packageDirs) {
    const distPath = join(packageRoot, packageDir, "dist");
    if (existsSync(distPath)) {
      args.push("--volume", `${dockerHostPath(distPath)}:/app/packages/${packageDir}/dist:ro`);
    }

    const packageJsonPath = join(packageRoot, packageDir, "package.json");
    if (existsSync(packageJsonPath)) {
      args.push("--volume", `${dockerHostPath(packageJsonPath)}:/app/packages/${packageDir}/package.json:ro`);
    }
  }

  for (const scriptName of ["kirakira-container.mjs", "kirakira-common.mjs"]) {
    const scriptPath = join(repoRoot, "scripts", scriptName);
    if (existsSync(scriptPath)) {
      args.push("--volume", `${dockerHostPath(scriptPath)}:/app/scripts/${scriptName}:ro`);
    }
  }

  return args;
}

function composeArgs(userArgs) {
  const cliArgs = userArgs.length > 0 ? userArgs : ["chat"];
  const interactive = cliArgs[0] === "chat";
  return [
    "compose",
    "run",
    "--rm",
    "--no-deps",
    "--pull",
    "never",
    ...(interactive ? [] : ["-T"]),
    ...packageOverlayVolumeArgs(),
    "kirakira-agent",
    ...cliArgs,
  ];
}

ensureDockerAvailable();
ensureEnvFile(repoRoot);
ensureMcpConfig(repoRoot);
ensureRuntimeImage();
ensureCurrentWorkspaceBuild();
ensureRuntimeServices();

const status = run("docker", composeArgs(args));

if (args[0] === "mcp") {
  ensureMcpConfig(repoRoot);
}

process.exit(status);

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
const runtimeImage = "kirakira-agent-runtime:local";
const sourceHashLabel = "org.kirakira.source-hash";
const hashCachePath = join(repoRoot, ".kirakira", "runtime-image.hash");
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
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  return result.status === 0;
}

function currentImageSourceHash() {
  const result = spawnSync("docker", ["image", "inspect", runtimeImage], {
    cwd: repoRoot,
    encoding: "utf8",
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

function ensureRuntimeImage() {
  const sourceHash = computeSourceHash();
  if (runtimeImageExists() && cachedSourceHash() === sourceHash) {
    return;
  }
  if (runtimeImageExists() && currentImageSourceHash() === sourceHash) {
    writeCachedSourceHash(sourceHash);
    return;
  }

  console.log("Building Kirakira runtime image...");
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

  const imageHash = currentImageSourceHash();
  if (imageHash !== sourceHash) {
    console.warn("Runtime image built, but source hash label could not be verified.");
  }
  writeCachedSourceHash(sourceHash);
}

function ensureRuntimeServices() {
  runChecked(
    "docker",
    ["compose", "up", "-d", "--wait", ...runtimeServices],
    "Starting Kirakira runtime services",
  );
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
    "kirakira-agent",
    ...cliArgs,
  ];
}

ensureDockerAvailable();
ensureEnvFile(repoRoot);
ensureMcpConfig(repoRoot);
ensureRuntimeImage();
ensureRuntimeServices();

const status = run("docker", composeArgs(args));

if (args[0] === "mcp") {
  ensureMcpConfig(repoRoot);
}

process.exit(status);

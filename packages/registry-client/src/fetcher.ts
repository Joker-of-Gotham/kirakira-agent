/**
 * Fetchers — download/acquire package artifacts from various sources.
 *
 * Each fetcher returns a local blob path and its digest.
 */

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { sha256Prefixed, getUserCacheDir } from "@kirakira/core";
import type { FetchResult, ResolvedSource } from "./types.js";

function blobDir(): string {
  const dir = join(getUserCacheDir(), "blobs", "sha256");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export async function fetchPackage(
  source: ResolvedSource,
): Promise<FetchResult> {
  switch (source.type) {
    case "local":
      return fetchLocal(source);
    case "github":
      return fetchGit(source);
    case "npm":
      return fetchNpm(source);
    case "oci":
      return fetchOci(source);
    case "registry":
      return fetchRegistry(source);
    case "url":
      return fetchUrl(source);
    default:
      throw new Error(`Unsupported source type: ${source.type}`);
  }
}

async function fetchLocal(source: ResolvedSource): Promise<FetchResult> {
  const absPath = resolve(source.uri);
  if (!existsSync(absPath)) {
    throw new Error(`Local source not found: ${absPath}`);
  }

  const content = readFileSync(absPath);
  const digest = sha256Prefixed(content);
  const blobHash = digest.replace("sha256:", "");
  const blobPath = join(blobDir(), blobHash);

  if (!existsSync(blobPath)) {
    copyFileSync(absPath, blobPath);
  }

  return { blobPath, digest, size: content.length };
}

async function fetchGit(source: ResolvedSource): Promise<FetchResult> {
  const tmpDir = join(getUserCacheDir(), "tmp", `git-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  const gitUrl = source.uri.includes("://")
    ? source.uri
    : `https://github.com/${source.uri}.git`;

  const cloneArgs = ["clone", "--depth=1"];
  if (source.ref) cloneArgs.push("--branch", source.ref);
  cloneArgs.push(gitUrl, tmpDir);

  execFileSync("git", cloneArgs, { stdio: "pipe" });

  const files = readdirSync(tmpDir);
  const entryFile = files.find(
    (f) => f === "SKILL.md" || f === "manifest.json" || f === "package.json",
  );
  const targetPath = entryFile ? join(tmpDir, entryFile) : tmpDir;

  const content = readFileSync(targetPath);
  const digest = sha256Prefixed(content);
  const blobHash = digest.replace("sha256:", "");
  const blobPath = join(blobDir(), blobHash);

  if (!existsSync(blobPath)) {
    copyFileSync(targetPath, blobPath);
  }

  return { blobPath, digest, size: content.length };
}

async function fetchNpm(source: ResolvedSource): Promise<FetchResult> {
  const tmpDir = join(getUserCacheDir(), "tmp", `npm-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  const spec = source.ref ? `${source.uri}@${source.ref}` : source.uri;
  execFileSync("npm", ["pack", spec, "--pack-destination", tmpDir], {
    stdio: "pipe",
    cwd: tmpDir,
  });

  const tarballs = readdirSync(tmpDir).filter((f) => f.endsWith(".tgz"));
  if (tarballs.length === 0) throw new Error(`npm pack produced no tarball for ${spec}`);

  const tarPath = join(tmpDir, tarballs[0]!);
  const content = readFileSync(tarPath);
  const digest = sha256Prefixed(content);
  const blobHash = digest.replace("sha256:", "");
  const blobPath = join(blobDir(), blobHash);

  if (!existsSync(blobPath)) {
    copyFileSync(tarPath, blobPath);
  }

  return { blobPath, digest, size: content.length };
}

async function fetchOci(source: ResolvedSource): Promise<FetchResult> {
  const tmpDir = join(getUserCacheDir(), "tmp", `oci-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  const ref = source.ref ? `${source.uri}:${source.ref}` : source.uri;
  execFileSync("oras", ["pull", ref, "-o", tmpDir], { stdio: "pipe" });

  const files = readdirSync(tmpDir);
  if (files.length === 0) throw new Error(`OCI pull yielded no files for ${ref}`);

  const targetPath = join(tmpDir, files[0]!);
  const content = readFileSync(targetPath);
  const digest = sha256Prefixed(content);
  const blobHash = digest.replace("sha256:", "");
  const blobPath = join(blobDir(), blobHash);

  if (!existsSync(blobPath)) {
    copyFileSync(targetPath, blobPath);
  }

  return { blobPath, digest, size: content.length };
}

async function fetchUrl(source: ResolvedSource): Promise<FetchResult> {
  const url = source.uri;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`URL fetch failed (${response.status}): ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const digest = sha256Prefixed(buffer);
  const blobHash = digest.replace("sha256:", "");
  const blobPath = join(blobDir(), blobHash);

  if (!existsSync(blobPath)) {
    const isArchive = /\.(zip|tar\.gz|tgz|tar)$/i.test(url);
    if (isArchive) {
      const tmpDir = join(getUserCacheDir(), "tmp", `url-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });
      const { writeFileSync } = await import("node:fs");
      const archivePath = join(tmpDir, "download" + (url.endsWith(".zip") ? ".zip" : ".tar.gz"));
      writeFileSync(archivePath, buffer);

      if (url.endsWith(".zip")) {
        execFileSync("unzip", ["-o", archivePath, "-d", tmpDir], { stdio: "pipe" });
      } else {
        execFileSync("tar", ["xf", archivePath, "-C", tmpDir], { stdio: "pipe" });
      }

      const files = readdirSync(tmpDir).filter((f) => f !== "download.zip" && f !== "download.tar.gz");
      const entryFile = files.find((f) => f === "SKILL.md" || f === "manifest.json" || f === "package.json");
      const targetPath = entryFile ? join(tmpDir, entryFile) : join(tmpDir, files[0] ?? "");
      if (existsSync(targetPath)) {
        copyFileSync(targetPath, blobPath);
      } else {
        writeFileSync(blobPath, buffer);
      }
    } else {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(blobPath, buffer);
    }
  }

  return { blobPath, digest, size: buffer.length };
}

async function fetchRegistry(source: ResolvedSource): Promise<FetchResult> {
  const registryUrl = process.env.KIRAKIRA_REGISTRY_URL ?? "";
  if (!registryUrl.trim()) {
    throw new Error(
      `KIRAKIRA_REGISTRY_URL is required for registry source. URI: ${source.uri}`,
    );
  }

  const { RegistryApiClient } = await import("./api-client.js");
  const token = process.env.KIRAKIRA_REGISTRY_TOKEN;
  const client = new RegistryApiClient({
    baseUrl: registryUrl,
    auth: token ? { token, url: registryUrl } : undefined,
  });

  const resolved = await client.resolve([
    { kind: "skill", name: source.uri, versionRange: source.ref },
  ]);

  if (resolved.conflicts?.length) {
    throw new Error(`Cannot resolve ${source.uri}: ${resolved.conflicts[0]!.reason}`);
  }
  if (!resolved.resolved?.length) {
    throw new Error(`No version resolved for ${source.uri}`);
  }

  const entry = resolved.resolved[0]!;
  const blob = await client.downloadBlob(entry.digest);
  const content = Buffer.from(blob);
  const digest = sha256Prefixed(content);

  const blobHash = digest.replace("sha256:", "");
  const blobPath = join(blobDir(), blobHash);

  if (!existsSync(blobPath)) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(blobPath, content);
  }

  return { blobPath, digest, size: content.length };
}

/**
 * Installation orchestrator: fetch → verify → store in cache → link → update lockfile.
 */

import { existsSync, mkdirSync, symlinkSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import {
  addPackageToLock,
  readLockFile,
  writeLockFile,
  createEmptyLockFile,
  getWorkspaceLockPath,
  getUserSkillsDir,
} from "@kirakira/core";
import type { LockPackageEntry } from "@kirakira/core";

import { resolveSource } from "./resolver.js";
import { fetchPackage } from "./fetcher.js";
import { verifyDigestOrThrow } from "./verifier.js";
import { assertPackageInstallable, isReservedNamespace } from "@kirakira/core";
import type { InstalledPackage, InstallOptions, PackageKind } from "./types.js";

export interface InstallResult {
  installed: InstalledPackage;
  lockUpdated: boolean;
}

export async function installPackage(
  specifier: string,
  kind: PackageKind,
  options: InstallOptions,
  workspaceRoot: string,
): Promise<InstallResult> {
  const source = resolveSource(specifier);

  if (isReservedNamespace(source.uri) && !options.allowReservedNamespace) {
    throw new Error(
      `Cannot install from reserved namespace "${source.uri}". Reserved prefixes: @kirakira/, @kirakira-internal/, @system/, @enterprise/`,
    );
  }

  if (options.meta) {
    assertPackageInstallable(options.meta);
  }

  const fetchResult = await fetchPackage(source);
  verifyDigestOrThrow(fetchResult.blobPath, fetchResult.digest);

  const targetDir =
    options.scope === "user"
      ? getUserSkillsDir()
      : join(workspaceRoot, ".kirakira", "installed", kind);

  mkdirSync(targetDir, { recursive: true });
  const linkName = source.uri.replace(/[/\\:@]/g, "_");
  const linkPath = join(targetDir, linkName);

  if (!existsSync(linkPath)) {
    try {
      symlinkSync(fetchResult.blobPath, linkPath);
    } catch {
      copyFileSync(fetchResult.blobPath, linkPath);
    }
  }

  const lockPath = getWorkspaceLockPath(workspaceRoot);
  let lockFile = existsSync(lockPath)
    ? await readLockFile(lockPath)
    : createEmptyLockFile(workspaceRoot);

  const entry: LockPackageEntry = {
    kind,
    name: source.uri,
    version: source.ref ?? "0.0.0",
    source: specifier,
    digest: fetchResult.digest,
    trust: "user-approved",
    scope: options.scope,
    installedAt: new Date().toISOString(),
  };

  lockFile = addPackageToLock(lockFile, entry);
  await writeLockFile(lockPath, lockFile);

  const installed: InstalledPackage = {
    kind,
    name: source.uri,
    version: source.ref ?? "0.0.0",
    source,
    digest: fetchResult.digest,
    trustLevel: "user-approved",
    installedAt: entry.installedAt!,
    scope: options.scope,
    localPath: linkPath,
  };

  return { installed, lockUpdated: true };
}

export async function uninstallPackage(
  kind: PackageKind,
  name: string,
  workspaceRoot: string,
): Promise<boolean> {
  const lockPath = getWorkspaceLockPath(workspaceRoot);
  if (!existsSync(lockPath)) return false;

  const { removePackageFromLock } = await import("@kirakira/core");
  let lockFile = await readLockFile(lockPath);
  const before = lockFile.packages.length;
  lockFile = removePackageFromLock(lockFile, kind, name);

  if (lockFile.packages.length === before) return false;

  await writeLockFile(lockPath, lockFile);
  return true;
}

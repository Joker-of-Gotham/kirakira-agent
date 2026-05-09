import { readFile, writeFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { lockFileSchema } from "../schemas/lock.js";
import { LockfileError } from "../errors.js";
import { sha256File } from "../utils/digest.js";
import type { LockFile, LockPackageEntry, LockDiffEntry, LockIntegrityResult } from "../types/lock.js";

function compareVersions(from: string, to: string): "upgraded" | "downgraded" | "changed" {
  const parse = (v: string) => {
    const m = v.match(/^(\d+)\.(\d+)\.(\d+)/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] as const : null;
  };
  const a = parse(from);
  const b = parse(to);
  if (!a || !b) return "changed";
  for (let i = 0; i < 3; i++) {
    if (a[i]! < b[i]!) return "upgraded";
    if (a[i]! > b[i]!) return "downgraded";
  }
  return "changed";
}

export async function readLockFile(lockPath: string): Promise<LockFile> {
  if (!existsSync(lockPath)) {
    throw new LockfileError(`Lock file not found: ${lockPath}`);
  }
  const raw = await readFile(lockPath, "utf-8");
  const parsed = parseYaml(raw);
  const result = lockFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new LockfileError(
      `Invalid lock file: ${result.error.issues.map((i) => i.message).join(", ")}`,
    );
  }
  return result.data;
}

export async function writeLockFile(
  lockPath: string,
  lockFile: LockFile,
): Promise<void> {
  const result = lockFileSchema.safeParse(lockFile);
  if (!result.success) {
    throw new LockfileError(
      `Cannot write invalid lock file: ${result.error.issues.map((i) => i.message).join(", ")}`,
    );
  }

  const dir = dirname(lockPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const content = stringifyYaml(result.data, { indent: 2 });
  const tmpPath = `${lockPath}.tmp`;
  await writeFile(tmpPath, content, "utf-8");
  await rename(tmpPath, lockPath);
}

export function createEmptyLockFile(workspace: string): LockFile {
  return {
    schemaVersion: 1,
    workspace,
    generatedAt: new Date().toISOString(),
    packages: [],
  };
}

export function addPackageToLock(
  lockFile: LockFile,
  entry: LockPackageEntry,
): LockFile {
  const filtered = lockFile.packages.filter(
    (p) => !(p.kind === entry.kind && p.name === entry.name),
  );
  return {
    ...lockFile,
    generatedAt: new Date().toISOString(),
    packages: [...filtered, entry],
  };
}

export function removePackageFromLock(
  lockFile: LockFile,
  kind: string,
  name: string,
): LockFile {
  return {
    ...lockFile,
    generatedAt: new Date().toISOString(),
    packages: lockFile.packages.filter(
      (p) => !(p.kind === kind && p.name === name),
    ),
  };
}

export function diffLockFiles(
  before: LockFile,
  after: LockFile,
): LockDiffEntry[] {
  const diffs: LockDiffEntry[] = [];
  const beforeMap = new Map(
    before.packages.map((p) => [`${p.kind}:${p.name}`, p]),
  );
  const afterMap = new Map(
    after.packages.map((p) => [`${p.kind}:${p.name}`, p]),
  );

  for (const [key, pkg] of afterMap) {
    const prev = beforeMap.get(key);
    if (!prev) {
      diffs.push({
        kind: pkg.kind,
        name: pkg.name,
        action: "added",
        to: { version: pkg.version, digest: pkg.digest },
      });
    } else if (prev.digest !== pkg.digest) {
      const action = compareVersions(prev.version, pkg.version);
      diffs.push({
        kind: pkg.kind,
        name: pkg.name,
        action,
        from: { version: prev.version, digest: prev.digest },
        to: { version: pkg.version, digest: pkg.digest },
      });
    }
  }

  for (const [key, pkg] of beforeMap) {
    if (!afterMap.has(key)) {
      diffs.push({
        kind: pkg.kind,
        name: pkg.name,
        action: "removed",
        from: { version: pkg.version, digest: pkg.digest },
      });
    }
  }

  return diffs;
}

export function formatDiffSummary(diffs: readonly LockDiffEntry[]): string {
  if (diffs.length === 0) return "No changes.";
  const lines = diffs.map((d) => {
    switch (d.action) {
      case "added":
        return `+ ${d.kind}/${d.name} ${d.to!.version}`;
      case "removed":
        return `- ${d.kind}/${d.name} ${d.from!.version}`;
      case "upgraded":
        return `↑ ${d.kind}/${d.name} ${d.from!.version} → ${d.to!.version}`;
      case "downgraded":
        return `↓ ${d.kind}/${d.name} ${d.from!.version} → ${d.to!.version}`;
      case "changed":
        return `~ ${d.kind}/${d.name} ${d.from!.version} (digest changed)`;
    }
  });
  return lines.join("\n");
}

export async function validateLockIntegrity(
  lockFile: LockFile,
  cacheDir: string,
): Promise<LockIntegrityResult> {
  const errors: LockIntegrityResult["errors"] = [];

  for (const pkg of lockFile.packages) {
    const blobPath = join(cacheDir, "blobs", "sha256", pkg.digest.replace("sha256:", ""));
    if (!existsSync(blobPath)) {
      errors.push({
        package: `${pkg.kind}/${pkg.name}@${pkg.version}`,
        expected: pkg.digest,
        reason: "blob not found in cache",
      });
      continue;
    }
    try {
      const actualDigest = await sha256File(blobPath);
      if (actualDigest !== pkg.digest) {
        errors.push({
          package: `${pkg.kind}/${pkg.name}@${pkg.version}`,
          expected: pkg.digest,
          actual: actualDigest,
          reason: "digest mismatch",
        });
      }
    } catch (e) {
      errors.push({
        package: `${pkg.kind}/${pkg.name}@${pkg.version}`,
        expected: pkg.digest,
        reason: `read error: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

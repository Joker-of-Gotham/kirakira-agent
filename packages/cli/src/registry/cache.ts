import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  stat,
  readdir,
} from "node:fs/promises";
import { join } from "node:path";
import { PATHS, getUserCacheDir, getUserHome } from "@kirakira/core";

export function cacheRoot(): string {
  return getUserCacheDir();
}

export function blobPath(digest: string): string {
  const safe = digest.replace(/[^a-f0-9]/gi, "");
  return join(getUserHome(), PATHS.userCacheBlobs, safe.slice(0, 2), safe.slice(2));
}

export function manifestPath(name: string, version: string): string {
  const key = createHash("sha256")
    .update(`${name}@${version}`)
    .digest("hex");
  return join(getUserHome(), PATHS.userCacheManifests, `${key}.json`);
}

export async function ensureCacheDirs(): Promise<void> {
  await mkdir(join(getUserHome(), PATHS.userCacheBlobs), { recursive: true });
  await mkdir(join(getUserHome(), PATHS.userCacheManifests), { recursive: true });
}

export async function writeBlob(digest: string, bytes: Uint8Array): Promise<string> {
  await ensureCacheDirs();
  const fp = blobPath(digest);
  await mkdir(join(fp, ".."), { recursive: true });
  await writeFile(fp, bytes);
  return fp;
}

export async function readBlobIfExists(digest: string): Promise<Uint8Array | undefined> {
  try {
    const fp = blobPath(digest);
    return new Uint8Array(await readFile(fp));
  } catch {
    return undefined;
  }
}

export async function writeManifestJson(
  name: string,
  version: string,
  data: unknown,
): Promise<void> {
  await ensureCacheDirs();
  const fp = manifestPath(name, version);
  await mkdir(join(fp, ".."), { recursive: true });
  await writeFile(fp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function readManifestJson(
  name: string,
  version: string,
): Promise<unknown | undefined> {
  try {
    const fp = manifestPath(name, version);
    const raw = await readFile(fp, "utf8");
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export async function cacheIndexEstimate(): Promise<{ blobs: number; manifests: number }> {
  const blobsRoot = join(getUserHome(), PATHS.userCacheBlobs);
  const manifestsRoot = join(getUserHome(), PATHS.userCacheManifests);
  const countFiles = async (dir: string): Promise<number> => {
    try {
      const entries = await readdir(dir, { withFileTypes: true, recursive: true });
      let n = 0;
      for (const e of entries) {
        if (e.isFile()) n++;
      }
      return n;
    } catch {
      return 0;
    }
  };
  return { blobs: await countFiles(blobsRoot), manifests: await countFiles(manifestsRoot) };
}

export async function touchCacheEntry(digest: string): Promise<void> {
  const fp = blobPath(digest);
  await stat(fp);
}

/**
 * Content-addressable blob cache.
 *
 * Layout:
 *   ~/.kirakira/cache/blobs/sha256/<hex>   — blob files keyed by sha256 hash
 *   ~/.kirakira/cache/manifests/<name>.json — metadata cache
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { getUserCacheDir } from "@kirakira/core";

export interface CacheStats {
  blobCount: number;
  totalBytes: number;
  manifests: number;
}

export class BlobCache {
  private readonly blobDir: string;
  private readonly manifestDir: string;

  constructor(cacheRoot?: string) {
    const root = cacheRoot ?? getUserCacheDir();
    this.blobDir = join(root, "blobs", "sha256");
    this.manifestDir = join(root, "manifests");
    mkdirSync(this.blobDir, { recursive: true });
    mkdirSync(this.manifestDir, { recursive: true });
  }

  hasBlob(digest: string): boolean {
    return existsSync(this.blobPath(digest));
  }

  readBlob(digest: string): Buffer | null {
    const path = this.blobPath(digest);
    if (!existsSync(path)) return null;
    return readFileSync(path);
  }

  writeBlob(digest: string, data: Buffer): string {
    const path = this.blobPath(digest);
    if (!existsSync(path)) {
      writeFileSync(path, data);
    }
    return path;
  }

  removeBlob(digest: string): boolean {
    const path = this.blobPath(digest);
    if (!existsSync(path)) return false;
    unlinkSync(path);
    return true;
  }

  blobPath(digest: string): string {
    const hash = digest.replace("sha256:", "");
    return join(this.blobDir, hash);
  }

  readManifest<T>(name: string): T | null {
    const path = join(this.manifestDir, `${name}.json`);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, "utf-8")) as T;
    } catch {
      return null;
    }
  }

  writeManifest<T>(name: string, data: T): void {
    const path = join(this.manifestDir, `${name}.json`);
    writeFileSync(path, JSON.stringify(data, null, 2));
  }

  stats(): CacheStats {
    let blobCount = 0;
    let totalBytes = 0;
    if (existsSync(this.blobDir)) {
      const entries = readdirSync(this.blobDir);
      for (const entry of entries) {
        try {
          const s = statSync(join(this.blobDir, entry));
          if (s.isFile()) {
            blobCount++;
            totalBytes += s.size;
          }
        } catch {}
      }
    }

    let manifests = 0;
    if (existsSync(this.manifestDir)) {
      manifests = readdirSync(this.manifestDir).filter((f) => f.endsWith(".json")).length;
    }

    return { blobCount, totalBytes, manifests };
  }

  prune(maxBytes: number): number {
    const entries: Array<{ path: string; size: number; mtimeMs: number }> = [];
    if (!existsSync(this.blobDir)) return 0;

    for (const name of readdirSync(this.blobDir)) {
      const full = join(this.blobDir, name);
      try {
        const s = statSync(full);
        if (s.isFile()) {
          entries.push({ path: full, size: s.size, mtimeMs: s.mtimeMs });
        }
      } catch {}
    }

    const totalSize = entries.reduce((sum, e) => sum + e.size, 0);
    if (totalSize <= maxBytes) return 0;

    entries.sort((a, b) => a.mtimeMs - b.mtimeMs);

    let freed = 0;
    let removed = 0;
    const excess = totalSize - maxBytes;
    for (const entry of entries) {
      if (freed >= excess) break;
      try {
        unlinkSync(entry.path);
        freed += entry.size;
        removed++;
      } catch {}
    }
    return removed;
  }
}

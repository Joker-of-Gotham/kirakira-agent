import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import type { BlobAdapter, BlobMetadata, BlobObject } from "@kirakira/memory-core";

/**
 * Local-filesystem blob adapter for development and testing.
 * Follows the same hierarchical path structure as S3 but rooted at a local directory.
 *
 * Design doc: "直接文件系统：只用于本地开发和测试"
 */
export class FsBlobAdapter implements BlobAdapter {
  constructor(private readonly rootDir: string) {}

  private resolvePath(uri: string): string {
    const stripped = uri.replace(/^file:\/\//, "").replace(/^s3:\/\/[^/]+\//, "");
    return resolve(this.rootDir, stripped);
  }

  async put(uri: string, body: Buffer | ReadableStream, metadata: BlobMetadata): Promise<void> {
    const fp = this.resolvePath(uri);
    await mkdir(dirname(fp), { recursive: true });
    const buf = body instanceof Buffer ? body : Buffer.from(await new Response(body).arrayBuffer());
    await writeFile(fp, buf);

    const metaPath = fp + ".__meta__.json";
    await writeFile(metaPath, JSON.stringify(metadata, null, 2));
  }

  async get(uri: string): Promise<BlobObject | null> {
    const fp = this.resolvePath(uri);
    try {
      const buf = await readFile(fp);
      const meta = await this.head(uri);
      return {
        uri,
        body: buf,
        metadata: meta ?? {
          contentType: "application/octet-stream",
          sha256: createHash("sha256").update(buf).digest("hex"),
          size: buf.byteLength,
        },
      };
    } catch {
      return null;
    }
  }

  async head(uri: string): Promise<BlobMetadata | null> {
    const fp = this.resolvePath(uri);
    try {
      const metaPath = fp + ".__meta__.json";
      const raw = await readFile(metaPath, "utf-8");
      return JSON.parse(raw) as BlobMetadata;
    } catch {
      try {
        const buf = await readFile(fp);
        const hash = createHash("sha256").update(buf).digest("hex");
        return { contentType: "application/octet-stream", sha256: hash, size: buf.byteLength };
      } catch {
        return null;
      }
    }
  }

  async delete(uri: string): Promise<void> {
    const fp = this.resolvePath(uri);
    try {
      await unlink(fp);
    } catch { /* ignore */ }
    try {
      await unlink(fp + ".__meta__.json");
    } catch { /* ignore */ }
  }

  async list(prefix: string, limit = 1000): Promise<string[]> {
    const dir = resolve(this.rootDir, prefix);
    const out: string[] = [];
    try {
      await this.walk(dir, out, limit);
    } catch { /* empty dir */ }
    return out.map((p) => `file://${relative(this.rootDir, p)}`);
  }

  private async walk(dir: string, out: string[], limit: number): Promise<void> {
    if (out.length >= limit) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (out.length >= limit) return;
      const full = join(dir, e.name);
      if (e.name.endsWith(".__meta__.json")) continue;
      if (e.isDirectory()) {
        await this.walk(full, out, limit);
      } else {
        out.push(full);
      }
    }
  }

  async setWormRetention(_uri: string, _retainUntil: string): Promise<void> {
    // no-op for local FS
  }

  async setLegalHold(_uri: string, _hold: boolean): Promise<void> {
    // no-op for local FS
  }

  async close(): Promise<void> {
    // nothing to close
  }
}

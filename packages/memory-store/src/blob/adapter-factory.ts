import type { BlobAdapter } from "@kirakira/memory-core";

import { FsBlobAdapter } from "./fs-adapter.js";
import type { S3BlobClientConfig } from "./s3-client.js";
import { BlobPathBuilder } from "./path-builder.js";
import { WormManager, type WormManagerConfig } from "./worm-manager.js";

export type BlobBackend = "s3" | "fs";

export interface BlobAdapterFactoryConfig {
  backend: BlobBackend;
  /** S3/MinIO config — required when backend = "s3". */
  s3?: S3BlobClientConfig;
  /** Local root dir — required when backend = "fs". */
  rootDir?: string;
  /** WORM config (optional, only for s3 backend). */
  worm?: WormManagerConfig;
}

export interface BlobStack {
  adapter: BlobAdapter;
  pathBuilder: BlobPathBuilder;
  worm?: WormManager;
}

/**
 * Creates the appropriate blob adapter + path builder based on backend config.
 * Returns a BlobStack containing all blob utilities.
 */
export function createBlobStack(config: BlobAdapterFactoryConfig): BlobStack {
  if (config.backend === "fs") {
    const rootDir = config.rootDir ?? "./data/blobs";
    return {
      adapter: new FsBlobAdapter(rootDir),
      pathBuilder: new BlobPathBuilder("local"),
    };
  }

  if (!config.s3) {
    throw new Error("S3 config required for s3 backend");
  }

  const { S3BlobAdapterImpl } = lazyS3Adapter();
  const adapter = new S3BlobAdapterImpl(config.s3, config.worm);
  const pathBuilder = new BlobPathBuilder(config.s3.bucket);
  const worm = config.worm ? new WormManager(config.worm) : undefined;

  return { adapter, pathBuilder, worm };
}

function lazyS3Adapter() {
  const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    DeleteObjectCommand,
    ListObjectsV2Command,
  } = require("@aws-sdk/client-s3") as typeof import("@aws-sdk/client-s3");
  const { createHash } = require("node:crypto") as typeof import("node:crypto");

  class S3BlobAdapterImpl implements BlobAdapter {
    private readonly s3: InstanceType<typeof S3Client>;
    private readonly bucket: string;
    private readonly wormCfg?: WormManagerConfig;

    constructor(config: S3BlobClientConfig, wormCfg?: WormManagerConfig) {
      const { bucket, ...rest } = config;
      this.bucket = bucket;
      this.s3 = new S3Client(rest);
      this.wormCfg = wormCfg;
    }

    async put(uri: string, body: Buffer | ReadableStream, metadata: import("@kirakira/memory-core").BlobMetadata): Promise<void> {
      const key = this.keyFromUri(uri);
      const buf = body instanceof Buffer ? body : Buffer.from(await new Response(body).arrayBuffer());
      await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buf, ContentType: metadata.contentType }));
    }

    async get(uri: string): Promise<import("@kirakira/memory-core").BlobObject | null> {
      const key = this.keyFromUri(uri);
      try {
        const out = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
        if (!out.Body) return null;
        const bytes = await out.Body.transformToByteArray();
        const buf = Buffer.from(bytes);
        return {
          uri,
          body: buf,
          metadata: {
            contentType: out.ContentType ?? "application/octet-stream",
            sha256: createHash("sha256").update(buf).digest("hex"),
            size: buf.byteLength,
          },
        };
      } catch {
        return null;
      }
    }

    async head(uri: string): Promise<import("@kirakira/memory-core").BlobMetadata | null> {
      const key = this.keyFromUri(uri);
      try {
        const h = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
        return { contentType: h.ContentType ?? "application/octet-stream", sha256: h.ChecksumSHA256 ?? "", size: h.ContentLength ?? 0 };
      } catch {
        return null;
      }
    }

    async delete(uri: string): Promise<void> {
      const key = this.keyFromUri(uri);
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    }

    async list(prefix: string, limit = 1000): Promise<string[]> {
      const out = await this.s3.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, MaxKeys: limit }));
      return (out.Contents ?? []).map((c) => c.Key).filter((k): k is string => typeof k === "string").map((k) => `s3://${this.bucket}/${k}`);
    }

    async setWormRetention(uri: string, retainUntil: string): Promise<void> {
      if (!this.wormCfg) throw new Error("WORM not configured");
      const worm = new WormManager(this.wormCfg);
      try {
        await worm.setObjectRetention(this.keyFromUri(uri), retainUntil);
      } finally {
        worm.destroy();
      }
    }

    async setLegalHold(uri: string, hold: boolean): Promise<void> {
      if (!this.wormCfg) throw new Error("WORM not configured");
      const worm = new WormManager(this.wormCfg);
      try {
        await worm.setLegalHold(this.keyFromUri(uri), hold);
      } finally {
        worm.destroy();
      }
    }

    async close(): Promise<void> {
      this.s3.destroy();
    }

    private keyFromUri(uri: string): string {
      const prefix = `s3://${this.bucket}/`;
      if (uri.startsWith(prefix)) return uri.slice(prefix.length);
      if (uri.startsWith("/")) return uri.slice(1);
      return uri;
    }
  }

  return { S3BlobAdapterImpl };
}

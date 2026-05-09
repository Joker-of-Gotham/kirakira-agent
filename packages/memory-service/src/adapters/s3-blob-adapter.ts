import { createHash } from "node:crypto";

import type {
  BlobAdapter,
  BlobMetadata,
  BlobObject,
} from "@kirakira/memory-core";
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectRetentionCommand,
  PutObjectLegalHoldCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { S3BlobClient, type BlobConfig } from "@kirakira/memory-store";

export type { BlobConfig };

function toUri(bucket: string, key: string): string {
  return `s3://${bucket}/${key}`;
}

/**
 * Maps {@link BlobAdapter} onto {@link S3BlobClient} (key = path after bucket in URI).
 */
export class S3BlobAdapter implements BlobAdapter {
  private readonly client: S3BlobClient;
  private readonly bucket: string;
  private readonly s3: S3Client;

  constructor(config: BlobConfig) {
    const { bucket, ...rest } = config;
    this.bucket = bucket;
    this.client = new S3BlobClient(config);
    this.s3 = new S3Client(rest);
  }

  private keyFromUri(uri: string): string {
    const prefix = `s3://${this.bucket}/`;
    if (uri.startsWith(prefix)) {
      return uri.slice(prefix.length);
    }
    if (uri.startsWith("/")) {
      return uri.slice(1);
    }
    return uri;
  }

  async put(uri: string, body: Buffer | ReadableStream, metadata: BlobMetadata): Promise<void> {
    const key = this.keyFromUri(uri);
    const buf =
      body instanceof Buffer
        ? body
        : Buffer.from(await new Response(body).arrayBuffer());
    await this.client.putObject(key, buf, metadata.contentType);
  }

  async get(uri: string): Promise<BlobObject | null> {
    const key = this.keyFromUri(uri);
    try {
      const bytes = await this.client.getObjectBytes(key);
      const head = await this.client.headObject(key);
      const meta = await this.head(uri);
      return {
        uri,
        body: Buffer.from(bytes),
        metadata:
          meta ??
          ({
            contentType: head.contentType ?? "application/octet-stream",
            sha256: createHash("sha256").update(bytes).digest("hex"),
            size: bytes.byteLength,
          } satisfies BlobMetadata),
      };
    } catch {
      return null;
    }
  }

  async head(uri: string): Promise<BlobMetadata | null> {
    const key = this.keyFromUri(uri);
    try {
      const resp = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return {
        contentType: resp.ContentType ?? "application/octet-stream",
        sha256: resp.ChecksumSHA256 ?? "",
        size: resp.ContentLength ?? 0,
      };
    } catch {
      return null;
    }
  }

  async delete(uri: string): Promise<void> {
    const key = this.keyFromUri(uri);
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async list(prefix: string, limit = 1000): Promise<string[]> {
    const out = await this.s3.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        MaxKeys: limit,
      }),
    );
    return (out.Contents ?? [])
      .map((c) => c.Key)
      .filter((k): k is string => typeof k === "string")
      .map((k) => toUri(this.bucket, k));
  }

  async setWormRetention(uri: string, retainUntil: string): Promise<void> {
    const key = this.keyFromUri(uri);
    await this.s3.send(
      new PutObjectRetentionCommand({
        Bucket: this.bucket,
        Key: key,
        Retention: {
          Mode: "GOVERNANCE",
          RetainUntilDate: new Date(retainUntil),
        },
      }),
    );
  }

  async setLegalHold(uri: string, hold: boolean): Promise<void> {
    const key = this.keyFromUri(uri);
    await this.s3.send(
      new PutObjectLegalHoldCommand({
        Bucket: this.bucket,
        Key: key,
        LegalHold: { Status: hold ? "ON" : "OFF" },
      }),
    );
  }

  async close(): Promise<void> {
    this.s3.destroy();
  }
}

export function resolveEpisodeBodyUri(config: BlobConfig, tenantId: string, episodeId: string): string {
  return `s3://${config.bucket}/tenants/${tenantId}/episodes/${episodeId}.md`;
}

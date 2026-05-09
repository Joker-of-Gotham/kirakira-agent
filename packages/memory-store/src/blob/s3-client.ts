import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3ClientConfig as AwsS3ClientConfig,
  S3Client,
} from "@aws-sdk/client-s3";

export type S3BlobClientConfig = AwsS3ClientConfig & {
  bucket: string;
};

/** Alias for config maps that reference blob storage abstractly. */
export type BlobConfig = S3BlobClientConfig;

export class S3BlobClient {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(config: S3BlobClientConfig) {
    const { bucket, ...rest } = config;
    this.bucket = bucket;
    this.s3 = new S3Client(rest);
  }

  async putObject(key: string, body: Uint8Array | Buffer | string, contentType?: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async getObjectBytes(key: string): Promise<Uint8Array> {
    const out = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    if (!out.Body) {
      throw new Error(`s3 object empty: ${key}`);
    }
    return await out.Body.transformToByteArray();
  }

  async headObject(key: string): Promise<{ contentLength?: number; contentType?: string }> {
    const out = await this.s3.send(
      new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    return {
      contentLength: out.ContentLength,
      contentType: out.ContentType,
    };
  }
}

import {
  PutObjectLockConfigurationCommand,
  PutObjectRetentionCommand,
  PutObjectLegalHoldCommand,
  GetObjectRetentionCommand,
  GetObjectLegalHoldCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export interface WormManagerConfig {
  bucket: string;
  region?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  credentials?: { accessKeyId: string; secretAccessKey: string };
}

/**
 * Manages S3 Object Lock (WORM) retention and legal holds for audit artifacts.
 *
 * Requires the bucket to be created with Object Lock enabled.
 * Per the design doc, WORM should only be applied to audit evidence and regulated
 * artifacts — not indiscriminately to all personal data (which would conflict with
 * forget/deletion rights).
 */
export class WormManager {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(config: WormManagerConfig) {
    this.bucket = config.bucket;
    this.s3 = new S3Client({
      region: config.region ?? "us-east-1",
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle ?? true,
      credentials: config.credentials,
    });
  }

  async enableDefaultRetention(mode: "GOVERNANCE" | "COMPLIANCE", days: number): Promise<void> {
    await this.s3.send(
      new PutObjectLockConfigurationCommand({
        Bucket: this.bucket,
        ObjectLockConfiguration: {
          ObjectLockEnabled: "Enabled",
          Rule: {
            DefaultRetention: {
              Mode: mode,
              Days: days,
            },
          },
        },
      }),
    );
  }

  async setObjectRetention(key: string, retainUntilDate: string, mode: "GOVERNANCE" | "COMPLIANCE" = "GOVERNANCE"): Promise<void> {
    await this.s3.send(
      new PutObjectRetentionCommand({
        Bucket: this.bucket,
        Key: key,
        Retention: {
          Mode: mode,
          RetainUntilDate: new Date(retainUntilDate),
        },
      }),
    );
  }

  async getObjectRetention(key: string): Promise<{ mode?: string; retainUntilDate?: Date } | null> {
    try {
      const res = await this.s3.send(
        new GetObjectRetentionCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        mode: res.Retention?.Mode,
        retainUntilDate: res.Retention?.RetainUntilDate,
      };
    } catch {
      return null;
    }
  }

  async setLegalHold(key: string, hold: boolean): Promise<void> {
    await this.s3.send(
      new PutObjectLegalHoldCommand({
        Bucket: this.bucket,
        Key: key,
        LegalHold: { Status: hold ? "ON" : "OFF" },
      }),
    );
  }

  async getLegalHold(key: string): Promise<boolean> {
    try {
      const res = await this.s3.send(
        new GetObjectLegalHoldCommand({ Bucket: this.bucket, Key: key }),
      );
      return res.LegalHold?.Status === "ON";
    } catch {
      return false;
    }
  }

  destroy(): void {
    this.s3.destroy();
  }
}

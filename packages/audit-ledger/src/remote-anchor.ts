import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";

const execFileAsync = promisify(execFile);

export type AnchorBackend = "local-dir" | "s3" | "gcs" | "azure-blob" | "rekor";

export interface RemoteAnchorConfig {
  backend: AnchorBackend;
  localPath?: string;
  bucketUrl?: string;
  rekorUrl?: string;
}

export interface AnchorResult {
  backend: AnchorBackend;
  location: string;
  timestamp: string;
  checkpointDigest: string;
  success: boolean;
  error?: string;
}

function checkpointDigestFromJson(data: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return "";
  }
  if (typeof parsed !== "object" || parsed === null) return "";
  const o = parsed as Record<string, unknown>;
  const fromSnake = o.root_hash;
  const fromCamel = o.rootHash;
  if (typeof fromSnake === "string") return fromSnake;
  if (typeof fromCamel === "string") return fromCamel;
  return "";
}

export class RemoteAnchor {
  private config: RemoteAnchorConfig;

  constructor(config: RemoteAnchorConfig) {
    this.config = config;
  }

  async anchor(checkpointPath: string): Promise<AnchorResult> {
    const data = await readFile(checkpointPath, "utf-8");
    const digest = checkpointDigestFromJson(data);

    switch (this.config.backend) {
      case "local-dir":
        return this.anchorToLocalDir(checkpointPath, digest);
      case "s3":
      case "gcs":
      case "azure-blob":
        return this.anchorToObjectStorage(checkpointPath, digest);
      case "rekor":
        return this.anchorToRekor(checkpointPath, digest);
      default:
        return {
          backend: this.config.backend,
          location: "",
          timestamp: new Date().toISOString(),
          checkpointDigest: digest,
          success: false,
          error: `Unsupported backend: ${String(this.config.backend)}`,
        };
    }
  }

  private async anchorToLocalDir(checkpointPath: string, digest: string): Promise<AnchorResult> {
    const destDir = this.config.localPath || join(process.env.HOME || "~", ".kirakira", "audit", "anchors");
    await mkdir(destDir, { recursive: true });
    const destFile = join(destDir, basename(checkpointPath));
    const bytes = await readFile(checkpointPath);
    await writeFile(destFile, bytes);
    return {
      backend: "local-dir",
      location: destFile,
      timestamp: new Date().toISOString(),
      checkpointDigest: digest,
      success: true,
    };
  }

  private async anchorToObjectStorage(checkpointPath: string, digest: string): Promise<AnchorResult> {
    const bucketUrl = this.config.bucketUrl;
    if (!bucketUrl) {
      return {
        backend: this.config.backend,
        location: "",
        timestamp: new Date().toISOString(),
        checkpointDigest: digest,
        success: false,
        error: `No bucketUrl configured for ${this.config.backend}`,
      };
    }

    const dest = `${bucketUrl}/${basename(checkpointPath)}`;

    try {
      switch (this.config.backend) {
        case "s3": {
          await execFileAsync("aws", ["s3", "cp", checkpointPath, dest], { timeout: 30000 });
          break;
        }
        case "gcs": {
          await execFileAsync("gsutil", ["cp", checkpointPath, dest], { timeout: 30000 });
          break;
        }
        case "azure-blob": {
          // Parse container and blob from URL
          const url = new URL(bucketUrl);
          const container = url.pathname.split("/")[1] || "audit-anchors";
          await execFileAsync(
            "az",
            [
              "storage",
              "blob",
              "upload",
              "--file",
              checkpointPath,
              "--container-name",
              container,
              "--name",
              basename(checkpointPath),
              "--account-name",
              url.hostname.split(".")[0] || "",
            ],
            { timeout: 30000 },
          );
          break;
        }
      }
      return {
        backend: this.config.backend,
        location: dest,
        timestamp: new Date().toISOString(),
        checkpointDigest: digest,
        success: true,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        backend: this.config.backend,
        location: dest,
        timestamp: new Date().toISOString(),
        checkpointDigest: digest,
        success: false,
        error: `Upload failed: ${msg}`,
      };
    }
  }

  private async anchorToRekor(checkpointPath: string, digest: string): Promise<AnchorResult> {
    const rekorUrl = this.config.rekorUrl || "https://rekor.sigstore.dev";

    try {
      const { stdout } = await execFileAsync(
        "cosign",
        ["upload-blob", "--ct-log-url", rekorUrl, checkpointPath],
        { timeout: 60000 },
      );

      // Parse Rekor entry URL from cosign output
      const entryMatch = stdout.match(/https?:\/\/\S+/);
      const location = entryMatch ? entryMatch[0] : rekorUrl;

      return {
        backend: "rekor",
        location,
        timestamp: new Date().toISOString(),
        checkpointDigest: digest,
        success: true,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        backend: "rekor",
        location: rekorUrl,
        timestamp: new Date().toISOString(),
        checkpointDigest: digest,
        success: false,
        error: `Rekor upload failed: ${msg}`,
      };
    }
  }
}

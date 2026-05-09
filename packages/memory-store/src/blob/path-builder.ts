/**
 * Hierarchical S3/MinIO path builder aligned with the design doc layout:
 *
 *   tenants/{tenant}/workspaces/{ws}/episodes/yyyy/mm/dd/{episode_id}.json.zst
 *   tenants/{tenant}/workspaces/{ws}/artifacts/{artifact_id}/v{n}/payload.bin
 *   tenants/{tenant}/runs/{run_id}/checkpoints/{step_no}.msgpack.zst
 *   tenants/{tenant}/exports/{job_id}/manifest.json
 *   audit/{yyyy}/{mm}/{dd}/{audit_id}.json
 */

function dateParts(iso?: string): { yyyy: string; mm: string; dd: string } {
  const d = iso ? new Date(iso) : new Date();
  return {
    yyyy: String(d.getUTCFullYear()),
    mm: String(d.getUTCMonth() + 1).padStart(2, "0"),
    dd: String(d.getUTCDate()).padStart(2, "0"),
  };
}

export interface BlobPathBuilderConfig {
  bucket: string;
}

export class BlobPathBuilder {
  constructor(private readonly bucket: string) {}

  episodeBody(tenantId: string, workspaceId: string, episodeId: string, createdAt?: string): string {
    const { yyyy, mm, dd } = dateParts(createdAt);
    return `s3://${this.bucket}/tenants/${tenantId}/workspaces/${workspaceId}/episodes/${yyyy}/${mm}/${dd}/${episodeId}.json.zst`;
  }

  episodePrefix(tenantId: string, workspaceId: string): string {
    return `tenants/${tenantId}/workspaces/${workspaceId}/episodes/`;
  }

  artifact(tenantId: string, workspaceId: string, artifactId: string, version: number): string {
    return `s3://${this.bucket}/tenants/${tenantId}/workspaces/${workspaceId}/artifacts/${artifactId}/v${version}/payload.bin`;
  }

  artifactPrefix(tenantId: string, workspaceId: string, artifactId: string): string {
    return `tenants/${tenantId}/workspaces/${workspaceId}/artifacts/${artifactId}/`;
  }

  checkpoint(tenantId: string, runId: string, stepNo: number): string {
    return `s3://${this.bucket}/tenants/${tenantId}/runs/${runId}/checkpoints/${stepNo}.msgpack.zst`;
  }

  checkpointPrefix(tenantId: string, runId: string): string {
    return `tenants/${tenantId}/runs/${runId}/checkpoints/`;
  }

  exportManifest(tenantId: string, jobId: string): string {
    return `s3://${this.bucket}/tenants/${tenantId}/exports/${jobId}/manifest.json`;
  }

  exportData(tenantId: string, jobId: string, filename: string): string {
    return `s3://${this.bucket}/tenants/${tenantId}/exports/${jobId}/${filename}`;
  }

  auditEntry(auditId: string, createdAt?: string): string {
    const { yyyy, mm, dd } = dateParts(createdAt);
    return `s3://${this.bucket}/audit/${yyyy}/${mm}/${dd}/${auditId}.json`;
  }

  auditPrefix(year?: string, month?: string, day?: string): string {
    const parts = ["audit"];
    if (year) parts.push(year);
    if (month) parts.push(month);
    if (day) parts.push(day);
    return parts.join("/") + "/";
  }

  stripScheme(uri: string): string {
    const prefix = `s3://${this.bucket}/`;
    if (uri.startsWith(prefix)) return uri.slice(prefix.length);
    if (uri.startsWith("/")) return uri.slice(1);
    return uri;
  }
}

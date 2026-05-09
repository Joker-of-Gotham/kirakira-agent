export type PackageKind = "skill" | "mcp" | "plugin" | "bundle";

export type TrustLevel =
  | "internal-signed"
  | "enterprise-allow"
  | "user-approved"
  | "untrusted";

export type SourceType =
  | "registry"
  | "npm"
  | "github"
  | "local"
  | "oci"
  | "imported"
  | "url";

export type PackageState = "active" | "yanked" | "quarantined" | "archived";

export interface ProvenanceInfo {
  buildType: string;
  builder: string;
  sourceRepo?: string;
  sourceCommit?: string;
  buildTimestamp: string;
  attestationDigest?: string;
}

export interface PackageMeta {
  kind: PackageKind;
  name: string;
  version: string;
  description?: string;
  publisher: string;
  publishedAt: string;
  digest: string;
  signature?: string;
  trustLevel: TrustLevel;
  provenance?: ProvenanceInfo;
  tags?: string[];
  dependencies?: Record<string, string>;
  deprecated?: boolean;
  yanked?: boolean;
  state?: PackageState;
  yankedReason?: string;
  quarantinedReason?: string;
}

export interface SearchResult {
  total: number;
  packages: PackageMeta[];
}

export interface RegistryAuth {
  url: string;
  token: string;
  expiresAt?: string;
  userId?: string;
  scope?: string;
}

export interface TrustEntry {
  publisherId: string;
  level: TrustLevel;
  verifiedAt?: string;
  fingerprint?: string;
}

export interface ResolvedSource {
  type: SourceType;
  uri: string;
  ref?: string;
  subpath?: string;
}

export interface ResolveRequest {
  packages: Array<{
    kind: PackageKind;
    name: string;
    versionRange?: string;
  }>;
}

export interface ResolveResult {
  resolved: Array<{
    kind: PackageKind;
    name: string;
    version: string;
    digest: string;
    blobUrl: string;
    provenance?: ProvenanceInfo;
  }>;
  conflicts: Array<{
    name: string;
    reason: string;
  }>;
}

export interface PublishRequest {
  kind: PackageKind;
  name: string;
  version: string;
  description?: string;
  tags?: string[];
  digest: string;
  provenance?: ProvenanceInfo;
  blobData: Uint8Array;
}

export interface PublishResult {
  published: boolean;
  name: string;
  version: string;
  digest: string;
  url: string;
}

export interface InstalledPackage {
  kind: PackageKind;
  name: string;
  version: string;
  source: ResolvedSource;
  digest: string;
  trustLevel: TrustLevel;
  installedAt: string;
  scope: "workspace" | "user";
  localPath: string;
  provenance?: ProvenanceInfo;
}

export interface RegistryAdvisory {
  id: string;
  severity: "low" | "medium" | "high" | "critical";
  affectedPackage: string;
  affectedVersions: string;
  description: string;
  publishedAt: string;
}

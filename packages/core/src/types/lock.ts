import type { ProvenanceInfo } from "./registry.js";

export type LockPackageKind = "skill" | "mcp" | "plugin" | "bundle";

export type LockTrustLevel =
  | "internal-signed"
  | "enterprise-allow"
  | "user-approved"
  | "ask";

export interface LockPackageEntry {
  kind: LockPackageKind;
  name: string;
  version: string;
  source: string;
  registry?: string;
  ref?: string;
  digest: string;
  transport?: string;
  trust: LockTrustLevel;
  scope?: "workspace" | "user";
  installedAt?: string;
  provenance?: ProvenanceInfo;
}

export interface LockFile {
  schemaVersion: number;
  workspace: string;
  generatedAt: string;
  packages: LockPackageEntry[];
}

export interface LockDiffEntry {
  kind: LockPackageKind;
  name: string;
  action: "added" | "removed" | "upgraded" | "downgraded" | "changed";
  from?: { version: string; digest: string };
  to?: { version: string; digest: string };
}

export interface LockIntegrityResult {
  valid: boolean;
  errors: Array<{
    package: string;
    expected: string;
    actual?: string;
    reason: string;
  }>;
}

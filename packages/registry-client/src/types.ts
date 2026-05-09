import type {
  PackageKind,
  PackageMeta,
  ResolvedSource,
  SourceType,
  TrustLevel,
  ProvenanceInfo,
  InstalledPackage,
  PublishRequest,
  PublishResult,
  SearchResult,
  RegistryAuth,
} from "@kirakira/core";

export type {
  PackageKind,
  PackageMeta,
  ResolvedSource,
  SourceType,
  TrustLevel,
  ProvenanceInfo,
  InstalledPackage,
  PublishRequest,
  PublishResult,
  SearchResult,
  RegistryAuth,
};

export interface FetchResult {
  blobPath: string;
  digest: string;
  size: number;
}

export interface VerifyResult {
  valid: boolean;
  digest: string;
  signatureValid?: boolean;
  error?: string;
}

export interface InstallOptions {
  scope: "workspace" | "user";
  force?: boolean;
  skipVerify?: boolean;
  allowReservedNamespace?: boolean;
  meta?: { yanked?: boolean; state?: string; quarantinedReason?: string; yankedReason?: string };
}

export interface SearchOptions {
  kind?: PackageKind;
  query?: string;
  page?: number;
  perPage?: number;
  tags?: string[];
}

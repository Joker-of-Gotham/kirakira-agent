import { z } from "zod";

const packageKindSchema = z.enum(["skill", "mcp", "plugin", "bundle"]);
const trustLevelSchema = z.enum([
  "internal-signed",
  "enterprise-allow",
  "user-approved",
  "untrusted",
]);
const sourceTypeSchema = z.enum([
  "registry",
  "npm",
  "github",
  "local",
  "oci",
  "imported",
  "url",
]);

export const provenanceInfoSchema = z.object({
  buildType: z.string(),
  builder: z.string(),
  sourceRepo: z.string().optional(),
  sourceCommit: z.string().optional(),
  buildTimestamp: z.string(),
  attestationDigest: z.string().optional(),
});

const packageStateSchema = z.enum([
  "active",
  "yanked",
  "quarantined",
  "archived",
]);

export const packageMetaSchema = z.object({
  kind: packageKindSchema,
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  publisher: z.string().min(1),
  publishedAt: z.string(),
  digest: z.string().startsWith("sha256:"),
  signature: z.string().optional(),
  trustLevel: trustLevelSchema,
  provenance: provenanceInfoSchema.optional(),
  tags: z.array(z.string()).optional(),
  dependencies: z.record(z.string()).optional(),
  deprecated: z.boolean().optional(),
  yanked: z.boolean().optional(),
  state: packageStateSchema.optional(),
  yankedReason: z.string().optional(),
  quarantinedReason: z.string().optional(),
});

export const resolvedSourceSchema = z.object({
  type: sourceTypeSchema,
  uri: z.string().min(1),
  ref: z.string().optional(),
  subpath: z.string().optional(),
});

export const publishRequestSchema = z.object({
  kind: packageKindSchema,
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  digest: z.string().startsWith("sha256:"),
  provenance: provenanceInfoSchema.optional(),
});

export const publishResultSchema = z.object({
  published: z.boolean(),
  name: z.string(),
  version: z.string(),
  digest: z.string(),
  url: z.string(),
});

/** Reserved namespace prefixes that cannot be used by external publishers. */
export const RESERVED_NAMESPACES = [
  "@kirakira/",
  "@kirakira-internal/",
  "@system/",
  "@enterprise/",
] as const;

export function isReservedNamespace(name: string): boolean {
  const lower = name.toLowerCase();
  return RESERVED_NAMESPACES.some((ns) => lower.startsWith(ns));
}

export function assertPackageInstallable(meta: {
  yanked?: boolean;
  state?: string;
  quarantinedReason?: string;
  yankedReason?: string;
}): void {
  const state = meta.state ?? (meta.yanked ? "yanked" : "active");
  if (state === "yanked") {
    throw new Error(
      `Package is yanked and cannot be installed${meta.yankedReason ? `: ${meta.yankedReason}` : ""}`,
    );
  }
  if (state === "quarantined") {
    throw new Error(
      `Package is quarantined and cannot be installed${meta.quarantinedReason ? `: ${meta.quarantinedReason}` : ""}`,
    );
  }
  if (state === "archived") {
    throw new Error("Package is archived and cannot be installed");
  }
}

export {
  packageKindSchema,
  packageStateSchema,
  trustLevelSchema,
  sourceTypeSchema,
};

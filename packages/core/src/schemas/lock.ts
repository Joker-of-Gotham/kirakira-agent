import { z } from "zod";

const lockPackageKind = z.enum(["skill", "mcp", "plugin", "bundle"]);
const lockTrustLevel = z.enum([
  "internal-signed",
  "enterprise-allow",
  "user-approved",
  "ask",
]);

const provenanceInfoSchema = z.object({
  buildType: z.string(),
  builder: z.string(),
  sourceRepo: z.string().optional(),
  sourceCommit: z.string().optional(),
  buildTimestamp: z.string(),
  attestationDigest: z.string().optional(),
});

export const lockPackageEntrySchema = z.object({
  kind: lockPackageKind,
  name: z.string().min(1),
  version: z.string().min(1),
  source: z.string().min(1),
  registry: z.string().optional(),
  ref: z.string().optional(),
  digest: z.string().startsWith("sha256:"),
  transport: z.string().optional(),
  trust: lockTrustLevel,
  scope: z.enum(["workspace", "user"]).optional(),
  installedAt: z.string().optional(),
  provenance: provenanceInfoSchema.optional(),
});

export const lockFileSchema = z.object({
  schemaVersion: z.number().int().positive(),
  workspace: z.string().min(1),
  generatedAt: z.string().datetime(),
  packages: z.array(lockPackageEntrySchema),
});

export { lockPackageKind, lockTrustLevel, provenanceInfoSchema };

import { z } from "zod";

export const skillFrontmatterSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  version: z.string().optional(),
  compatibility: z.string().optional(),
  owner: z.string().optional(),
  "allowed-tools": z.union([z.string(), z.array(z.string())]).optional(),
  activation: z.array(z.string()).optional(),
  risk_level: z.string().optional(),
  requires_approval_for: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const skillSourceType = z.enum([
  "registry",
  "local",
  "imported-claude",
  "imported-codex",
  "imported-cursor",
  "imported-copilot",
  "imported-gemini",
  "github",
  "npm",
]);

const skillTrustLevel = z.enum([
  "internal-signed",
  "enterprise-allow",
  "user-approved",
  "ask",
  "untrusted",
]);

const skillActivationMode = z.enum([
  "auto-or-explicit",
  "explicit-only",
  "auto",
]);

export const skillManifestSchema = z.object({
  kind: z.literal("skill"),
  schemaVersion: z.number().int().positive(),
  name: z.string().min(1),
  displayName: z.string(),
  source: z.object({
    type: skillSourceType,
    path: z.string(),
  }),
  trust: z.object({
    level: skillTrustLevel,
    publisher: z.string(),
  }),
  activation: z.object({
    mode: skillActivationMode,
    aliases: z.array(z.string()),
  }),
  files: z.object({
    entry: z.string(),
    scripts: z.array(z.string()),
    references: z.array(z.string()),
  }),
  compat: z.object({
    format: z.string(),
    importedFrom: z.string().optional(),
  }),
});

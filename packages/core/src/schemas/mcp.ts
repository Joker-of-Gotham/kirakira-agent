import { z } from "zod";

const mcpTransportKind = z.enum(["stdio", "http", "sse_legacy"]);
const mcpAuthMode = z.enum(["none", "bearer", "oauth", "oidc", "env"]);
const mcpTrustLevel = z.enum([
  "internal-signed",
  "enterprise-allow",
  "user-approved",
  "ask",
  "untrusted",
]);

const stdioTransportSchema = z.object({
  kind: z.literal("stdio"),
  command: z.string().min(1),
  args: z.array(z.string()),
  env: z.record(z.string()).optional(),
});

const httpTransportSchema = z.object({
  kind: z.literal("http"),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
});

const sseLegacyTransportSchema = z.object({
  kind: z.literal("sse_legacy"),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
});

export const mcpTransportSchema = z.discriminatedUnion("kind", [
  stdioTransportSchema,
  httpTransportSchema,
  sseLegacyTransportSchema,
]);

export const mcpAuthSchema = z.object({
  mode: mcpAuthMode,
  scopes: z.array(z.string()).optional(),
  issuerUrl: z.string().optional(),
  clientId: z.string().optional(),
  clientSecretEnv: z.string().optional(),
  tokenUrl: z.string().optional(),
});

export const mcpServerConfigSchema = z.object({
  name: z.string().min(1),
  transport: mcpTransportSchema,
  auth: mcpAuthSchema,
  tools: z
    .object({
      enabled: z.array(z.string()).optional(),
      disabled: z.array(z.string()).optional(),
    })
    .optional(),
  timeouts: z
    .object({
      startupSec: z.number().positive(),
      toolSec: z.number().positive(),
    })
    .optional(),
  trust: mcpTrustLevel,
});

export const mcpManifestSchema = z.object({
  kind: z.literal("mcp"),
  schemaVersion: z.number().int().positive(),
  name: z.string().min(1),
  source: z.object({
    type: z.string(),
    file: z.string().optional(),
  }),
  transport: mcpTransportSchema,
  auth: mcpAuthSchema,
  tools: z
    .object({
      enabled: z.array(z.string()).optional(),
    })
    .optional(),
  timeouts: z
    .object({
      startupSec: z.number().positive(),
      toolSec: z.number().positive(),
    })
    .optional(),
  trust: z.object({
    level: mcpTrustLevel,
  }),
  compat: z
    .object({
      importedFrom: z.string().optional(),
    })
    .optional(),
});

export const mcpConfigFileSchema = z.object({
  mcpServers: z.record(
    z.object({
      type: z.string().optional(),
      command: z.string().optional(),
      args: z.array(z.string()).optional(),
      url: z.string().optional(),
      env: z.record(z.string()).optional(),
      headers: z.record(z.string()).optional(),
      tools: z.array(z.string()).optional(),
      timeout: z.number().optional(),
    }),
  ),
});

export { mcpTransportKind, mcpAuthMode, mcpTrustLevel };

export type McpTransportKind = "stdio" | "http" | "sse_legacy";

export type McpAuthMode = "none" | "bearer" | "oauth" | "oidc" | "env";

export type McpTrustLevel =
  | "internal-signed"
  | "enterprise-allow"
  | "user-approved"
  | "ask"
  | "untrusted";

export interface McpStdioTransport {
  kind: "stdio";
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface McpHttpTransport {
  kind: "http";
  url: string;
  headers?: Record<string, string>;
}

export interface McpSseLegacyTransport {
  kind: "sse_legacy";
  url: string;
  headers?: Record<string, string>;
}

export type McpTransport =
  | McpStdioTransport
  | McpHttpTransport
  | McpSseLegacyTransport;

export interface McpAuth {
  mode: McpAuthMode;
  scopes?: string[];
  issuerUrl?: string;
  clientId?: string;
  clientSecretEnv?: string;
  tokenUrl?: string;
}

export interface McpServerConfig {
  name: string;
  transport: McpTransport;
  auth: McpAuth;
  tools?: {
    enabled?: string[];
    disabled?: string[];
  };
  timeouts?: {
    startupSec: number;
    toolSec: number;
  };
  trust: McpTrustLevel;
}

export interface McpManifest {
  kind: "mcp";
  schemaVersion: number;
  name: string;
  source: {
    type: string;
    file?: string;
  };
  transport: McpTransport;
  auth: McpAuth;
  tools?: {
    enabled?: string[];
  };
  timeouts?: {
    startupSec: number;
    toolSec: number;
  };
  trust: {
    level: McpTrustLevel;
  };
  compat?: {
    importedFrom?: string;
  };
}

export interface McpConfigFile {
  mcpServers: Record<string, McpServerEntry>;
}

export interface McpServerEntry {
  type?: string;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  tools?: string[];
  timeout?: number;
}

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpHealthResult {
  server: string;
  healthy: boolean;
  toolCount?: number;
  latencyMs?: number;
  error?: string;
}

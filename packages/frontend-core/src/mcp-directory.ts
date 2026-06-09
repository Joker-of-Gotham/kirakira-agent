import type {
  RuntimeMcpListResult,
  RuntimeMcpAuditMetadata,
  RuntimeMcpOtelMetadata,
  RuntimeMcpPolicyMetadata,
  RuntimeMcpServerHealth,
  RuntimeMcpServerStatus,
  RuntimeMcpToolSummary,
  RuntimeMcpTrustMetadata,
} from "@kirakira/runtime-contracts";

export type RuntimeMcpHealthTone = "ready" | "pending" | "warning" | "failed" | "stopped";

export interface RuntimeMcpDirectoryTool {
  id: string;
  server: string;
  name: string;
  title: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  execution?: Record<string, unknown>;
  trust?: RuntimeMcpTrustMetadata;
  policy?: RuntimeMcpPolicyMetadata;
  audit?: RuntimeMcpAuditMetadata;
  otel?: RuntimeMcpOtelMetadata;
  inputPropertyCount: number;
  requiredInputCount: number;
  inputFields: RuntimeMcpDirectoryInputField[];
  argumentDraft: string;
}

export interface RuntimeMcpDirectoryServer {
  name: string;
  health: RuntimeMcpServerHealth;
  tone: RuntimeMcpHealthTone;
  toolCount: number;
  discoveredToolCount: number;
  tools: RuntimeMcpDirectoryTool[];
  error?: string;
  trust?: RuntimeMcpTrustMetadata;
  policy?: RuntimeMcpPolicyMetadata;
  audit?: RuntimeMcpAuditMetadata;
  otel?: RuntimeMcpOtelMetadata;
}

export interface RuntimeMcpDirectoryInputField {
  name: string;
  required: boolean;
  type: string;
  description?: string;
  defaultValue: unknown;
}

export interface RuntimeMcpDirectorySummary {
  serverCount: number;
  readyServerCount: number;
  attentionServerCount: number;
  toolCount: number;
}

export interface RuntimeMcpDirectoryView {
  generatedAt?: string;
  summary: RuntimeMcpDirectorySummary;
  servers: RuntimeMcpDirectoryServer[];
  tools: RuntimeMcpDirectoryTool[];
}

const HEALTH_ORDER: Record<RuntimeMcpHealthTone, number> = {
  failed: 0,
  warning: 1,
  pending: 2,
  stopped: 3,
  ready: 4,
};

function healthTone(health: RuntimeMcpServerHealth): RuntimeMcpHealthTone {
  if (health === "healthy") return "ready";
  if (health === "starting") return "pending";
  if (health === "degraded") return "warning";
  if (health === "unhealthy") return "failed";
  return "stopped";
}

function schemaRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function schemaPropertyCount(schema: Record<string, unknown> | undefined): number {
  const properties = schemaRecord(schema?.properties);
  return properties ? Object.keys(properties).length : 0;
}

function requiredInputCount(schema: Record<string, unknown> | undefined): number {
  return Array.isArray(schema?.required)
    ? schema.required.filter((item): item is string => typeof item === "string").length
    : 0;
}

function schemaRequiredSet(schema: Record<string, unknown> | undefined): Set<string> {
  return new Set(
    Array.isArray(schema?.required)
      ? schema.required.filter((item): item is string => typeof item === "string")
      : [],
  );
}

function schemaType(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").join(" | ");
  return "unknown";
}

function defaultValueForSchema(schema: Record<string, unknown> | undefined): unknown {
  if (!schema) return "";
  if (schema.default !== undefined) return schema.default;
  const type = schemaType(schema.type);
  if (type.includes("array")) return [];
  if (type.includes("object")) return {};
  if (type.includes("boolean")) return false;
  if (type.includes("integer") || type.includes("number")) return 0;
  return "";
}

function inputFields(schema: Record<string, unknown> | undefined): RuntimeMcpDirectoryInputField[] {
  const properties = schemaRecord(schema?.properties);
  if (!properties) return [];
  const required = schemaRequiredSet(schema);
  return Object.entries(properties)
    .map(([name, raw]) => {
      const fieldSchema = schemaRecord(raw);
      return {
        name,
        required: required.has(name),
        type: schemaType(fieldSchema?.type),
        ...(typeof fieldSchema?.description === "string" ? { description: fieldSchema.description } : {}),
        defaultValue: defaultValueForSchema(fieldSchema),
      };
    })
    .sort((a, b) => {
      if (a.required !== b.required) return a.required ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

function argumentDraftForFields(fields: RuntimeMcpDirectoryInputField[]): string {
  const draft = Object.fromEntries(
    fields
      .filter((field) => field.required)
      .map((field) => [field.name, field.defaultValue]),
  );
  return JSON.stringify(draft, null, 2);
}

function toolTitle(tool: RuntimeMcpToolSummary): string {
  return tool.title?.trim() || tool.name;
}

function directoryTool(
  server: RuntimeMcpServerStatus,
  tool: RuntimeMcpToolSummary,
): RuntimeMcpDirectoryTool {
  const fields = inputFields(tool.inputSchema);
  return {
    id: `${server.name}:${tool.name}`,
    server: server.name,
    name: tool.name,
    title: toolTitle(tool),
    ...(tool.description ? { description: tool.description } : {}),
    ...(tool.inputSchema ? { inputSchema: tool.inputSchema } : {}),
    ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
    ...(tool.annotations ? { annotations: tool.annotations } : {}),
    ...(tool.execution ? { execution: tool.execution } : {}),
    ...(tool.trust ?? server.trust ? { trust: tool.trust ?? server.trust } : {}),
    ...(tool.policy ?? server.policy ? { policy: tool.policy ?? server.policy } : {}),
    ...(tool.audit ?? server.audit ? { audit: tool.audit ?? server.audit } : {}),
    ...(tool.otel ?? server.otel ? { otel: tool.otel ?? server.otel } : {}),
    inputPropertyCount: schemaPropertyCount(tool.inputSchema),
    requiredInputCount: requiredInputCount(tool.inputSchema),
    inputFields: fields,
    argumentDraft: argumentDraftForFields(fields),
  };
}

function directoryServer(server: RuntimeMcpServerStatus): RuntimeMcpDirectoryServer {
  const tools = (server.tools ?? [])
    .map((tool) => directoryTool(server, tool))
    .sort((a, b) => a.title.localeCompare(b.title));
  return {
    name: server.name,
    health: server.health,
    tone: healthTone(server.health),
    toolCount: server.toolCount ?? tools.length,
    discoveredToolCount: tools.length,
    tools,
    ...(server.error ? { error: server.error } : {}),
    ...(server.trust ? { trust: server.trust } : {}),
    ...(server.policy ? { policy: server.policy } : {}),
    ...(server.audit ? { audit: server.audit } : {}),
    ...(server.otel ? { otel: server.otel } : {}),
  };
}

export function createMcpDirectoryView(
  result: RuntimeMcpListResult | undefined,
): RuntimeMcpDirectoryView {
  const servers = (result?.servers ?? [])
    .map(directoryServer)
    .sort((a, b) => {
      const byHealth = HEALTH_ORDER[a.tone] - HEALTH_ORDER[b.tone];
      if (byHealth !== 0) return byHealth;
      return a.name.localeCompare(b.name);
    });
  const tools = servers.flatMap((server) => server.tools);
  return {
    ...(result?.generatedAt ? { generatedAt: result.generatedAt } : {}),
    summary: {
      serverCount: servers.length,
      readyServerCount: servers.filter((server) => server.tone === "ready").length,
      attentionServerCount: servers.filter((server) =>
        server.tone === "failed" || server.tone === "warning",
      ).length,
      toolCount: servers.reduce((total, server) => total + server.toolCount, 0),
    },
    servers,
    tools,
  };
}

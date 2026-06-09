import type {
  RuntimeMcpListResult,
  RuntimeMcpServerHealth,
  RuntimeMcpServerStatus,
  RuntimeMcpToolSummary,
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
  inputPropertyCount: number;
  requiredInputCount: number;
}

export interface RuntimeMcpDirectoryServer {
  name: string;
  health: RuntimeMcpServerHealth;
  tone: RuntimeMcpHealthTone;
  toolCount: number;
  discoveredToolCount: number;
  tools: RuntimeMcpDirectoryTool[];
  error?: string;
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

function toolTitle(tool: RuntimeMcpToolSummary): string {
  return tool.title?.trim() || tool.name;
}

function directoryTool(server: string, tool: RuntimeMcpToolSummary): RuntimeMcpDirectoryTool {
  return {
    id: `${server}:${tool.name}`,
    server,
    name: tool.name,
    title: toolTitle(tool),
    ...(tool.description ? { description: tool.description } : {}),
    ...(tool.inputSchema ? { inputSchema: tool.inputSchema } : {}),
    ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
    inputPropertyCount: schemaPropertyCount(tool.inputSchema),
    requiredInputCount: requiredInputCount(tool.inputSchema),
  };
}

function directoryServer(server: RuntimeMcpServerStatus): RuntimeMcpDirectoryServer {
  const tools = (server.tools ?? [])
    .map((tool) => directoryTool(server.name, tool))
    .sort((a, b) => a.title.localeCompare(b.title));
  return {
    name: server.name,
    health: server.health,
    tone: healthTone(server.health),
    toolCount: server.toolCount ?? tools.length,
    discoveredToolCount: tools.length,
    tools,
    ...(server.error ? { error: server.error } : {}),
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

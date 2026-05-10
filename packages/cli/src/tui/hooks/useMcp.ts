import { useState, useEffect, useRef, useCallback } from "react";
import { existsSync, readFileSync } from "node:fs";
import { getMcpConfigPath } from "@kirakira/core";
import {
  McpClientManager,
  parseMcpConfigJson,
  McpGateway,
  type GatewayTool,
} from "@kirakira/mcp-adapter";
import type { McpServerStatus } from "../types.js";

export interface McpToolDescriptor {
  alias: string;
  server: string;
  nativeTool: string;
  description: string;
  riskLevel: string;
  readOnly: boolean;
  inputSchema?: Record<string, unknown>;
}

export interface UseMcpReturn {
  servers: McpServerStatus[];
  tools: McpToolDescriptor[];
  ready: boolean;
  error?: string;
  callTool: (alias: string, args: Record<string, unknown>) => Promise<{
    ok: boolean;
    content: unknown;
    latencyMs: number;
    error?: string;
  }>;
  refresh: () => Promise<void>;
  reload: () => Promise<void>;
}

export function useMcp(workspaceRoot: string): UseMcpReturn {
  const [servers, setServers] = useState<McpServerStatus[]>([]);
  const [tools, setTools] = useState<McpToolDescriptor[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const gatewayRef = useRef<McpGateway | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    void startMcp();

    return () => {
      gatewayRef.current?.stopAll().catch(() => {});
    };
  }, []);

  async function startMcp(): Promise<void> {
    setReady(false);
    setError(undefined);
    const configPath = getMcpConfigPath(workspaceRoot);
    if (!existsSync(configPath)) {
      setError("No .mcp.json found");
      setServers([]);
      setTools([]);
      setReady(true);
      return;
    }

    let raw: string;
    try {
      raw = readFileSync(configPath, "utf-8");
    } catch (e) {
      setError(`Failed to read ${configPath}: ${e instanceof Error ? e.message : String(e)}`);
      setServers([]);
      setTools([]);
      setReady(true);
      return;
    }

    let configs;
    try {
      configs = parseMcpConfigJson(raw);
    } catch (e) {
      setError(`Invalid .mcp.json: ${e instanceof Error ? e.message : String(e)}`);
      setServers([]);
      setTools([]);
      setReady(true);
      return;
    }

    if (configs.length === 0) {
      setServers([]);
      setTools([]);
      setReady(true);
      return;
    }

    await gatewayRef.current?.stopAll().catch(() => {});
    gatewayRef.current = null;

    setServers(
      configs.map((c) => ({
        name: c.name,
        transport: c.transport.kind,
        healthy: false,
        health: "starting",
      })),
    );

    const manager = new McpClientManager();
    manager.registerMany(configs);

    const gateway = new McpGateway({ manager });
    gatewayRef.current = gateway;

    try {
      await gateway.startAll();
    } catch (e) {
      // partial start is OK
      setError(e instanceof Error ? e.message : String(e));
    }

    syncState(gateway);
    setReady(true);
  }

  function syncState(gateway: McpGateway): void {
    const summary = gateway.getSummary();
    setServers(
      summary.servers.map((s) => ({
        name: s.name,
        transport: "stdio",
        healthy: s.health === "healthy",
        health: s.health,
        error: s.error,
      })),
    );
    setTools(
      (gateway.getTools() as readonly GatewayTool[]).map((t) => ({
        alias: t.alias,
        server: t.server,
        nativeTool: t.nativeTool,
        description: t.description,
        riskLevel: t.riskLevel,
        readOnly: t.readOnly,
        inputSchema: t.inputSchema,
      })),
    );
  }

  const callTool = useCallback(
    async (
      alias: string,
      args: Record<string, unknown>,
    ): Promise<{ ok: boolean; content: unknown; latencyMs: number; error?: string }> => {
      const gw = gatewayRef.current;
      if (!gw) {
        return { ok: false, content: null, latencyMs: 0, error: "MCP Gateway not ready" };
      }
      const result = await gw.callTool(alias, args);
      return {
        ok: !result.error,
        content: result.content,
        latencyMs: result.latencyMs,
        error: result.error,
      };
    },
    [],
  );

  const refresh = useCallback(async () => {
    const gw = gatewayRef.current;
    if (!gw) return;
    await gw.refreshToolCache();
    syncState(gw);
  }, []);

  const reload = useCallback(async () => {
    await gatewayRef.current?.stopAll().catch(() => {});
    gatewayRef.current = null;
    await startMcp();
  }, [workspaceRoot]);

  return { servers, tools, ready, error, callTool, refresh, reload };
}

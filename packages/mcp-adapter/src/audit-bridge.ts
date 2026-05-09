/**
 * MCP audit funnel — persists tool and connection telemetry into the canonical audit ledger.
 */

import { randomUUID } from "node:crypto";

import {
  LedgerWriter,
  getAuditLedgerDir,
} from "@kirakira/audit-ledger";

/** Ledger append payload (omit hash-chain fields appended by LedgerWriter). */
type LedgerAppendInput = Parameters<LedgerWriter["append"]>[0];

export interface AuditBridgeOptions {
  ledgerBaseDir?: string;
}

export class McpAuditBridge {
  private readonly ledgerBaseDir: string;
  private writer?: LedgerWriter;

  constructor(options?: AuditBridgeOptions) {
    this.ledgerBaseDir =
      typeof options?.ledgerBaseDir === "string" && options.ledgerBaseDir.length > 0
        ? options.ledgerBaseDir
        : getAuditLedgerDir();
  }

  private getWriter(): LedgerWriter {
    if (this.writer === undefined) {
      this.writer = new LedgerWriter({ baseDir: this.ledgerBaseDir });
    }
    return this.writer;
  }

  private ts(): string {
    return new Date().toISOString();
  }

  async recordToolCall(params: {
    serverId: string;
    toolName: string;
    trustTier: string;
    authMode?: string;
    args?: Record<string, unknown>;
    result?: unknown;
    userId: string;
    sessionId: string;
    traceId: string;
    decisionId?: string;
    status: "success" | "error";
    errorMessage?: string;
  }): Promise<void> {
    const event: LedgerAppendInput = {
      version: "kirakira.audit.v1",
      event_id: randomUUID(),
      ts: this.ts(),
      trace_id: params.traceId,
      ...(params.decisionId !== undefined ? { decision_id: params.decisionId } : {}),
      kind: "tool.result",
      actor: {
        user_id: params.userId,
        interactive: true,
      },
      subject: {
        tool_type: "mcp",
        tool_name: params.toolName,
        mcp_server_id: params.serverId,
      },
      result: {
        status: params.status,
        ...(params.errorMessage !== undefined && params.errorMessage.length > 0
          ? { error_message: params.errorMessage }
          : {}),
        reason_codes: [
          ...(params.authMode !== undefined ? [`auth_mode:${params.authMode}`] : []),
          `trust:${params.trustTier}`,
          ...(params.args !== undefined ? ["args_logged"] : []),
        ],
      },
    };

    await this.append(event);
  }

  async recordConnection(params: {
    serverId: string;
    trustTier: string;
    transport: string;
    status: "connected" | "failed" | "disconnected";
    userId: string;
    sessionId: string;
    traceId: string;
  }): Promise<void> {
    const mapStatus =
      params.status === "failed" ? ("error" as const) : ("success" as const);

    const event: LedgerAppendInput = {
      version: "kirakira.audit.v1",
      event_id: randomUUID(),
      ts: this.ts(),
      trace_id: params.traceId || params.sessionId,
      kind: "tool.exec",
      actor: {
        user_id: params.userId,
        interactive: true,
      },
      subject: {
        tool_type: "mcp",
        tool_name: `${params.transport}:connection:${params.status}`,
        mcp_server_id: params.serverId,
      },
      result: {
        status: mapStatus,
        reason_codes: [`transport:${params.transport}`, `trust:${params.trustTier}`, `session:${params.sessionId}`],
      },
    };

    await this.append(event);
  }

  private async append(inp: LedgerAppendInput): Promise<void> {
    const w = this.getWriter();
    await w.append(inp);
  }
}

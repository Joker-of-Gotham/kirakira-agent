export type SpanName =
  | "session.start"
  | "prompt.submit"
  | "attachment.resolve"
  | "skill.select"
  | "mcp.connect"
  | "mcp.invoke"
  | "shell.exec"
  | "approval.wait"
  | "approval.decision"
  | "output.emit"
  | "policy.evaluate"
  | "approval.request"
  | "sandbox.exec"
  | "audit.append"
  | "gen_ai.chat"
  | "mcp.tool_call"
  | "skill.script"
  | "file.mutate"
  | "network.http"
  | "cli.command"
  | "agent.run";

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: SpanName;
  startTime: string;
  endTime?: string;
  status: "ok" | "error" | "unset";
  attributes: Record<string, string | number | boolean>;
}

export interface AuditEntry {
  ts: string;
  traceId: string;
  runId: string;
  userId?: string;
  agentId?: string;
  subagent?: string;
  skill?: string;
  tool?: string;
  approvalTicket?: string;
  decision?: "approved" | "denied" | "blocked";
  inputHash?: string;
  outputHash?: string;
  tokenIn?: number;
  tokenOut?: number;
  costUsd?: number;
  status: "success" | "error" | "pending";
}

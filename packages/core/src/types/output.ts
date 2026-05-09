export type OutputMode = "human" | "json" | "jsonl";

export type OutputEventType =
  | "session.start"
  | "session.finish"
  | "attachment.resolved"
  | "skill.activated"
  | "mcp.invoke"
  | "approval.requested"
  | "approval.decided"
  | "shell.executed"
  | "output.artifact"
  | "error";

export interface OutputEvent {
  ts: string;
  event: OutputEventType;
  sessionId: string;
  traceId: string;
  data?: Record<string, unknown>;
}

export interface ExecResult {
  sessionId: string;
  traceId: string;
  status: "ok" | "error";
  mode: "exec";
  result?: {
    summary: string;
    artifacts: string[];
  };
  error?: {
    code: string;
    message: string;
  };
  usage?: {
    tokenIn: number;
    tokenOut: number;
    costUsd: number;
    durationMs: number;
  };
}

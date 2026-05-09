export interface Session {
  id: string;
  traceId: string;
  startedAt: string;
  endedAt?: string;
  workspaceName?: string;
  model: string;
  mode: SessionMode;
  status: SessionStatus;
  eventCount: number;
}

export type SessionMode = "repl" | "exec" | "plan" | "ask" | "shell";

export type SessionStatus = "active" | "completed" | "error" | "suspended";

export type SessionEventType =
  | "session.start"
  | "session.finish"
  | "prompt.submit"
  | "response.chunk"
  | "response.complete"
  | "attachment.resolved"
  | "skill.activated"
  | "mcp.invoke"
  | "mcp.result"
  | "shell.exec"
  | "shell.result"
  | "approval.requested"
  | "approval.decided"
  | "error"
  | "context.compact";

export interface SessionEvent {
  ts: string;
  event: SessionEventType;
  sessionId: string;
  traceId: string;
  spanId?: string;
  data?: Record<string, unknown>;
}

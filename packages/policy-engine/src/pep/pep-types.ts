import type { PolicyDecision } from "@kirakira/core";

export interface EnforcementResult {
  allowed: boolean;
  decision: PolicyDecision;
  executionResult?: unknown;
  traceId: string;
}

export interface PepAgentContext {
  subagentId?: string;
  role?: string;
  lane?: string;
  requestedLane?: string;
  topologyId?: string;
  handoffId?: string;
}

export interface PepContext {
  sessionId: string;
  traceId: string;
  userId: string;
  workspaceRoot: string;
  interactive: boolean;
  roles: string[];
  agent?: PepAgentContext;
}

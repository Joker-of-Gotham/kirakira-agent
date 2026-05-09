import type { PolicyDecision } from "@kirakira/core";

export interface EnforcementResult {
  allowed: boolean;
  decision: PolicyDecision;
  executionResult?: unknown;
  traceId: string;
}

export interface PepContext {
  sessionId: string;
  traceId: string;
  userId: string;
  workspaceRoot: string;
  interactive: boolean;
  roles: string[];
}

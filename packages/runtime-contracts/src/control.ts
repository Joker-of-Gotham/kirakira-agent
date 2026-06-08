export type RuntimeRunMode = "interactive" | "headless" | "dry_run";

export interface RuntimeRunOptions {
  budgetUsd?: number;
  workspaceRoot?: string;
  metadata?: Record<string, unknown>;
}

export type ControlMessage =
  | {
      type: "submit";
      prompt: string;
      mode: RuntimeRunMode;
      options?: RuntimeRunOptions;
    }
  | {
      type: "steer";
      runId: string;
      instruction: string;
      priority?: "high" | "normal";
    }
  | { type: "enqueue"; prompt: string; priority?: number; runId?: string }
  | {
      type: "approve";
      runId: string;
      ticketId: string;
      decision: "approve" | "reject";
      reason?: string;
    }
  | { type: "provide_input"; runId: string; interruptId: string; data: unknown }
  | { type: "drain" }
  | { type: "cancel"; runId: string; reason?: string }
  | { type: "resume"; runId: string; fromCheckpoint?: string }
  | { type: "inspect"; runId: string; includeEvents?: boolean };

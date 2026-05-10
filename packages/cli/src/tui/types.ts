import type { ApprovalDecision, ApprovalKind, Session } from "@kirakira/core";
import type { Attachment } from "../parser/mention.js";

export type TuiMode = "agent" | "ask" | "plan" | "debug";
export type ToolDetailsLevel = "off" | "compact" | "full";
export type ThinkingDisplayMode = "off" | "summary" | "model";
export type DensityMode = "spacious" | "default" | "compact" | "dense";

export type CardVariant = "default" | "accent" | "status" | "elevated" | "ghost" | "danger";
export type ErrorLevel = "recoverable" | "degraded" | "blocking" | "fatal";
export type ApprovalRiskLevel = "info" | "low" | "medium" | "high" | "critical";

export type InspectorTab =
  | "attachments"
  | "skills"
  | "mcp"
  | "tasks"
  | "subagents"
  | "memory"
  | "policy"
  | "trace"
  | "sessions"
  | "config";

export type TimelineEventKind =
  | "user"
  | "agent"
  | "tool"
  | "tool_call"
  | "tool_result"
  | "thinking"
  | "skill"
  | "approval"
  | "error"
  | "system";

export interface TimelineEntry {
  id: string;
  ts: string;
  kind: TimelineEventKind;
  text: string;
}

export type ActiveToolStatus = "running" | "completed" | "failed";

export interface ActiveToolRun {
  id: string;
  name: string;
  argsPreview: string;
  startedAt: number;
  status: ActiveToolStatus;
  latencyMs?: number;
  error?: string;
}

export interface McpServerStatus {
  name: string;
  transport: string;
  healthy: boolean;
  health?: string;
  error?: string;
}

export interface SkillEntry {
  name: string;
  description: string;
  active: boolean;
}

export interface ApprovalUiEnrichment {
  sandboxUpgrade?: { from: string; to: string };
  targetPaths?: string[];
  targetDomains?: string[];
  matchedRules?: string[];
  actionSummary?: string;
  riskLevel?: ApprovalRiskLevel;
}

export interface ApprovalRequest {
  id: string;
  kind: ApprovalKind;
  detail: ShellApprovalDetail | McpApprovalDetail | WriteApprovalDetail;
  enrichment?: ApprovalUiEnrichment;
}

export interface ShellApprovalDetail {
  type: "shell";
  command: string;
  scope: "workspace" | "host";
  sandbox: string;
  risk: string;
  requestedBy: string;
}

export interface McpApprovalDetail {
  type: "mcp";
  server: string;
  transport: string;
  tool: string;
  url?: string;
  dataClass?: string;
  oauthScope?: string;
}

export interface WriteApprovalDetail {
  type: "write";
  path: string;
  operation: "create" | "modify" | "delete";
  preview?: string;
}

export interface AppState {
  session: Session;
  messages: Array<{ role: string; content: string }>;
  timeline: TimelineEntry[];
  mode: TuiMode;
  model: string;
  attachments: Attachment[];
  approvalQueue: ApprovalRequest[];
  mcpServers: McpServerStatus[];
  skills: SkillEntry[];
  workspaceName: string;
  gitBranch: string;
  trust: string;
  traceId: string;
  vimMode: boolean;
  autoRun: boolean;
}

export interface SlashCommandDef {
  name: string;
  description: string;
}

export const SLASH_COMMAND_DEFS: SlashCommandDef[] = [
  { name: "help", description: "List all slash commands" },
  { name: "model", description: "Show or set the model" },
  { name: "models", description: "Open provider and model setup" },
  { name: "agent", description: "Switch to agent mode (full autonomy)" },
  { name: "plan", description: "Switch to plan mode (no writes)" },
  { name: "ask", description: "Switch to ask mode (read-only Q&A)" },
  { name: "debug", description: "Switch to debug mode (verbose traces)" },
  { name: "new", description: "Start a new session" },
  { name: "resume", description: "Resume a previous session" },
  { name: "sessions", description: "List local sessions and current session" },
  { name: "continue", description: "Resume latest session" },
  { name: "compact", description: "Summarize & compress history" },
  { name: "undo", description: "Undo latest prompt turn and UI state" },
  { name: "redo", description: "Redo last undone turn" },
  { name: "details", description: "Set tool detail level: off|compact|full" },
  { name: "density", description: "Set info density: spacious|default|compact|dense" },
  { name: "themes", description: "List or set TUI themes" },
  { name: "theme", description: "Alias of /themes" },
  { name: "thinking", description: "Set thinking display: off|summary|model" },
  { name: "permissions", description: "Show approval policy rules" },
  { name: "policy", description: "Show policy posture panel" },
  { name: "approvals", description: "Show pending approvals panel" },
  { name: "audit", description: "Show trace + audit panel" },
  { name: "auto-run", description: "Toggle auto-approval mode" },
  { name: "sandbox", description: "Show sandbox configuration" },
  { name: "mcp", description: "MCP: status | add <pkg> | refresh | list" },
  { name: "skills", description: "Show discovered skills" },
  { name: "tasks", description: "Show running/queued task graph summary" },
  { name: "subagents", description: "Show runtime subagents and status" },
  { name: "memory", description: "Show memory recalls and references" },
  { name: "config", description: "Show config panel; /config setup opens provider setup" },
  { name: "commands", description: "Show compatible CLI commands" },
  { name: "trace", description: "Show current trace summary" },
  { name: "export", description: "Export session (md/json/jsonl)" },
  { name: "vim", description: "Toggle vim input mode" },
  { name: "setup-terminal", description: "Check terminal config" },
  { name: "usage", description: "Show token usage" },
  { name: "about", description: "Version and workspace info" },
  { name: "feedback", description: "Submit feedback" },
  { name: "quit", description: "End session and exit" },
];

export type ApprovalKeyAction =
  | { decision: ApprovalDecision }
  | { decision: "details" };

export const MODE_META: Record<TuiMode, { label: string; color: string; icon: string; desc: string }> = {
  agent: { label: "agent", color: "#7DDC9A", icon: "A", desc: "Full autonomy: read, write, execute" },
  ask: { label: "ask", color: "#7AD7FF", icon: "?", desc: "Read-only Q&A: no tool execution" },
  plan: { label: "plan", color: "#E8B45E", icon: "P", desc: "Planning: analysis without writes" },
  debug: { label: "debug", color: "#FF5F87", icon: "D", desc: "Debug: verbose traces and diagnostics" },
};

export const DENSITY_SPACING: Record<DensityMode, { lineGap: number; cardGap: number }> = {
  spacious: { lineGap: 2, cardGap: 3 },
  default: { lineGap: 1, cardGap: 2 },
  compact: { lineGap: 0, cardGap: 1 },
  dense: { lineGap: 0, cardGap: 0 },
};

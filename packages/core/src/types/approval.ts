export type ApprovalKind = "shell" | "mcp" | "write" | "skill_script";

export type ApprovalDecision =
  | "allow_once"
  | "allow_session"
  | "allow_workspace"
  | "deny"
  | "deny_block"
  | "details";

export interface ApprovalCard {
  id: string;
  kind: ApprovalKind;
  timestamp: string;
  detail: ShellApproval | McpApproval | WriteApproval | SkillScriptApproval;
}

export interface ShellApproval {
  command: string;
  scope: "workspace" | "host";
  sandbox: string;
  risk: string;
  requestedBy: string;
}

export interface McpApproval {
  server: string;
  transport: string;
  tool: string;
  url?: string;
  dataClass?: string;
  oauthScope?: string;
}

export interface WriteApproval {
  path: string;
  operation: "create" | "modify" | "delete";
  preview?: string;
}

export interface SkillScriptApproval {
  skill: string;
  script: string;
  interpreter: string;
}

export interface ApprovalState {
  pending: ApprovalCard[];
  sessionAllowlist: SessionAllowEntry[];
}

export interface SessionAllowEntry {
  pattern: string;
  kind: ApprovalKind;
  grantedAt: string;
}

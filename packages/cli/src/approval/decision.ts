import type { ApprovalDecision, ApprovalKind } from "@kirakira/core";
import type { SessionAllowlist } from "./session-allowlist.js";

export interface DecisionInput {
  decision: ApprovalDecision;
  pattern: string;
  kind: ApprovalKind;
}

export interface DecisionResult {
  blocked: boolean;
  allowThis: boolean;
  rememberSession: boolean;
}

/**
 * Applies approval UI decision to session allowlist and returns execution hints.
 */
export function processApprovalDecision(
  input: DecisionInput,
  sessionAllowlist: SessionAllowlist,
): DecisionResult {
  switch (input.decision) {
    case "allow_once":
      return { blocked: false, allowThis: true, rememberSession: false };

    case "allow_session":
      sessionAllowlist.grant(input.pattern, input.kind);
      return { blocked: false, allowThis: true, rememberSession: true };

    case "allow_workspace":
      sessionAllowlist.grant(input.pattern, input.kind);
      return { blocked: false, allowThis: true, rememberSession: true };

    case "deny":
      return { blocked: false, allowThis: false, rememberSession: false };

    case "deny_block":
      return { blocked: true, allowThis: false, rememberSession: false };

    case "details":
      return { blocked: false, allowThis: false, rememberSession: false };

    default:
      return { blocked: false, allowThis: false, rememberSession: false };
  }
}

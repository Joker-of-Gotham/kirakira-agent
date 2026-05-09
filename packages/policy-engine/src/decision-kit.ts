import { randomUUID } from "node:crypto";

import type { Obligation, PolicyDecision } from "@kirakira/core";

const PKG = "@kirakira/policy-engine";

export interface SyntheticDecisionParts {
  requestId?: string;
  effect: PolicyDecision["effect"];
  reason_codes: string[];
  summary: string;
  approval?: Partial<PolicyDecision["approval"]>;
  obligations?: Obligation[];
}

export function syntheticDecision(parts: SyntheticDecisionParts): PolicyDecision {
  const request_id =
    typeof parts.requestId === "string" && parts.requestId.length > 0
      ? parts.requestId
      : randomUUID();

  const approvalDefaults: PolicyDecision["approval"] = {
    required: false,
    mode: "none",
    cacheable: false,
  };

  const approvalMerged: PolicyDecision["approval"] = {
    ...approvalDefaults,
    ...(parts.approval ?? {}),
  };

  return {
    version: "kirakira.decision.v1",
    decision_id: randomUUID(),
    request_id,
    effect: parts.effect,
    reason_codes: parts.reason_codes,
    policy: {
      bundle_id: PKG,
      revision: "policy-engine-synthetic-v1",
      package: PKG,
    },
    approval: approvalMerged,
    obligations: parts.obligations ?? [],
    explain: {
      summary: parts.summary,
      matched_rules: parts.reason_codes.map((r) => `synthetic:${r}`),
    },
  };
}

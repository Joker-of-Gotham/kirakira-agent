import type { Obligation } from "@kirakira/core";

import { syntheticDecision, type SyntheticDecisionParts } from "../decision-kit.js";

/** Documented degraded modes when policy subsystems are unhealthy. */
export type DegradationScenario =
  | "pdp_unavailable"
  | "bundle_expired"
  | "airisk_timeout"
  | "approval_unavailable"
  | "audit_write_failed"
  | "trace_backend_unavailable";

/** High-impact kinds when PDP is unreachable — tightened to deny with read-only uplift on model prompts only. */
const PDP_BLOCKED_KINDS = new Set([
  "shell.exec",
  "file.write",
  "tool.call",
  "package.install",
  "network.request",
]);

/** Low-impact action kinds that may continue when the audit subsystem is degraded. */
const LOW_TOUCH_KIND = new Set(["model.invoke"]);

/** Action kinds escalated aggressively when AIRISK times out (conservative stance). */
const AIRISK_CONSERVATIVE_KINDS = new Set([
  "shell.exec",
  "file.write",
  "package.install",
  "network.request",
  "tool.call",
]);

/** When approval backends are gone, callers should treat PDP decisions that demanded approval as hard denies. */
const APPROVAL_SENSITIVE_KINDS = new Set([
  "shell.exec",
  "file.write",
  "tool.call",
  "package.install",
  "network.request",
]);

function degradedAllowWithSandbox(
  actionKind: string,
  scenario: DegradationScenario,
  profile: string,
): SyntheticDecisionParts {
  const obligations: Obligation[] = [
    {
      type: "sandbox",
      profile,
      required: true,
      scope: "session",
    },
  ];

  return {
    effect: "allow",
    reason_codes: [`${scenario}`, "degraded_sandbox_lift"],
    summary: `${scenario}: allowing only constrained execution under profile "${profile}" for ${actionKind}.`,
    approval: {
      required: false,
      mode: "none",
      cacheable: false,
    },
    obligations,
  };
}

/** Deterministic degraded {@link PolicyDecision} values for PEP/PDP hosts. */
export function getFailClosedDecision(scenario: DegradationScenario, actionKind: string) {
  switch (scenario) {
    case "pdp_unavailable": {
      if (!PDP_BLOCKED_KINDS.has(actionKind))
        return syntheticDecision(degradedAllowWithSandbox(actionKind, scenario, "read-only"));

      return syntheticDecision({
        effect: "deny",
        reason_codes: ["pdp_unavailable", `${actionKind}`],
        summary:
          "PDP unavailable — only planning/read-only tiers are admitted; destructive tool kinds are denied until connectivity returns.",
      });
    }

    case "bundle_expired": {
      return syntheticDecision(
        degradedAllowWithSandbox(actionKind, scenario, actionKind.includes("network") ? "workspace-write-net" : "read-only"),
      );
    }

    case "airisk_timeout": {
      if (AIRISK_CONSERVATIVE_KINDS.has(actionKind)) {
        return syntheticDecision({
          effect: "escalate",
          reason_codes: ["airisk_timeout", "approval_required_fallback"],
          summary:
            "AIRISK timed out — defaulting to human approval plus conservative sandbox selection before execution proceeds.",
          approval: { required: true, mode: "human", cacheable: false },
          obligations: [
            {
              type: "approval",
              scope: "once",
              required: true,
            },
            {
              type: "sandbox",
              profile: "workspace-write",
              required: true,
            },
          ],
        });
      }

      return syntheticDecision({
        effect: "allow",
        reason_codes: ["airisk_timeout", "classification_skipped_medium_risk_kind"],
        summary: "AIRISK timed out — lower-risk invocation allowed while classification stays conservative.",
      });
    }

    case "approval_unavailable":
      return syntheticDecision({
        effect: APPROVAL_SENSITIVE_KINDS.has(actionKind) ? "deny" : "allow",
        reason_codes: APPROVAL_SENSITIVE_KINDS.has(actionKind)
          ? ["approval_unavailable"]
          : ["approval_unavailable", "low_touch_kind_continue"],
        summary: APPROVAL_SENSITIVE_KINDS.has(actionKind)
          ? "Approval channels offline — escalation-required actions cannot continue."
          : "Approval channels offline — non-sensitive actions may continue with degraded trace capture.",
      });

    case "audit_write_failed": {
      if (LOW_TOUCH_KIND.has(actionKind)) {
        return syntheticDecision({
          effect: "allow",
          reason_codes: ["audit_write_failed", "low_risk_degraded"],
          summary: "Audit writer failed — low-risk invocation allowed under local degraded ledger tagging.",
          approval: {
            required: false,
            mode: "none",
            cacheable: false,
          },
          obligations: [
            {
              type: "audit_append",
              channel: "local-memory",
              required: false,
            },
          ],
        });
      }

      return syntheticDecision({
        effect: "deny",
        reason_codes: ["audit_write_failed", "high_risk_requires_audit"],
        summary: "Audit writer failed — high-risk executions are halted until auditing recovers.",
      });
    }

    case "trace_backend_unavailable":
      return syntheticDecision({
        effect: "allow",
        reason_codes: ["trace_backend_unavailable", "local_ledger_continue"],
        summary:
          "Trace federation unavailable — continue with local ledger obligations only (central trace skipped).",
        obligations: [{ type: "trace_redaction", required: false, policy: "local-only" }],
      });

    default: {
      const _exhaustive: never = scenario;
      throw new Error(`Unhandled scenario ${_exhaustive as string}`);
    }
  }
}

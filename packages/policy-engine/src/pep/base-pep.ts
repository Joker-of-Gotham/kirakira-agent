import type { PolicyInput, PolicyDecision } from "@kirakira/core";

import { syntheticDecision } from "../decision-kit.js";
import type { ObligationExecutor } from "../obligation/obligation-executor.js";
import type { AuditWriter } from "../obligation/audit-writer-types.js";
import type { PdpClient } from "../pdp/pdp-types.js";
import type { NormalizerResult } from "../normalizer/action-normalizer.js";

import { principalFrom, workspaceFrom, requestEnvelope } from "./policy-input-fields.js";
import type { EnforcementResult, PepContext } from "./pep-types.js";

export interface BasePepOptions {
  pdpClient: PdpClient;
  obligationExecutor: ObligationExecutor;
  auditWriter: AuditWriter;
}

export abstract class BasePep {
  protected constructor(
    protected readonly pdpClient: PdpClient,
    protected readonly obligationExecutor: ObligationExecutor,
    protected readonly auditWriter: AuditWriter,
  ) {}

  async enforce(rawAction: unknown, context: PepContext): Promise<EnforcementResult> {
    const auditCtx = {
      traceId: context.traceId,
      sessionId: context.sessionId,
      userId: context.userId,
      agent: context.agent,
    };

    const normalized = this.normalize(rawAction, context);
    if (normalized.blocked) {
      const decision = syntheticDecision({
        effect: "deny",
        reason_codes: [
          "pep_normalization_blocked",
          ...(normalized.block_reason?.length ? [normalized.block_reason] : ["unspecified"]),
        ],
        summary: normalized.block_reason ?? "PEP blocked this action prior to PDP evaluation.",
      });
      await this.auditWriter.onDenied(auditCtx, decision);
      return { allowed: false, decision, traceId: context.traceId };
    }

    const input = this.buildPolicyInput(rawAction, normalized, context);

    const decision = await this.pdpClient.evaluate(input);

    if (decision.effect === "deny") {
      await this.auditWriter.onDenied(auditCtx, decision);
      return { allowed: false, decision, traceId: context.traceId };
    }

    const obligationRun = await this.obligationExecutor.execute(decision.obligations, {
      decision,
      sessionId: context.sessionId,
      traceId: context.traceId,
      interactive: context.interactive,
    });

    if (!obligationRun.allFulfilled) {
      const fail = syntheticDecision({
        requestId: input.request_id,
        effect: "deny",
        reason_codes: ["obligation_not_fulfilled"],
        summary:
          obligationRun.results.find((x) => !x.fulfilled)?.error ??
          "A required obligation could not be satisfied.",
      });
      await this.auditWriter.onDenied(auditCtx, fail);
      return { allowed: false, decision: fail, traceId: context.traceId };
    }

    await this.auditWriter.onAllowed(auditCtx, decision);

    if (decision.effect === "escalate") {
      return { allowed: false, decision, traceId: context.traceId };
    }

    const executionResult = await this.execute(rawAction, decision);
    await this.auditWriter.onExecuted(auditCtx, decision, executionResult);
    return {
      allowed: true,
      decision,
      ...(executionResult !== undefined ? { executionResult } : {}),
      traceId: context.traceId,
    };
  }

  /** Shared helper for PEP subclasses assembling {@link PolicyInput} envelopes. */
  protected envelope(context: PepContext) {
    return requestEnvelope(context);
  }

  protected principal(context: PepContext): PolicyInput["principal"] {
    return principalFrom(context);
  }

  protected workspace(context: PepContext): PolicyInput["workspace"] {
    return workspaceFrom(context);
  }

  protected abstract normalize(rawAction: unknown, context: PepContext): NormalizerResult;
  protected abstract buildPolicyInput(
    rawAction: unknown,
    normalized: NormalizerResult,
    context: PepContext,
  ): PolicyInput;
  protected abstract execute(rawAction: unknown, decision: PolicyDecision): Promise<unknown>;
}

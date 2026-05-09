import type { PolicyDecision, PolicyInput } from "@kirakira/core";

import { normalizeAction, type RawAction } from "../normalizer/action-normalizer.js";
import type { NormalizerResult } from "../normalizer/action-normalizer.js";
import type { AuditWriter } from "../obligation/audit-writer-types.js";
import type { ObligationExecutor } from "../obligation/obligation-executor.js";
import type { PdpClient } from "../pdp/pdp-types.js";
import { BasePep } from "./base-pep.js";
import type { PepContext } from "./pep-types.js";
import { asRecord, coerceEnv } from "./action-raw-parse.js";
import { signalize } from "./risk-signals.js";

function shellRawFrom(rawAction: unknown, workspaceRoot: string): RawAction {
  const o = asRecord(rawAction) ?? {};
  const command =
    typeof o.command === "string" && o.command.length > 0 ? o.command : undefined;
  const args = Array.isArray(o.args)
    ? (o.args as unknown[])
        .filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];

  const env = coerceEnv(o);
  const toolName =
    typeof o.toolName === "string" && o.toolName.length > 0 ? o.toolName : "shell";

  const rawShell: RawAction = {
    kind: "shell.exec",
    toolType: "shell",
    toolName,
    operation:
      typeof o.operation === "string" && o.operation.length > 0 ? o.operation : "exec",
    ...(command !== undefined ? { command } : args.length > 0 ? { args } : {}),
    ...(env !== undefined ? { env } : {}),
    workspaceRoot,
  };
  return rawShell;
}

export class ShellPep extends BasePep {
  constructor(pdp: PdpClient, obligationExecutor: ObligationExecutor, auditWriter: AuditWriter) {
    super(pdp, obligationExecutor, auditWriter);
  }

  protected normalize(rawAction: unknown, context: PepContext): NormalizerResult {
    return normalizeAction(shellRawFrom(rawAction, context.workspaceRoot));
  }

  protected buildPolicyInput(
    rawAction: unknown,
    normalized: NormalizerResult,
    context: PepContext,
  ): PolicyInput {
    const raw = shellRawFrom(rawAction, context.workspaceRoot);
    return {
      ...this.envelope(context),
      principal: this.principal(context),
      workspace: this.workspace(context),
      action: {
        kind: "shell.exec",
        tool_type: "shell",
        tool_name: raw.toolName,
        operation: raw.operation,
        ...(raw.command !== undefined || raw.args !== undefined || raw.env !== undefined
          ? {
              raw: {
                ...(raw.command !== undefined ? { command: raw.command } : {}),
                ...(raw.args !== undefined ? { args: raw.args } : {}),
                ...(raw.env !== undefined ? { env: raw.env } : {}),
              },
            }
          : {}),
        normalized,
      },
      risk: {
        signals: signalize(normalized, "shell"),
      },
    };
  }

  protected execute(rawAction: unknown, decision: PolicyDecision): Promise<unknown> {
    void decision;
    return Promise.resolve(rawAction);
  }
}

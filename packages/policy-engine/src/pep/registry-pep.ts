import type { PolicyDecision, PolicyInput } from "@kirakira/core";

import type { AuditWriter } from "../obligation/audit-writer-types.js";
import type { ObligationExecutor } from "../obligation/obligation-executor.js";
import type { NormalizerResult } from "../normalizer/action-normalizer.js";
import { normalizeAction, type RawAction } from "../normalizer/action-normalizer.js";
import type { PdpClient } from "../pdp/pdp-types.js";
import { BasePep } from "./base-pep.js";
import type { PepContext } from "./pep-types.js";
import { asRecord, coerceEnv } from "./action-raw-parse.js";
import { signalize } from "./risk-signals.js";

function registryRawFrom(rawAction: unknown, workspaceRoot: string): RawAction {
  const o = asRecord(rawAction) ?? {};
  const pkgs =
    typeof o.packages === "string"
      ? o.packages.split(/\s+/u).filter(Boolean)
      : Array.isArray(o.packages)
        ? (o.packages as unknown[]).filter((x): x is string => typeof x === "string")
        : [];

  const positional =
    Array.isArray(o.args)
      ? (o.args as unknown[]).filter((x): x is string => typeof x === "string")
      : [];

  const inferred =
    typeof o.packageSpec === "string"
      ? o.packageSpec
      : typeof o.name === "string"
        ? o.name
        : positional[0];

  const mergedArgs = inferred ? [inferred, ...positional.slice(inferred === positional[0] ? 1 : 0), ...pkgs] : positional;

  const toolNameCandidate =
    typeof o.toolName === "string" && o.toolName.length > 0
      ? o.toolName
      : typeof o.packageManager === "string" && o.packageManager.length > 0
        ? o.packageManager
        : "registry";

  const baseEnv = coerceEnv(o) ?? {};
  const registrySource =
    typeof o.registry === "string"
      ? o.registry
      : typeof o.registryUrl === "string"
        ? o.registryUrl
        : typeof o.source === "string"
          ? o.source
          : "";

  let env = baseEnv;
  if (registrySource.length > 0) env = { ...env, KIRAKIRA_REGISTRY_SOURCE: registrySource };

  return {
    kind: "package.install",
    toolType: "registry",
    toolName: toolNameCandidate,
    operation:
      typeof o.operation === "string" && o.operation.length > 0 ? o.operation : "install",
    ...(mergedArgs.length > 0 ? { args: mergedArgs.slice(0, 64) } : {}),
    ...(Object.keys(env).length > 0 ? { env } : {}),
    workspaceRoot,
  };
}

export class RegistryPep extends BasePep {
  constructor(pdp: PdpClient, obligationExecutor: ObligationExecutor, auditWriter: AuditWriter) {
    super(pdp, obligationExecutor, auditWriter);
  }

  protected normalize(rawAction: unknown, context: PepContext): NormalizerResult {
    return normalizeAction(registryRawFrom(rawAction, context.workspaceRoot));
  }

  protected buildPolicyInput(
    rawAction: unknown,
    normalized: NormalizerResult,
    context: PepContext,
  ): PolicyInput {
    const raw = registryRawFrom(rawAction, context.workspaceRoot);
    return {
      ...this.envelope(context),
      principal: this.principal(context),
      workspace: this.workspace(context),
      action: {
        kind: "package.install",
        tool_type: "registry",
        tool_name: raw.toolName,
        operation: raw.operation,
        ...(raw.args !== undefined || raw.env !== undefined
          ? {
              raw: {
                ...(raw.args !== undefined ? { args: raw.args } : {}),
                ...(raw.env !== undefined ? { env: raw.env } : {}),
              },
            }
          : {}),
        normalized,
      },
      risk: { signals: [...signalize(normalized, "registry"), "supply_chain.surface"] },
    };
  }

  protected execute(rawAction: unknown, decision: PolicyDecision): Promise<unknown> {
    void decision;
    return Promise.resolve(rawAction);
  }
}

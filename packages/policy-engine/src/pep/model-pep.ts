import type { PolicyDecision, PolicyInput } from "@kirakira/core";

import type { AuditWriter } from "../obligation/audit-writer-types.js";
import type { ObligationExecutor } from "../obligation/obligation-executor.js";
import type { NormalizerResult } from "../normalizer/action-normalizer.js";
import { normalizeAction, type RawAction } from "../normalizer/action-normalizer.js";
import type { PdpClient } from "../pdp/pdp-types.js";
import { BasePep } from "./base-pep.js";
import type { PepContext } from "./pep-types.js";
import { asRecord } from "./action-raw-parse.js";
import { signalize } from "./risk-signals.js";

function modelRawFrom(rawAction: unknown, workspaceRoot: string): RawAction {
  const o = asRecord(rawAction) ?? {};
  const provider =
    typeof o.provider === "string" && o.provider.length > 0 ? o.provider : "unknown-provider";
  const modelName =
    typeof o.model === "string" && o.model.length > 0
      ? o.model
      : typeof o.modelId === "string" && o.modelId.length > 0
        ? o.modelId
        : "unknown-model";
  const toolName =
    typeof o.toolName === "string" && o.toolName.length > 0
      ? o.toolName
      : `${provider}:${modelName}`;

  const args: string[] = [];
  const flags: string[] = [];
  const pushKv = (k: string, v: unknown): void => {
    if (v === undefined) return;
    if (typeof v === "boolean") {
      flags.push(v ? `--${k}` : `--no-${k}`);
      return;
    }
    if (typeof v === "number" || typeof v === "string") {
      args.push(`--${k}`, String(v));
    }
  };
  pushKv("temperature", o.temperature);
  pushKv("max_tokens", o.max_tokens ?? o.maxTokens);
  pushKv("top_p", o.top_p ?? o.topP);

  const operation =
    typeof o.operation === "string" && o.operation.length > 0 ? o.operation : "generate";

  const fromCli = Array.isArray(o.args)
    ? (o.args as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  const rawArgs = [...flags, ...fromCli, ...args];

  return {
    kind: "model.invoke",
    toolType: "model",
    toolName,
    operation,
    ...(rawArgs.length > 0 ? { args: rawArgs } : {}),
    workspaceRoot,
  };
}

export class ModelPep extends BasePep {
  constructor(pdp: PdpClient, obligationExecutor: ObligationExecutor, auditWriter: AuditWriter) {
    super(pdp, obligationExecutor, auditWriter);
  }

  protected normalize(rawAction: unknown, context: PepContext): NormalizerResult {
    return normalizeAction(modelRawFrom(rawAction, context.workspaceRoot));
  }

  protected buildPolicyInput(
    rawAction: unknown,
    normalized: NormalizerResult,
    context: PepContext,
  ): PolicyInput {
    const raw = modelRawFrom(rawAction, context.workspaceRoot);
    const o = asRecord(rawAction) ?? {};
    const provider =
      typeof o.provider === "string" && o.provider.length > 0 ? o.provider : undefined;
    const modelId =
      typeof o.model === "string" ? o.model : typeof o.modelId === "string" ? o.modelId : undefined;

    return {
      ...this.envelope(context),
      principal: this.principal(context),
      workspace: this.workspace(context),
      ...(provider !== undefined || modelId !== undefined
        ? { context: { model: { ...(provider !== undefined ? { provider } : {}), ...(modelId !== undefined ? { model: modelId } : {}) } } }
        : {}),
      action: {
        kind: "model.invoke",
        tool_type: "model",
        tool_name: raw.toolName,
        operation: raw.operation,
        ...(raw.args !== undefined ? { raw: { args: raw.args } } : {}),
        normalized,
      },
      risk: { signals: signalize(normalized, "model") },
    };
  }

  protected execute(rawAction: unknown, decision: PolicyDecision): Promise<unknown> {
    void decision;
    return Promise.resolve(rawAction);
  }
}

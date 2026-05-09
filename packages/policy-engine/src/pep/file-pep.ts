import type { PolicyDecision, PolicyInput } from "@kirakira/core";

import type { AuditWriter } from "../obligation/audit-writer-types.js";
import type { ObligationExecutor } from "../obligation/obligation-executor.js";
import type { NormalizerResult } from "../normalizer/action-normalizer.js";
import { normalizeAction, type RawAction } from "../normalizer/action-normalizer.js";
import { canonicalizePath, isDenyPath, isWithinWorkspace } from "../normalizer/path-canonicalizer.js";
import type { PdpClient } from "../pdp/pdp-types.js";
import { BasePep } from "./base-pep.js";
import type { PepContext } from "./pep-types.js";
import { asRecord } from "./action-raw-parse.js";
import { signalize } from "./risk-signals.js";

function pathsFrom(rawAction: unknown): string[] {
  const o = asRecord(rawAction) ?? {};
  const bucket: string[] = [];
  for (const v of ["path", "target", "file", "pathname"] as const) {
    const p = o[v];
    if (typeof p === "string" && p.length > 0) bucket.push(p);
  }
  const many = o.paths;
  if (Array.isArray(many))
    for (const p of many) if (typeof p === "string" && p.length > 0) bucket.push(p);
  if (typeof o.command === "string" && o.command.length > 0) bucket.push(o.command);
  if (Array.isArray(o.args))
    for (const p of o.args) if (typeof p === "string" && p.length > 0) bucket.push(p);
  return [...new Set(bucket)];
}

function fileRawFrom(rawAction: unknown, workspaceRoot: string): RawAction {
  const o = asRecord(rawAction) ?? {};
  const bucket = pathsFrom(rawAction);
  const operation =
    typeof o.operation === "string" && o.operation.length > 0 ? o.operation : "write";
  const toolName =
    typeof o.toolName === "string" && o.toolName.length > 0 ? o.toolName : "file";

  return {
    kind: "file.write",
    toolType: "file",
    toolName,
    operation,
    ...(bucket.length > 0 ? { args: bucket.slice(0, 64) } : {}),
    workspaceRoot,
  };
}

export class FilePep extends BasePep {
  constructor(pdp: PdpClient, obligationExecutor: ObligationExecutor, auditWriter: AuditWriter) {
    super(pdp, obligationExecutor, auditWriter);
  }

  protected normalize(rawAction: unknown, context: PepContext): NormalizerResult {
    const raw = fileRawFrom(rawAction, context.workspaceRoot);
    const base = normalizeAction(raw);
    const ws = context.workspaceRoot;
    let blocked = !!base.blocked;
    let block_reason = base.block_reason;

    const scan = [
      ...base.write_paths,
      ...base.read_paths,
      ...pathsFrom(rawAction).map((p) => canonicalizePath(p, ws)),
    ];
    const seen = [...new Set(scan)];
    for (const p of seen) {
      const c = canonicalizePath(p, ws);
      if (isDenyPath(c)) {
        blocked = true;
        block_reason = `denylist_path:${c}`;
        break;
      }
      if (!isWithinWorkspace(c, ws)) {
        blocked = true;
        block_reason = `path_escapes_workspace:${c}`;
        break;
      }
    }

    return { ...base, ...(blocked ? { blocked, block_reason } : {}) };
  }

  protected buildPolicyInput(
    rawAction: unknown,
    normalized: NormalizerResult,
    context: PepContext,
  ): PolicyInput {
    const raw = fileRawFrom(rawAction, context.workspaceRoot);
    return {
      ...this.envelope(context),
      principal: this.principal(context),
      workspace: this.workspace(context),
      action: {
        kind: "file.write",
        tool_type: "file",
        tool_name: raw.toolName,
        operation: raw.operation,
        ...(raw.args !== undefined ? { raw: { args: raw.args } } : {}),
        normalized,
      },
      risk: { signals: signalize(normalized, "file") },
    };
  }

  protected execute(rawAction: unknown, decision: PolicyDecision): Promise<unknown> {
    void decision;
    return Promise.resolve(rawAction);
  }
}

import type { PolicyDecision, PolicyInput } from "@kirakira/core";

import type { AuditWriter } from "../obligation/audit-writer-types.js";
import type { ObligationExecutor } from "../obligation/obligation-executor.js";
import type { NormalizerResult } from "../normalizer/action-normalizer.js";
import type { PdpClient } from "../pdp/pdp-types.js";
import { BasePep } from "./base-pep.js";
import type { PepContext } from "./pep-types.js";
import { asRecord, coerceEnv } from "./action-raw-parse.js";
import { signalize } from "./risk-signals.js";

export class SkillPep extends BasePep {
  constructor(pdp: PdpClient, obligationExecutor: ObligationExecutor, auditWriter: AuditWriter) {
    super(pdp, obligationExecutor, auditWriter);
  }

  protected normalize(rawAction: unknown, context: PepContext): NormalizerResult {
    void context;
    const o = asRecord(rawAction) ?? {};
    const env = coerceEnv(o);
    const skillBag: Record<string, unknown> =
      typeof o.skill === "object" && o.skill !== null ? (asRecord(o.skill) ?? {}) : {};

    const skillId =
      (typeof skillBag.id === "string" && skillBag.id.length > 0 ? skillBag.id : undefined) ??
      (typeof o.skillId === "string" && o.skillId.length > 0 ? o.skillId : undefined) ??
      (typeof o.skillPath === "string" && o.skillPath.length > 0 ? o.skillPath : undefined) ??
      "unknown.skill";

    const interpreter =
      (typeof o.interpreter === "string" && o.interpreter.length > 0 ? o.interpreter : undefined) ??
      (typeof skillBag.interpreter === "string" && skillBag.interpreter.length > 0
        ? skillBag.interpreter
        : undefined) ??
      "builtin";

    const trustRaw =
      `${o.skillTrust ?? env?.KIRAKIRA_SKILL_TRUST ?? env?.SKILL_TRUST ?? "unknown"}`.toLowerCase();
    const inlinePayload = `${skillId}\n${interpreter}\n${JSON.stringify(o.args ?? [])}`;
    const inlineRisk =
      /\b(?:-c|--command|--eval|--exec|--inline|--run-script|--no-sandbox)\b/i.test(inlinePayload) ||
      /\.(?:py|rb|js|ts|mts|cts)\s*$/i.test(skillId);

    const interpreterHandoff = inlineRisk || /(?:python(?:3)?|node|ruby|perl|php)\b/i.test(interpreter);

    let blocked: boolean | undefined;
    let block_reason: string | undefined;

    if (trustRaw === "untrusted") {
      blocked = true;
      block_reason = "skill_trust_untrusted";
    }

    if (inlineRisk && trustRaw !== "privileged") {
      blocked = true;
      block_reason ??= "skill_interpreter_requires_explicit_privilege";
    }

    return {
      flags: [],
      subcommands: [skillId.split("/").pop() ?? skillId, interpreter].filter(Boolean),
      write_paths: [],
      read_paths: [],
      destructive: false,
      interpreter_handoff: interpreterHandoff,
      pipeline_depth: 0,
      redirection_targets: [],
      command_base: skillId.includes("/") ? skillId.split("/").pop()! : skillId,
      ...(blocked ? { blocked, block_reason } : {}),
    };
  }

  protected buildPolicyInput(
    rawAction: unknown,
    normalized: NormalizerResult,
    context: PepContext,
  ): PolicyInput {
    const o = asRecord(rawAction) ?? {};
    const skillBag: Record<string, unknown> =
      typeof o.skill === "object" && o.skill !== null ? (asRecord(o.skill) ?? {}) : {};
    const env = coerceEnv(o);

    const rawBlock: NonNullable<PolicyInput["action"]["raw"]> = {};
    const mergedEnv: Record<string, string> = { ...(env ?? {}) };
    if (typeof o.skillTrust === "string" && o.skillTrust.length > 0)
      mergedEnv.KIRAKIRA_SKILL_TRUST = o.skillTrust;
    if (Object.keys(mergedEnv).length > 0) rawBlock.env = mergedEnv;

    const argsFiltered = Array.isArray(o.args)
      ? (o.args as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    if (argsFiltered.length > 0) rawBlock.args = argsFiltered;
    if (typeof o.script === "string" && o.script.length > 0) rawBlock.command = o.script;

    return {
      ...this.envelope(context),
      principal: this.principal(context),
      workspace: this.workspace(context),
      context: {
        skill: {
          ...(typeof skillBag.id === "string" ? { id: skillBag.id } : {}),
          ...(typeof skillBag.version === "string" ? { version: skillBag.version } : {}),
          ...(typeof skillBag.fingerprint === "string" ? { fingerprint: skillBag.fingerprint } : {}),
        },
      },
      action: {
        kind: "tool.call",
        tool_type: "skill-script",
        tool_name:
          typeof o.toolName === "string" && o.toolName.length > 0 ? o.toolName : "skill.execute",
        operation:
          typeof o.operation === "string" && o.operation.length > 0 ? o.operation : "skill.run",
        ...(Object.keys(rawBlock).length > 0 ? { raw: rawBlock } : {}),
        normalized,
      },
      risk: {
        signals: [
          ...signalize(normalized, "skill"),
          `skill.trust:${`${o.skillTrust ?? env?.KIRAKIRA_SKILL_TRUST ?? env?.SKILL_TRUST ?? "unknown"}`.toLowerCase()}`,
        ],
      },
    };
  }

  protected execute(rawAction: unknown, decision: PolicyDecision): Promise<unknown> {
    void decision;
    return Promise.resolve(rawAction);
  }
}

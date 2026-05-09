import type { PolicyDecision, PolicyInput } from "@kirakira/core";

import type { AuditWriter } from "../obligation/audit-writer-types.js";
import type { ObligationExecutor } from "../obligation/obligation-executor.js";
import type { NormalizerResult } from "../normalizer/action-normalizer.js";
import type { PdpClient } from "../pdp/pdp-types.js";
import { BasePep } from "./base-pep.js";
import type { PepContext } from "./pep-types.js";
import { asRecord } from "./action-raw-parse.js";
import { signalize } from "./risk-signals.js";

function blank(): NormalizerResult {
  return {
    flags: [],
    subcommands: [],
    write_paths: [],
    read_paths: [],
    destructive: false,
    interpreter_handoff: false,
    pipeline_depth: 0,
    redirection_targets: [],
  };
}

export class NetworkPep extends BasePep {
  constructor(pdp: PdpClient, obligationExecutor: ObligationExecutor, auditWriter: AuditWriter) {
    super(pdp, obligationExecutor, auditWriter);
  }

  protected normalize(rawAction: unknown, context: PepContext): NormalizerResult {
    void context;
    const o = asRecord(rawAction) ?? {};
    const href =
      typeof o.url === "string"
        ? o.url
        : typeof o.endpoint === "string"
          ? o.endpoint
          : typeof o.href === "string"
            ? o.href
            : undefined;

    if (!href || typeof href !== "string" || href.length === 0) {
      return { ...blank(), blocked: true, block_reason: "missing_network_url" };
    }

    let hostname: string;
    let protocol: string | undefined;
    try {
      const u =
        /^[a-zA-Z][a-zA-Z+.-]*:\/\//u.test(href)
          ? new URL(href)
          : /^\/\//u.test(href)
            ? new URL(`https:${href}`)
            : new URL(`https://${href}`);
      hostname = u.hostname;
      protocol = u.protocol.replace(":", "");
    } catch {
      return {
        ...blank(),
        blocked: true,
        block_reason: `unparseable_url:${href.slice(0, 120)}`,
      };
    }

    if (!hostname) {
      return { ...blank(), blocked: true, block_reason: "missing_hostname" };
    }

    return {
      ...blank(),
      command_base: hostname,
      subcommands: [`${protocol ?? "unknown"}://${hostname}`],
      network: { required: true, domains: [hostname], ...(protocol ? { protocol } : {}) },
    };
  }

  protected buildPolicyInput(
    rawAction: unknown,
    normalized: NormalizerResult,
    context: PepContext,
  ): PolicyInput {
    const o = asRecord(rawAction) ?? {};
    const href =
      typeof o.url === "string"
        ? o.url
        : typeof o.endpoint === "string"
          ? o.endpoint
          : typeof o.href === "string"
            ? o.href
            : "";
    const method = o.method ?? o.verb ?? "REQUEST";

    let protocolFallback = "";
    try {
      if (/^[a-zA-Z][a-zA-Z+.-]*:\/\//u.test(href))
        protocolFallback = new URL(href).protocol.replace(":", "");
    } catch {
      protocolFallback = "https";
    }

    const proto = normalized.network?.protocol ?? (protocolFallback.length > 0 ? protocolFallback : "https");
    const hostPart =
      typeof normalized.command_base === "string" && normalized.command_base.length > 0
        ? normalized.command_base
        : "unknown.invalid";
    const methodUpper =
      typeof method === "string" && method.length > 0 ? String(method).toUpperCase() : "REQUEST";

    return {
      ...this.envelope(context),
      principal: this.principal(context),
      workspace: this.workspace(context),
      action: {
        kind: "network.request",
        tool_type: "model",
        tool_name: `${proto}://${hostPart}`,
        operation: methodUpper,
        normalized,
      },
      risk: { signals: [...signalize(normalized, "network"), `transport:${methodUpper}`] },
    };
  }

  protected execute(rawAction: unknown, decision: PolicyDecision): Promise<unknown> {
    void decision;
    return Promise.resolve(rawAction);
  }
}

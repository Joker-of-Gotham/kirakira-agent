import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, writeFile, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { Obligation, PolicyDecision, PolicyInput } from "@kirakira/core";

import { canonicalizePath, isWithinWorkspace } from "../normalizer/path-canonicalizer.js";
import type { PdpClient, PdpHealth } from "./pdp-types.js";

const execFileAsync = promisify(execFile);

const FALLBACK_REVISION = "embedded-baseline-v1";
const PKG = "@kirakira/policy-engine/embedded";

async function findOpa(): Promise<string | null> {
  for (const candidate of ["opa", "/usr/local/bin/opa", "/usr/bin/opa"]) {
    try {
      await execFileAsync(candidate, ["version"]);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

function denyDecision(input: PolicyInput, reasonCodes: string[], summary: string): PolicyDecision {
  return {
    version: "kirakira.decision.v1",
    decision_id: randomUUID(),
    request_id: input.request_id,
    effect: "deny",
    reason_codes: reasonCodes,
    policy: {
      bundle_id: PKG,
      revision: FALLBACK_REVISION,
      package: PKG,
    },
    approval: { required: false, mode: "none", cacheable: false },
    obligations: [],
    explain: {
      summary,
      matched_rules: reasonCodes.map((r) => `embedded:${r}`),
    },
  };
}

function approveDecision(input: PolicyInput, summary: string): PolicyDecision {
  return {
    version: "kirakira.decision.v1",
    decision_id: randomUUID(),
    request_id: input.request_id,
    effect: "allow",
    reason_codes: ["baseline_read_workspace"],
    policy: {
      bundle_id: PKG,
      revision: FALLBACK_REVISION,
      package: PKG,
    },
    approval: { required: false, mode: "none", cacheable: true },
    obligations: [],
    explain: {
      summary,
      matched_rules: ["embedded:read_only_allow"],
    },
  };
}

function escalateWrite(input: PolicyInput, summary: string): PolicyDecision {
  return {
    version: "kirakira.decision.v1",
    decision_id: randomUUID(),
    request_id: input.request_id,
    effect: "escalate",
    reason_codes: ["baseline_write_requires_approval"],
    policy: {
      bundle_id: PKG,
      revision: FALLBACK_REVISION,
      package: PKG,
    },
    approval: { required: true, mode: "human", cacheable: false },
    obligations: [
      {
        type: "approval",
        required: true,
        scope: "once",
      },
    ],
    explain: {
      summary,
      matched_rules: ["embedded:write_paths_non_empty"],
    },
  };
}

function baselineEvaluate(input: PolicyInput): PolicyDecision {
  const normalized = input.action.normalized;
  const wsRoot = input.workspace.root;

  if (!normalized) {
    return denyDecision(input, ["missing_normalized_action"], "No normalized action; fail closed.");
  }

  if (
    normalized.network?.required === true ||
    (normalized.network?.domains?.length ?? 0) > 0
  ) {
    return denyDecision(
      input,
      ["network_blocked"],
      "Baseline PDP denies outbound network pending full policy bundle.",
    );
  }

  if (normalized.destructive) {
    return denyDecision(
      input,
      ["destructive_blocked"],
      "Baseline PDP denies destructive operations.",
    );
  }

  if (normalized.interpreter_handoff === true || normalized.pipeline_depth > 0) {
    return denyDecision(
      input,
      ["interpreter_handoff_blocked"],
      "Baseline PDP denies interpreter handoffs and shell pipelines.",
    );
  }

  if (normalized.redirection_targets.length > 0) {
    return denyDecision(input, ["redirection_blocked"], "Baseline PDP denies shell redirections.");
  }

  const writes = [...new Set(normalized.write_paths)].filter(Boolean);
  const reads = [...new Set(normalized.read_paths)].filter(Boolean);

  const firstOutsideWorkspace = (paths: readonly string[]) => {
    for (const p of paths) {
      const cp = canonicalizePath(p, wsRoot);
      if (!isWithinWorkspace(cp, wsRoot)) return cp;
    }
    return undefined;
  };

  const badWrite = firstOutsideWorkspace(writes);
  if (badWrite !== undefined) {
    return denyDecision(
      input,
      ["workspace_escape_write"],
      `Write path escapes workspace (${badWrite}); denied.`,
    );
  }

  if (writes.length > 0) {
    return escalateWrite(
      input,
      `Writes under workspace (${writes.length}) require approval under baseline PDP.`,
    );
  }

  const badRead = firstOutsideWorkspace(reads);
  if (badRead !== undefined) {
    return denyDecision(
      input,
      ["workspace_escape_read"],
      `Read path escapes workspace (${badRead}); denied.`,
    );
  }

  return approveDecision(input, "Baseline PDP allows workspace read-only tooling.");
}

function decisionFromOpaRaw(
  raw: Record<string, unknown>,
  bundleId: string,
  input: PolicyInput,
): PolicyDecision {
  const effect =
    typeof raw.effect === "string" && (raw.effect === "allow" || raw.effect === "deny" || raw.effect === "escalate")
      ? raw.effect
      : "deny";
  const reasonCodes = Array.isArray(raw.reason_codes)
    ? raw.reason_codes.filter((c): c is string => typeof c === "string")
    : [];
  const approvalRequired = Boolean(raw.approval_required);
  const obligations = (
    Array.isArray(raw.obligations) ? raw.obligations : []
  ) as Obligation[];
  const matchedRules = Array.isArray(raw.matched_rules)
    ? raw.matched_rules.filter((r): r is string => typeof r === "string")
    : [];
  const revision = typeof raw.revision === "string" ? raw.revision : bundleId;
  const summary =
    typeof raw.summary === "string" ? raw.summary : `OPA evaluation result: ${effect}`;

  return {
    version: "kirakira.decision.v1",
    decision_id: randomUUID(),
    request_id: input.request_id,
    effect,
    reason_codes: reasonCodes,
    policy: {
      bundle_id: bundleId,
      revision,
      package: "kirakira.authz.main",
    },
    approval: {
      required: approvalRequired,
      mode: approvalRequired ? "human" : "none",
      cacheable: !approvalRequired,
    },
    obligations,
    explain: {
      summary,
      matched_rules: matchedRules,
    },
  };
}

export class EmbeddedPdp implements PdpClient {
  readonly bundlePath: string;
  readonly bundleId: string;

  constructor(bundlePath: string) {
    this.bundlePath = bundlePath;
    this.bundleId = basename(bundlePath) || "embedded-bundle";
  }

  private async opaEvaluate(input: PolicyInput): Promise<PolicyDecision | null> {
    const opaBin = await findOpa();
    if (!opaBin) return null;

    try {
      await access(this.bundlePath, constants.R_OK);
    } catch {
      return null;
    }

    const inputPath = join(tmpdir(), `kirakira-opa-input-${Date.now()}.json`);
    await writeFile(inputPath, JSON.stringify({ input }), "utf-8");

    try {
      const { stdout } = await execFileAsync(
        opaBin,
        [
          "eval",
          "--bundle",
          this.bundlePath,
          "--input",
          inputPath,
          "--data",
          dirname(this.bundlePath),
          "data.kirakira.authz.main.decision",
          "--format",
          "raw",
        ],
        { timeout: 5000 },
      );

      const raw = JSON.parse(stdout) as unknown;
      if (!raw || typeof raw !== "object") return null;

      return decisionFromOpaRaw(raw as Record<string, unknown>, this.bundleId, input);
    } catch {
      return null;
    } finally {
      try {
        await unlink(inputPath);
      } catch {
        /* temp file best-effort cleanup */
      }
    }
  }

  async evaluate(input: PolicyInput): Promise<PolicyDecision> {
    const opaResult = await this.opaEvaluate(input);
    if (opaResult) return opaResult;

    return baselineEvaluate(input);
  }

  async health(): Promise<PdpHealth> {
    const opaBin = await findOpa();
    try {
      await access(this.bundlePath, constants.R_OK);
      return {
        status: opaBin ? "healthy" : "degraded",
        bundleId: this.bundleId,
        bundleRevision: opaBin ? "opa-cli" : FALLBACK_REVISION,
        mode: opaBin ? "embedded-opa" : "embedded-baseline",
      };
    } catch {
      return {
        status: "unavailable",
        bundleId: this.bundleId,
        mode: "embedded",
      };
    }
  }

  async close(): Promise<void> {
    /* no native resources held */
  }
}

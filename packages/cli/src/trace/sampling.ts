import { KIRAKIRA_ATTRIBUTES } from "./attributes.js";

export interface SamplingConfig {
  denyAlways: boolean;
  approvalAlways: boolean;
  errorAlways: boolean;
  highRiskAlways: boolean;
  destructiveMcpAlways: boolean;
  highLatencyRate: number;
  /** Baseline tail sampling lower bound when rules 1–6 do not apply (design: 1%). */
  defaultSampleMin: number;
  /** Baseline tail sampling upper bound when rules 1–6 do not apply (design: 5%). */
  defaultSampleMax: number;
}

const DEFAULT_SAMPLING: SamplingConfig = {
  denyAlways: true,
  approvalAlways: true,
  errorAlways: true,
  highRiskAlways: true,
  destructiveMcpAlways: true,
  highLatencyRate: 0.5,
  defaultSampleMin: 0.01,
  defaultSampleMax: 0.05,
};

const HIGH_RISK_SANDBOX = new Set(["workspace-write-net", "microvm-highrisk"]);

function coerceString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function coerceNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function coerceBoolean(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

/** Design rule 3: `error.type != null` (+ legacy boolean status flags). */
function hasRecordedError(attributes: Record<string, unknown>): boolean {
  const errFlag =
    coerceBoolean(attributes["kirakira.trace.error"]) ??
    coerceBoolean(attributes.error) ??
    coerceString(attributes["otel.status.code"]) === "ERROR";
  if (errFlag === true) return true;

  const et =
    attributes["error.type"] ??
    attributes["kirakira.trace.error.type"] ??
    attributes["exception.type"];
  if (et === null || et === undefined) return false;
  if (typeof et === "string" && et.length === 0) return false;
  return true;
}

/**
 * Policy-driven sampler implementing seven tail-based tracing rules.
 * Rules (design doc): deny/escalate, approval.required, errors, sandbox profile,
 * destructive MCP, gen-AI latency, then sparse baseline sampling.
 */
export class PolicyDrivenSampler {
  private readonly config: SamplingConfig;

  constructor(config?: Partial<SamplingConfig>) {
    const merged = { ...DEFAULT_SAMPLING, ...(config ?? {}) };
    if (merged.defaultSampleMin > merged.defaultSampleMax) {
      const t = merged.defaultSampleMin;
      merged.defaultSampleMin = merged.defaultSampleMax;
      merged.defaultSampleMax = t;
    }
    this.config = merged;
  }

  shouldSample(attributes: Record<string, unknown>): boolean {
    const effect =
      coerceString(attributes["kirakira.policy.effect"]) ??
      coerceString(attributes.effect);

    const approvalRequired =
      coerceBoolean(attributes["kirakira.approval.required"]) ??
      coerceBoolean(attributes["policy.approval.required"]);

    const destructiveMcp =
      coerceBoolean(attributes["kirakira.mcp.tool.destructive"]) ??
      coerceBoolean(attributes["mcp.tool.destructive"]) ??
      coerceBoolean(attributes["kirakira.mcp.destructive"]) ??
      coerceBoolean(attributes.destructiveMcp);

    const sandboxProfile =
      coerceString(attributes[KIRAKIRA_ATTRIBUTES.SANDBOX_PROFILE]) ??
      coerceString(attributes["kirakira.sandbox.profile"]);

    const genAiLatencyMs =
      coerceNumber(attributes["gen_ai.latency_ms"]) ??
      coerceNumber(attributes["kirakira.gen_ai.latency_ms"]);
    const genericLatencyMs =
      coerceNumber(attributes["kirakira.latency.ms"]) ?? coerceNumber(attributes.latency_ms);
    const latencyMs =
      genAiLatencyMs !== undefined ? genAiLatencyMs : genericLatencyMs;

    /* 1. effect=deny | escalate → 100% */
    if (this.config.denyAlways && (effect === "deny" || effect === "escalate")) return true;

    /* 2. approval.required=true → 100% */
    if (this.config.approvalAlways && approvalRequired) return true;

    /* 3. error present / error.type set → 100% */
    if (this.config.errorAlways && hasRecordedError(attributes)) return true;

    /* 4. high-risk sandbox profiles → 100% */
    const profileHit =
      sandboxProfile !== undefined && HIGH_RISK_SANDBOX.has(sandboxProfile);
    const highRiskSandbox = this.coerceSandboxHighRisk(attributes) === true || profileHit;
    if (this.config.highRiskAlways && highRiskSandbox) return true;

    /* 5. destructive MCP tool → 100% */
    if (this.config.destructiveMcpAlways && destructiveMcp) return true;

    /* 6. gen_ai / generic latency > 4000ms → 50% */
    if (
      latencyMs !== undefined &&
      latencyMs > 4000 &&
      Math.random() < this.config.highLatencyRate
    ) {
      return true;
    }

    /* 7. normal read-only success path → uniform [1%, 5%] */
    const span =
      this.config.defaultSampleMax - this.config.defaultSampleMin;
    const p = this.config.defaultSampleMin + Math.random() * span;
    return Math.random() < p;
  }

  private coerceSandboxHighRisk(attrs: Record<string, unknown>): boolean | undefined {
    const v =
      coerceString(attrs["kirakira.risk.sandbox_bucket"]) ?? coerceString(attrs.sandboxRisk);
    if (v === undefined) return undefined;
    return v === "high" || v === "highrisk";
  }
}

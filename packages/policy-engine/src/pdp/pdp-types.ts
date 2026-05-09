import type { PolicyDecision, PolicyInput } from "@kirakira/core";

export interface PdpClient {
  evaluate(input: PolicyInput): Promise<PolicyDecision>;
  health(): Promise<PdpHealth>;
  close(): Promise<void>;
}

export interface PdpHealth {
  status: "healthy" | "degraded" | "unavailable";
  bundleId?: string;
  bundleRevision?: string;
  lastDecisionAt?: string;
  mode: "embedded" | "ipc" | "embedded-opa" | "embedded-baseline";
}

export interface PdpError {
  code: "PDP_UNAVAILABLE" | "BUNDLE_INVALID" | "EVALUATION_ERROR" | "TIMEOUT";
  message: string;
}

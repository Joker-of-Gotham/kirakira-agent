import { basename, join } from "node:path";
import { homedir } from "node:os";

import {
  ApprovalManager,
  defaultApprovalsDirectory,
  createPdpClient,
} from "@kirakira/policy-engine";
import type { PdpHealth } from "@kirakira/policy-engine";

import { loadConfig } from "../config/loader.js";
import { fileExists } from "../lib/ledger-utils.js";

export interface PolicyStatusData {
  bundleId: string;
  signatureStatus: string;
  transport: "embedded" | "ipc";
  pdpHealthStatus: PdpHealth["status"] | "unknown";
  pdpHealthy: boolean;
  airiskLatencyMsDisplay: string;
  airiskLatencyP50Ms: number | null;
  pendingApprovals: number;
  persistedApprovalRecords: number;
  approvedRecordsCount: number;
  cachedApprovalsHint: string;
  sandboxProfile: string;
  approvalsStorePath: string;
  failClosedLikely: boolean;
}

function sandboxProfileGuess(mode?: string, network?: string): string {
  switch (mode) {
    case "none":
      return "plan-only";
    case "host":
      return network === "full" ? "microvm-highrisk" : "workspace-write";
    case "container":
    default:
      return network === "full" ? "workspace-write-net" : "workspace-write";
  }
}

/**
 * PDP + approvals snapshot reused by CLI `policy status` and TUI hooks.
 */
export async function collectPolicyStatusData(options: {
  workspaceRoot?: string;
} = {}): Promise<PolicyStatusData> {
  const cwd = options.workspaceRoot ?? process.cwd();
  const resolvedConfig = await loadConfig({ workspaceRoot: cwd });

  const defaultBundle = join(homedir(), ".kirakira", "policy.bundle.json");
  let bundleId = basename(defaultBundle);
  let transport: PolicyStatusData["transport"] = "embedded";
  let pdpHealthStatus: PolicyStatusData["pdpHealthStatus"] = "unknown";

  try {
    const pdpProbe = await createPdpClient();
    const health = await pdpProbe.health();
    await pdpProbe.close();
    transport = health.mode === "ipc" ? "ipc" : "embedded";
    if (health.bundleId) bundleId = health.bundleId;
    pdpHealthStatus = health.status;
  } catch {
    pdpHealthStatus = "unknown";
  }

  const sigNextToBundle =
    transport === "ipc"
      ? "see remote PDP bundle artifact"
      : (await fileExists(join(homedir(), ".kirakira", ".signatures.json")))
        ? "~/.kirakira/.signatures.json present"
        : (await fileExists(`${defaultBundle}.signatures.json`))
          ? "sibling signatures file present beside policy.bundle.json"
          : "no local .signatures.json — run verify-bundle";

  const approvals = new ApprovalManager(defaultApprovalsDirectory());
  const pending = await approvals.listPending();
  const all = await approvals.listAll();

  const cachedHint =
    "process-local ApprovalCache only (not inspectable offline); ephemeral per agent run.";

  const approvedCount = all.filter((r) => r.status === "approved").length;

  const failClosedLikely =
    pdpHealthStatus === "unknown" ||
    pdpHealthStatus === "unavailable" ||
    pdpHealthStatus === "degraded";

  return {
    bundleId,
    signatureStatus: sigNextToBundle,
    transport,
    pdpHealthStatus,
    pdpHealthy: pdpHealthStatus === "healthy",
    airiskLatencyMsDisplay: "n/a (AIRISK service not queried by CLI baseline)",
    airiskLatencyP50Ms: null,
    pendingApprovals: pending.length,
    persistedApprovalRecords: all.length,
    approvedRecordsCount: approvedCount,
    cachedApprovalsHint: cachedHint,
    sandboxProfile: sandboxProfileGuess(
      resolvedConfig.agentToml.sandbox?.mode,
      resolvedConfig.agentToml.sandbox?.network,
    ),
    approvalsStorePath: approvals.storePath,
    failClosedLikely,
  };
}

import { useState, useCallback, useEffect } from "react";
import {
  collectPolicyStatusData,
  type PolicyStatusData,
} from "../../policy/policy-status-data.js";

interface UsePolicyStatusOptions {
  workspaceRoot?: string;
  pollMs?: number;
}

interface UsePolicyStatusReturn extends PolicyStatusData {
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const empty: PolicyStatusData = {
  bundleId: "—",
  signatureStatus: "—",
  transport: "embedded",
  pdpHealthStatus: "unknown",
  pdpHealthy: false,
  airiskLatencyMsDisplay: "—",
  airiskLatencyP50Ms: null,
  pendingApprovals: 0,
  persistedApprovalRecords: 0,
  approvedRecordsCount: 0,
  cachedApprovalsHint: "—",
  sandboxProfile: "—",
  approvalsStorePath: "—",
  failClosedLikely: true,
};

/**
 * PDP / bundle / approvals headline status for Ink panels (shared with CLI policy status collector).
 */
export function usePolicyStatus(
  opts: UsePolicyStatusOptions = {},
): UsePolicyStatusReturn {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PolicyStatusData>(empty);

  const refetch = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const summary = await collectPolicyStatusData({
        workspaceRoot: opts.workspaceRoot,
      });
      setData(summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [opts.workspaceRoot]);

  useEffect(() => {
    void refetch();
    if (!opts.pollMs || opts.pollMs <= 0) return;
    const t = setInterval(() => {
      void refetch();
    }, opts.pollMs);
    return (): void => {
      clearInterval(t);
    };
  }, [refetch, opts.pollMs]);

  return {
    ...data,
    loading,
    error,
    refetch,
  };
}

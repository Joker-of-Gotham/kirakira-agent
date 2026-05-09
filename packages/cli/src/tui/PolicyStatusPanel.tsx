import React from "react";
import { Box, Text } from "ink";
import { usePolicyStatus } from "./hooks/usePolicyStatus.js";

interface PolicyStatusPanelProps {
  workspaceRoot?: string;
  pollMs?: number;
}

/** Active bundle/PDP/AIRISK/approvals sandbox posture for dashboards or overlays. */
export function PolicyStatusPanel({
  workspaceRoot,
  pollMs,
}: PolicyStatusPanelProps): React.ReactElement {
  const s = usePolicyStatus({ workspaceRoot, pollMs });

  const sigColor =
    s.signatureStatus.includes("present") ||
    s.signatureStatus.includes("remote")
      ? "green"
      : "yellow";

  const pdpColor =
    s.pdpHealthStatus === "unavailable"
      ? "red"
      : s.pdpHealthStatus === "healthy"
        ? "green"
        : s.pdpHealthStatus === "degraded"
          ? "yellow"
          : "white";

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
      marginX={1}
    >
      <Text bold color="cyan">
        ● Policy posture
      </Text>

      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text bold>Bundle: </Text>
          <Text color="white">{s.bundleId}</Text>
        </Box>
        <Box>
          <Text bold>Signature: </Text>
          <Text color={sigColor}>{s.signatureStatus}</Text>
        </Box>
        <Box>
          <Text bold>PDP: </Text>
          <Text color="white">{s.transport}</Text>
          <Text> · </Text>
          <Text color={pdpColor}>{s.pdpHealthStatus}</Text>
        </Box>
        <Box>
          <Text bold>AIRISK: </Text>
          <Text>{s.airiskLatencyMsDisplay}</Text>
          {s.airiskLatencyP50Ms != null && (
            <Text dimColor>{` · p50 ${String(s.airiskLatencyP50Ms)}ms`}</Text>
          )}
        </Box>
        <Box>
          <Text bold>Approvals: </Text>
          <Text color={s.pendingApprovals > 0 ? "yellow" : "green"}>
            pending {String(s.pendingApprovals)}
          </Text>
          <Text dimColor>
            {" "}
            · persisted {String(s.persistedApprovalRecords)} ({String(s.approvedRecordsCount)} approved)
          </Text>
        </Box>
        <Box>
          <Text bold>Cache hint: </Text>
          <Text dimColor>{s.cachedApprovalsHint}</Text>
        </Box>
        <Box>
          <Text bold>Sandbox profile: </Text>
          <Text color="yellow">{s.sandboxProfile}</Text>
        </Box>
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Approvals dir: </Text>
          <Text dimColor>{s.approvalsStorePath}</Text>
        </Box>
        {s.failClosedLikely && (
          <Box marginTop={1}>
            <Text bold color="red">
              Fail-closed:
            </Text>
            <Text>
              PDP degraded/unavailable — high-risk invokes may tighten or deny.
            </Text>
          </Box>
        )}
        {s.error && (
          <Box marginTop={1}>
            <Text color="red">Error: {s.error}</Text>
          </Box>
        )}
        {s.loading && (
          <Box marginTop={1}>
            <Text dimColor>Refreshing…</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}

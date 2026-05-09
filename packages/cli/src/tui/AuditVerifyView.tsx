import React from "react";
import { Box, Text } from "ink";

import type { AuditVerifyHookState } from "./hooks/useAuditVerify.js";

interface AuditVerifyViewProps extends AuditVerifyHookState {
  compact?: boolean;
}

function chainTone(
  chainStatus: AuditVerifyHookState["chainStatus"],
): "green" | "red" | "yellow" | "gray" | "cyan" {
  switch (chainStatus) {
    case "OK":
      return "green";
    case "ERROR":
      return "red";
    case "EMPTY":
      return "gray";
    default:
      return "yellow";
  }
}

/** Ledger segment linkage + checkpoint row for SOC-style spot checks in the CLI. */
export function AuditVerifyView({
  compact,
  ...v
}: AuditVerifyViewProps): React.ReactElement {
  const line = `${v.segmentId ?? "—"} · ${String(v.entryCount ?? "—")} entries`;

  if (compact) {
    return (
      <Box flexDirection="row">
        <Box marginRight={1}>
          <Text bold>audit:</Text>
        </Box>
        <Box marginRight={1}>
          <Text color={chainTone(v.chainStatus)}>{v.chainStatus}</Text>
        </Box>
        <Text dimColor>{line}</Text>
      </Box>
    );
  }

  let cpLine = "—";
  if (
    v.checkpointSignatureValid === undefined &&
    !v.checkpointSigner &&
    !v.checkpointSignedAt
  )
    cpLine = "none parsed";
  else if (v.checkpointSignatureValid !== undefined)
    cpLine =
      `${v.checkpointSignedAt ?? "—"} (${v.checkpointSigner ?? "?"}) sig=${v.checkpointSignatureValid ? "valid" : "invalid"}`;
  else
    cpLine =
      `${v.checkpointSignedAt ?? "—"} (${v.checkpointSigner ?? "?"}) — no verifier key`;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="green"
      paddingX={2}
      paddingY={1}
      marginX={1}
    >
      <Text bold color="green">
        ✔ Audit ledger
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text bold>Segment: </Text>
          <Text>{v.segmentId ?? "—"}</Text>
          <Text dimColor> ({String(v.entryCount ?? 0)} events)</Text>
        </Box>
        <Box>
          <Text bold>Chain status: </Text>
          <Text color={chainTone(v.chainStatus)}>{v.chainStatus}</Text>
        </Box>
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Checkpoint: </Text>
          <Text dimColor>{cpLine}</Text>
        </Box>
        <Box marginTop={1}>
          <Text bold>Remote anchor: </Text>
          <Text dimColor>{v.remoteAnchorStatus}</Text>
        </Box>
        {v.loading && (
          <Box marginTop={1}>
            <Text dimColor>Refreshing…</Text>
          </Box>
        )}
        {v.error && (
          <Box marginTop={1}>
            <Text color="red">Verify error: {v.error}</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}

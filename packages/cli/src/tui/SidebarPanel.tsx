import React from "react";
import { Box, Text } from "ink";
import type { TuiTheme } from "./theme.js";

interface SidebarPanelProps {
  width: number;
  theme: TuiTheme;
  sessionId: string;
  tasksRunning: number;
  tasksQueued: number;
  subagentRunning: number;
  mcpCount: number;
  skillCount: number;
  memoryHits: number;
  pendingApprovals: number;
  traceSpansOpen: number;
}

function shorten(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 3))}...` : value;
}

function Row({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}): React.ReactElement {
  return (
    <Box justifyContent="space-between">
      <Text color={color}>{label}</Text>
      <Text color={color}>{value}</Text>
    </Box>
  );
}

export function SidebarPanel({
  width,
  theme,
  sessionId,
  tasksRunning,
  tasksQueued,
  subagentRunning,
  mcpCount,
  skillCount,
  memoryHits,
  pendingApprovals,
  traceSpansOpen,
}: SidebarPanelProps): React.ReactElement {
  return (
    <Box
      width={Math.max(24, width)}
      flexDirection="column"
      paddingX={2}
      paddingY={1}
      marginRight={1}
      backgroundColor={theme.colors.surfaceSunken}
    >
      <Text color={theme.colors.fg} bold>Workspace</Text>
      <Text color={theme.colors.textTertiary}>{shorten(sessionId, Math.max(12, width - 4))}</Text>

      <Box marginTop={1} flexDirection="column">
        <Text color={theme.colors.textSecondary} bold>Activity</Text>
        <Row label="running" value={tasksRunning} color={tasksRunning > 0 ? theme.colors.warning : theme.colors.textTertiary} />
        <Row label="queued" value={tasksQueued} color={theme.colors.textTertiary} />
        <Row label="subagents" value={subagentRunning} color={theme.colors.textTertiary} />
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color={theme.colors.textSecondary} bold>Context</Text>
        <Row label="mcp" value={mcpCount} color={theme.colors.textTertiary} />
        <Row label="skills" value={skillCount} color={theme.colors.textTertiary} />
        <Row label="memory" value={memoryHits} color={theme.colors.textTertiary} />
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color={theme.colors.textSecondary} bold>Governance</Text>
        <Row label="approvals" value={pendingApprovals} color={pendingApprovals > 0 ? theme.colors.approval : theme.colors.textTertiary} />
        <Row label="spans" value={traceSpansOpen} color={theme.colors.textTertiary} />
      </Box>
    </Box>
  );
}
